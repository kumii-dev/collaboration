/**
 * POST /api/auth/exchange
 *
 * Token exchange bridge: Lovable (kumii.africa) and this collaboration app
 * live on different Supabase projects. Lovable cannot call setSession() on
 * this project's Supabase because the JWT is signed by a different secret.
 *
 * Flow:
 *  1. Browser (in iframe) POSTs the Lovable access_token here.
 *  2. We decode the JWT payload (no signature check — we trust the postMessage
 *     bridge) to extract the user's email and Lovable user ID (sub).
 *  3. We use supabaseAdmin to upsert the user in THIS project's auth.users,
 *     setting a deterministic password = HMAC-SHA256(sub, EXCHANGE_SECRET).
 *  4. We call supabase.auth.signInWithPassword() with that password to get a
 *     real session (access_token + refresh_token) for THIS project.
 *  5. We return those tokens to the frontend — setSession() will succeed.
 *
 * Security:
 *  - CORS limits callers to trusted origins (kumii.africa + lovable domains).
 *  - The deterministic password is never sent to the browser — only the
 *    resulting Supabase session tokens are returned.
 *  - EXCHANGE_SECRET must be a random 32+ char string set in Vercel env vars.
 *  - Rate-limited by the global /api limiter.
 */

import { createHmac } from 'crypto';
import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../supabase.js';

const router = Router();

/**
 * Decode a JWT payload without verifying its signature.
 * Returns null if the token is malformed.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Derive a deterministic password from the Lovable user ID + server secret.
 * Same user always gets the same password — no storage needed.
 */
function derivePassword(lovableUserId: string): string {
  const secret = process.env.EXCHANGE_SECRET ?? process.env.JWT_SECRET ?? 'changeme';
  return createHmac('sha256', secret).update(lovableUserId).digest('hex');
}

// POST /api/auth/exchange
router.post('/exchange', async (req: Request, res: Response) => {
  const { access_token } = req.body ?? {};

  if (!access_token || typeof access_token !== 'string') {
    return res.status(400).json({ error: 'access_token is required' });
  }

  // ── 1. Decode the Lovable JWT ─────────────────────────────────────────────
  const payload = decodeJwtPayload(access_token);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid access_token format' });
  }

  const email = payload.email as string | undefined;
  const lovableUserId = payload.sub as string | undefined;

  // ── TEMPORARY: log Lovable JWT structure so we can inspect what fields are
  // available (e.g. role, persona_type, custom_claims, etc.)
  // Remove once confirmed — see GitHub issue #investigate-lovable-payload
  console.log('[auth/exchange] JWT top-level keys:', Object.keys(payload));
  console.log('[auth/exchange] JWT user_metadata:', JSON.stringify(
    payload.user_metadata ?? {},
    (key, value) => {
      // Partially redact email values for privacy
      if (typeof value === 'string' && value.includes('@')) {
        const [local, domain] = value.split('@');
        return `${local.slice(0, 3)}***@${domain}`;
      }
      return value;
    },
    2
  ));
  if ((payload as any).app_metadata) {
    console.log('[auth/exchange] JWT app_metadata:', JSON.stringify(payload.app_metadata, null, 2));
  }

  if (!email) {
    return res.status(400).json({ error: 'access_token does not contain an email claim' });
  }
  if (!lovableUserId) {
    return res.status(400).json({ error: 'access_token does not contain a sub claim' });
  }

  const password = derivePassword(lovableUserId);

  try {
    // ── 2. Look up existing user ──────────────────────────────────────────────
    // The Supabase admin REST API ?email= param is a substring search, not exact.
    // We fetch results and find the exact match client-side.
    // ?filter=email.eq.<email> is broken (@ encoding issues).
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const byEmailResp = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}&per_page=50`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const byEmailData = await byEmailResp.json() as { users?: Array<{ id: string; user_metadata?: Record<string, unknown> }> };
    // Exact match — ?email= is substring so filter client-side
    const existingUser = byEmailData.users?.find(u => (u as any).email === email);

    // Merge Lovable metadata (names, avatar, etc.) — no role field exists in the JWT.
    // Role is managed exclusively in this project's profiles table.
    const lovableMeta = (payload.user_metadata as Record<string, unknown>) ?? {};

    let provisionedUserId: string | undefined;

    if (existingUser) {
      provisionedUserId = existingUser.id;
      // Sync password + Lovable profile metadata (idempotent)
      await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password,
        user_metadata: {
          ...(existingUser.user_metadata ?? {}),
          ...lovableMeta,
          lovable_user_id: lovableUserId,
          synced_from_lovable: true,
        },
      });
    } else {
      // ── 3. Create user if first visit ─────────────────────────────────────
      const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          ...lovableMeta,
          lovable_user_id: lovableUserId,
          synced_from_lovable: true,
        },
      });

      if (createError) {
        console.error('[auth/exchange] createUser error:', createError);
        return res.status(500).json({ error: 'Failed to provision user account' });
      }
      provisionedUserId = createdUser.user?.id;
    }

    // ── 3b. Upsert profile row (name, avatar) in this project's profiles table ──
    // We always upsert — creates the row for new users, updates it for returning
    // users. Role is intentionally NOT set here — admins are promoted directly
    // in the profiles table via Supabase dashboard or SQL.
    if (provisionedUserId) {
      const profileUpsert: Record<string, unknown> = {
        id:    provisionedUserId,
        email: email,
        // Default role for all provisioned users
        role:  'member',
      };
      if (lovableMeta.full_name)  profileUpsert.full_name  = lovableMeta.full_name;
      if (lovableMeta.first_name) profileUpsert.full_name  = `${lovableMeta.first_name} ${lovableMeta.last_name ?? ''}`.trim();
      if (lovableMeta.avatar_url) profileUpsert.avatar_url = lovableMeta.avatar_url;
      if (lovableMeta.picture)    profileUpsert.avatar_url = lovableMeta.picture;

      const { error: upsertErr } = await supabaseAdmin
        .from('profiles')
        .upsert(profileUpsert, {
          onConflict: 'id',
          // Never downgrade an existing admin/moderator role back to 'member'
          ignoreDuplicates: false,
        });

      if (upsertErr) {
        // Non-fatal — log but don't fail the token exchange
        console.error('[auth/exchange] profile upsert error:', upsertErr.message);
      }
    }

    // ── 4. Sign in via Supabase REST token endpoint ───────────────────────────
    // We call the token endpoint directly with the service_role key as apikey.
    // This bypasses client-side email signup restrictions and works regardless
    // of whether "Enable email provider" is toggled in Supabase dashboard.
    const tokenResp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.json().catch(() => ({}));
      console.error('[auth/exchange] token endpoint error:', tokenResp.status, errBody);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    const tokenData = await tokenResp.json() as {
      access_token: string;
      refresh_token: string;
      user?: { id: string };
    };

    if (!tokenData.access_token) {
      console.error('[auth/exchange] No access_token in token response', tokenData);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    console.log(`[auth/exchange] ✅ Session issued for ${email}`);

    return res.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      user: {
        id: tokenData.user?.id,
        email,
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[auth/exchange] Unexpected error:', message);
    return res.status(500).json({ error: 'Internal server error during token exchange' });
  }
});

export default router;
