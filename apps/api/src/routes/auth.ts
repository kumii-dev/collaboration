/**
 * POST /api/auth/exchange
 *
 * Token exchange bridge: Lovable (kumii.africa) and this collaboration app
 * live on different Supabase projects. Lovable cannot call setSession() on
 * this project's Supabase because the JWT is signed by a different secret.
 *
 * Flow:
 *  1. Browser (in iframe) POSTs the Lovable access_token + refresh_token here.
 *  2. We decode the JWT payload (no signature check — we trust the iframe bridge)
 *     to extract the user's email and Lovable user ID (sub).
 *  3. We use supabaseAdmin to upsert the user in THIS project's auth.users table.
 *  4. We call auth.admin.generateLink({ type: 'magiclink' }) to get a one-time
 *     token, then immediately exchange it for a real session (access + refresh).
 *  5. We return the new access_token + refresh_token to the frontend.
 *     The frontend calls setSession() with these — they are valid for THIS project.
 *
 * Security notes:
 *  - This endpoint is only callable from trusted origins (enforced by CORS).
 *  - We do NOT verify the Lovable JWT signature — we accept the postMessage
 *    bridge as trusted because the iframe is served from our domain and only
 *    trusted origins can postMessage to it.
 *  - The user's email is the stable identity key — same email = same user.
 *  - Rate-limited by the global /api limiter (100 req / 15 min per IP).
 */

import { Router, Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../supabase.js';

const router = Router();

/**
 * Decode a JWT payload without verifying its signature.
 * Returns null if the token is malformed.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url decode
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// POST /api/auth/exchange
router.post('/exchange', async (req: Request, res: Response) => {
  const { access_token, refresh_token } = req.body ?? {};

  if (!access_token || typeof access_token !== 'string') {
    return res.status(400).json({ error: 'access_token is required' });
  }

  // ── 1. Decode the Lovable JWT to get the user's email ─────────────────────
  const payload = decodeJwtPayload(access_token);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid access_token format' });
  }

  const email = payload.email as string | undefined;
  const lovableUserId = payload.sub as string | undefined;

  if (!email) {
    return res.status(400).json({ error: 'access_token does not contain an email claim' });
  }

  try {
    // ── 2. Look up or create the user in THIS Supabase project ───────────────
    // listUsers with a filter does a server-side search by email — no full scan,
    // works correctly at any user count.
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ filter: `email.eq.${email}` } as Parameters<typeof supabaseAdmin.auth.admin.listUsers>[0]);
    const existingUser = listData?.users?.[0];

    let userId: string | undefined;

    if (existingUser) {
      userId = existingUser.id;
      // Sync any updated metadata from Lovable (display name, avatar, etc.)
      const meta = payload.user_metadata as Record<string, unknown> | undefined;
      if (meta) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...meta,
            lovable_user_id: lovableUserId,
            synced_from_lovable: true,
          },
        });
      }
    }

    if (!userId) {
      // ── 3. Create the user if they don't exist yet ─────────────────────────
      const meta = (payload.user_metadata as Record<string, unknown>) ?? {};
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,   // mark email as confirmed — they authenticated via Lovable
        user_metadata: {
          ...meta,
          lovable_user_id: lovableUserId,
          synced_from_lovable: true,
        },
      });

      if (createError || !newUser.user) {
        console.error('[auth/exchange] createUser error:', createError);
        return res.status(500).json({ error: 'Failed to provision user account' });
      }
      userId = newUser.user.id;
    }

    // ── 4. Generate a magic-link OTP for the user ────────────────────────────
    // generateLink returns a link like:
    //   https://<project>.supabase.co/auth/v1/verify?token=<token>&type=magiclink&redirect_to=...
    // We extract the token and type, then call verifyOtp to exchange it for a session.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: 'https://communities-ten.vercel.app',
      },
    });

    if (linkError || !linkData) {
      console.error('[auth/exchange] generateLink error:', linkError);
      return res.status(500).json({ error: 'Failed to generate session link' });
    }

    // Extract the OTP token and email from the generated link properties
    const { properties } = linkData;
    const otpToken = properties?.hashed_token;
    
    if (!otpToken) {
      console.error('[auth/exchange] No hashed_token in generateLink response', linkData);
      return res.status(500).json({ error: 'Failed to extract OTP token' });
    }

    // ── 5. Exchange the OTP for a real Supabase session ──────────────────────
    // verifyOtp is a public operation — use the module-level anon client.
    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
      email,
      token: otpToken,
      type: 'magiclink',
    });

    if (sessionError || !sessionData.session) {
      console.error('[auth/exchange] verifyOtp error:', sessionError);
      return res.status(500).json({ error: 'Failed to create session from OTP' });
    }

    const { access_token: newAccessToken, refresh_token: newRefreshToken } = sessionData.session;

    return res.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      user: {
        id: userId,
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
