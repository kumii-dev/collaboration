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
import { authenticate, AuthRequest } from '../middleware/auth.js';

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

    // ── 3b. Sync profile row — Lovable is the source of truth ────────────────
    // On every login, Lovable data ALWAYS wins for all profile fields.
    // The only exception is `role` — that is managed exclusively in this
    // project's database and must never be overwritten by Lovable.
    if (provisionedUserId) {
      // Resolve full_name from whatever field Lovable happens to use
      const lovableFullName =
        (lovableMeta.full_name  as string | undefined)?.trim() ||
        (lovableMeta.name       as string | undefined)?.trim() ||
        ((lovableMeta.first_name as string | undefined)
          ? `${lovableMeta.first_name} ${lovableMeta.last_name ?? ''}`.trim()
          : undefined);

      // Resolve avatar from whichever field is present
      const lovableAvatar =
        (lovableMeta.avatar_url as string | undefined) ||
        (lovableMeta.picture    as string | undefined) ||
        undefined;

      // All other profile fields Lovable may carry
      const lovableCompany  = (lovableMeta.company  as string | undefined)?.trim() || undefined;
      const lovableSector   = (lovableMeta.sector   as string | undefined)?.trim() || undefined;
      const lovableBio      = (lovableMeta.bio      as string | undefined)?.trim() || undefined;
      const lovableLocation = (lovableMeta.location as string | undefined)?.trim() || undefined;
      const lovablePhone    = (lovableMeta.phone    as string | undefined)?.trim() || undefined;
      // Lovable may signal a verified identity (e.g. KYC or email-verified flag)
      const lovableVerified =
        typeof lovableMeta.verified === 'boolean' ? lovableMeta.verified :
        typeof lovableMeta.email_verified === 'boolean' ? lovableMeta.email_verified :
        undefined;

      // Build the sync payload — include every field Lovable sent a value for.
      // Fields absent from Lovable metadata are left as-is in the database.
      // `role` is NEVER included — it is immutable from this path.
      const profileSync: Record<string, unknown> = { email };
      if (lovableFullName !== undefined) profileSync.full_name  = lovableFullName;
      if (lovableAvatar   !== undefined) profileSync.avatar_url = lovableAvatar;
      if (lovableCompany  !== undefined) profileSync.company    = lovableCompany;
      if (lovableSector   !== undefined) profileSync.sector     = lovableSector;
      if (lovableBio      !== undefined) profileSync.bio        = lovableBio;
      if (lovableLocation !== undefined) profileSync.location   = lovableLocation;
      if (lovablePhone    !== undefined) profileSync.phone      = lovablePhone;
      if (lovableVerified !== undefined) profileSync.verified   = lovableVerified;

      if (!existingUser) {
        // New user — also set the default role on first insert
        profileSync.id   = provisionedUserId;
        profileSync.role = 'entrepreneur';

        const { error: insertErr } = await supabaseAdmin
          .from('profiles')
          .upsert(profileSync, { onConflict: 'id', ignoreDuplicates: false });

        if (insertErr) {
          console.error('[auth/exchange] profile insert error:', insertErr.message);
        }
      } else {
        // Returning user — always overwrite with Lovable's latest data.
        // Role is excluded from profileSync above, so it is safe to UPDATE directly.
        const { error: updateErr } = await supabaseAdmin
          .from('profiles')
          .update(profileSync)
          .eq('id', provisionedUserId);

        if (updateErr) {
          console.error('[auth/exchange] profile update error:', updateErr.message);
        }
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

    // Fire-and-forget: audit log the login event
    if (provisionedUserId) {
      setImmediate(async () => {
        try {
          await supabaseAdmin.rpc('create_audit_log', {
            p_user_id:       provisionedUserId,
            p_event_type:    'login',
            p_resource_type: 'profiles',
            p_resource_id:   provisionedUserId,
            p_details:       { method: 'token_exchange', source: 'lovable' },
          });
        } catch {
          // Non-fatal
        }
      });
    }

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

/**
 * POST /api/auth/sync
 * Lovable server-side webhook — push updated user_metadata without requiring
 * the user to be actively logged in.
 *
 * Body: { user_id: string (Lovable sub), user_metadata: Record<string,unknown> }
 * Secured by X-Sync-Secret header == EXCHANGE_SECRET env var.
 *
 * This lets Lovable push profile changes (KYC approval, sector updates, etc.)
 * to the collaboration project the moment they happen, rather than waiting for
 * the next /exchange or /refresh call.
 */
router.post('/sync', async (req: Request, res: Response) => {
  // Auth — same secret used by /exchange
  const syncSecret = process.env.EXCHANGE_SECRET ?? process.env.JWT_SECRET ?? 'changeme';
  const provided   = req.headers['x-sync-secret'] ?? req.headers['authorization']?.toString().replace('Bearer ', '');
  if (provided !== syncSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { user_id: lovableUserId, user_metadata: lovableMeta } = req.body ?? {};

  if (!lovableUserId || typeof lovableUserId !== 'string') {
    return res.status(400).json({ error: 'user_id is required' });
  }
  if (!lovableMeta || typeof lovableMeta !== 'object') {
    return res.status(400).json({ error: 'user_metadata is required' });
  }

  try {
    // Resolve the collaboration-project user by matching the stored lovable_user_id in auth.users metadata
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Look up user by email if present; otherwise scan by lovable_user_id
    const meta = lovableMeta as Record<string, unknown>;
    const email = meta.email as string | undefined;

    let collaborationUserId: string | undefined;

    if (email) {
      const resp = await fetch(
        `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}&per_page=50`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      const data = await resp.json() as { users?: Array<{ id: string; user_metadata?: Record<string, unknown> }> };
      const match = data.users?.find(u => (u as any).email === email);
      collaborationUserId = match?.id;
    }

    if (!collaborationUserId) {
      return res.status(404).json({ error: 'User not found in collaboration project' });
    }

    // Build profile sync payload — same resolution logic as /exchange
    const lovableFullName =
      (meta.full_name  as string | undefined)?.trim() ||
      (meta.name       as string | undefined)?.trim() ||
      ((meta.first_name as string | undefined)
        ? `${meta.first_name} ${meta.last_name ?? ''}`.trim()
        : undefined);

    const lovableAvatar =
      (meta.avatar_url as string | undefined) ||
      (meta.picture    as string | undefined) ||
      undefined;

    const lovableVerified =
      typeof meta.verified === 'boolean'       ? meta.verified :
      typeof meta.email_verified === 'boolean' ? meta.email_verified :
      undefined;

    const profileSync: Record<string, unknown> = {};
    if (email                !== undefined) profileSync.email      = email;
    if (lovableFullName      !== undefined) profileSync.full_name  = lovableFullName;
    if (lovableAvatar        !== undefined) profileSync.avatar_url = lovableAvatar;
    if (lovableVerified      !== undefined) profileSync.verified   = lovableVerified;

    for (const col of ['company', 'sector', 'bio', 'location', 'phone'] as const) {
      const v = (meta[col] as string | undefined)?.trim();
      if (v !== undefined) profileSync[col] = v;
    }

    if (Object.keys(profileSync).length > 0) {
      const { error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update({ ...profileSync, updated_at: new Date().toISOString() })
        .eq('id', collaborationUserId);

      if (updateErr) {
        console.error('[auth/sync] profile update error:', updateErr.message);
        return res.status(500).json({ error: 'Failed to sync profile' });
      }
    }

    console.log(`[auth/sync] ✅ Profile synced for user ${collaborationUserId}`);
    return res.json({ success: true, data: { user_id: collaborationUserId, fields_synced: Object.keys(profileSync) } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[auth/sync] Unexpected error:', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

/**
 * GET /api/auth/me
 * Returns the fully Lovable-synced profile for the currently authenticated user.
 * This is the canonical "who am I?" endpoint — always reflects the latest
 * data written by the most recent /exchange call (Lovable is source of truth).
 *
 * Returns the same rich shape as GET /api/users/me but is mounted on /api/auth
 * so it's accessible before any user-scoped routes are set up on the frontend.
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const [profileRes, moderationRes] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select(
          'id, email, full_name, avatar_url, role, verified, company, bio, sector, location, phone, ' +
          'reputation_score, consent_marketing, consent_data_processing, last_seen_at, created_at, updated_at'
        )
        .eq('id', userId)
        .single(),

      // Check for an active suspension or ban.
      // Build the timestamp filter separately to avoid issues with '+' in ISO strings
      // being misinterpreted by PostgREST URL parsing.
      supabaseAdmin
        .from('moderation_actions')
        .select('action_type, reason, expires_at')
        .eq('target_user_id', userId)
        .in('action_type', ['suspend', 'ban'])
        .or(`expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileRes.error || !profileRes.data) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const action = moderationRes.data;
    const profileData = profileRes.data as unknown as Record<string, unknown>;
    const profile = {
      ...profileData,
      is_suspended: action?.action_type === 'suspend',
      is_banned:    action?.action_type === 'ban',
      ...(action ? {
        moderation_reason:     action.reason ?? null,
        moderation_expires_at: action.expires_at ?? null,
      } : {}),
    };

    return res.json({ success: true, data: profile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[auth/me] error:', message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/refresh
 * Accepts a Lovable access_token (same payload as /exchange) together with
 * the current collaboration refresh_token and returns a fresh session.
 *
 * Why this exists:
 *  - Lovable JWTs expire. When the frontend detects a 401 it re-POSTs the
 *    fresh Lovable token here instead of calling /exchange again (which
 *    performs an expensive admin API round-trip).
 *  - We first try the Supabase refresh-token path (cheap). If that succeeds
 *    we also re-sync the updated Lovable metadata so the profile stays fresh.
 *  - If the refresh_token itself has expired, we fall back to a full
 *    signInWithPassword (same as /exchange step 4) so the frontend always
 *    gets a usable session back.
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { access_token, refresh_token } = req.body ?? {};

  if (!access_token || typeof access_token !== 'string') {
    return res.status(400).json({ error: 'access_token is required' });
  }

  // Decode Lovable token (no signature check — same trust model as /exchange)
  const payload = decodeJwtPayload(access_token);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid access_token format' });
  }

  const email           = payload.email as string | undefined;
  const lovableUserId   = payload.sub   as string | undefined;
  const lovableMeta     = (payload.user_metadata as Record<string, unknown>) ?? {};

  if (!email || !lovableUserId) {
    return res.status(400).json({ error: 'access_token must contain email and sub claims' });
  }

  const supabaseUrl  = process.env.SUPABASE_URL!;
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    type SessionPayload = { access_token: string; refresh_token: string; user?: { id: string } };
    let sessionData: SessionPayload | null = null;

    // ── 1. Try refresh-token flow (fast path) ──────────────────────────────
    if (refresh_token && typeof refresh_token === 'string') {
      const refreshResp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ refresh_token }),
      });

      if (refreshResp.ok) {
        const body = await refreshResp.json() as SessionPayload;
        if (body?.access_token) sessionData = body;
      }
    }

    // ── 2. Fall back to password sign-in (same as /exchange step 4) ────────
    if (!sessionData) {
      const password    = derivePassword(lovableUserId);
      const tokenResp   = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ email, password }),
      });

      if (!tokenResp.ok) {
        const errBody = await tokenResp.json().catch(() => ({}));
        console.error('[auth/refresh] password fallback failed:', tokenResp.status, errBody);
        return res.status(401).json({ error: 'Session refresh failed. Please sign in again.' });
      }

      sessionData = await tokenResp.json() as SessionPayload;
    }

    if (!sessionData?.access_token) {
      return res.status(401).json({ error: 'Could not obtain a session token' });
    }

    // ── 3. Re-sync Lovable profile metadata (fire-and-forget) ──────────────
    // Lovable is always source of truth — refresh is another opportunity to sync.
    setImmediate(async () => {
      try {
        const userId = sessionData!.user?.id;
        if (!userId) return;

        const lovableFullName =
          (lovableMeta.full_name  as string | undefined)?.trim() ||
          (lovableMeta.name       as string | undefined)?.trim() ||
          ((lovableMeta.first_name as string | undefined)
            ? `${lovableMeta.first_name} ${lovableMeta.last_name ?? ''}`.trim()
            : undefined);

        const lovableAvatar =
          (lovableMeta.avatar_url as string | undefined) ||
          (lovableMeta.picture    as string | undefined) ||
          undefined;

        const profileSync: Record<string, unknown> = { email };
        if (lovableFullName !== undefined)               profileSync.full_name  = lovableFullName;
        if (lovableAvatar   !== undefined)               profileSync.avatar_url = lovableAvatar;
        const extras: Array<[string, string]> = [
          ['company', 'company'], ['sector', 'sector'], ['bio', 'bio'],
          ['location', 'location'], ['phone', 'phone'],
        ];
        for (const [meta, col] of extras) {
          const v = (lovableMeta[meta] as string | undefined)?.trim();
          if (v) profileSync[col] = v;
        }
        if (typeof lovableMeta.verified === 'boolean')       profileSync.verified = lovableMeta.verified;
        else if (typeof lovableMeta.email_verified === 'boolean') profileSync.verified = lovableMeta.email_verified;

        await supabaseAdmin.from('profiles').update(profileSync).eq('id', userId);
      } catch { /* non-fatal */ }
    });

    return res.json({
      access_token:  sessionData.access_token,
      refresh_token: sessionData.refresh_token,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[auth/refresh] Unexpected error:', message);
    return res.status(500).json({ error: 'Internal server error during token refresh' });
  }
});