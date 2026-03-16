# Lovable ↔ Collaboration App Integration

> **Status**: Production — working as of March 2026  
> **Deployment**: `https://communities-ten.vercel.app` (embedded inside `https://kumii.africa`)

---

## Overview

The Kumii collaboration app runs as an **iframe** embedded inside the Lovable-hosted parent app (`kumii.africa`). Because they live on **different Supabase projects**, standard `setSession()` token injection does not work — the JWT is signed by Lovable's Supabase secret and will be rejected by this project's Supabase.

The solution is a **server-side token exchange bridge**:

```
kumii.africa (Lovable)
  │
  │  postMessage({ type: 'KUMII_SESSION', access_token, refresh_token })
  ▼
communities-ten.vercel.app  (this app, inside <iframe>)
  │
  │  1. Try supabase.auth.setSession() — fails (wrong project JWT)
  │  2. POST /api/auth/exchange { access_token }
  ▼
Express API (same Vercel deployment)
  │
  │  3. Decode JWT payload (no sig verify) → extract email + sub
  │  4. Look up / create user in THIS Supabase project via admin REST API
  │  5. Derive deterministic password: HMAC-SHA256(sub, EXCHANGE_SECRET)
  │  6. Call /auth/v1/token?grant_type=password → get real session tokens
  ▼
Browser
  │  7. supabase.auth.setSession(exchanged tokens) ✅
```

---

## Message Protocol

### Parent → iframe

#### `KUMII_SESSION`
Sent immediately after the parent receives or refreshes its own Supabase session.

```ts
window.frames[0].postMessage({
  type: 'KUMII_SESSION',
  access_token: string,   // Lovable's Supabase JWT (required)
  refresh_token: string,  // optional — exchange endpoint only needs access_token
}, 'https://communities-ten.vercel.app');
```

#### `KUMII_PROFILE`
Sent after `KUMII_SESSION` with rich user + startup data from Lovable's database.

```ts
window.frames[0].postMessage({
  type: 'KUMII_PROFILE',
  profile: {
    id: string,
    full_name: string,
    avatar_url: string,
    role: string,
    // ... any Lovable profile fields
  },
  startup: {
    id: string,
    name: string,
    // ... any Lovable startup fields
  },
}, 'https://communities-ten.vercel.app');
```

### iframe → Parent

#### `KUMII_READY`
Sent every 800 ms (up to 25 times / ~20 s) until `KUMII_SESSION` is received.

```ts
window.parent.postMessage({ type: 'KUMII_READY' }, '*');
```

The parent must listen for this and respond with `KUMII_SESSION`.

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/App.tsx` | postMessage handler, session injection, KUMII_READY pings |
| `apps/web/src/lib/messageBuffer.ts` | Buffers messages that arrive before React mounts |
| `apps/web/src/lib/KumiiContext.tsx` | Stores Lovable profile + startup in React context |
| `apps/api/src/routes/auth.ts` | `POST /api/auth/exchange` — token exchange endpoint |
| `apps/api/src/index.ts` | CORS config — must include all trusted origins |
| `vercel.json` | Routing: `/api/*` → Express, everything else → SPA |

---

## Token Exchange Endpoint

### `POST /api/auth/exchange`

**Request**
```json
{ "access_token": "<lovable supabase jwt>" }
```

**Response (200)**
```json
{
  "access_token": "<this project's supabase jwt>",
  "refresh_token": "<refresh token>",
  "user": { "id": "uuid", "email": "user@example.com" }
}
```

**Error responses**
```json
{ "error": "access_token is required" }                     // 400
{ "error": "access_token does not contain an email claim" } // 400
{ "error": "Failed to provision user account" }             // 500
{ "error": "Failed to create session" }                     // 500
```

### How the password is derived

```ts
// Same user always gets the same password — no storage needed.
// EXCHANGE_SECRET must be set as a Vercel environment variable.
const password = HMAC-SHA256(lovable_user_id, EXCHANGE_SECRET)
```

This means:
- First-time users are **automatically provisioned** in this Supabase project
- Returning users get their password **re-synced** on every call (idempotent)
- The password is **never sent to the browser** — only the resulting session tokens are

---

## Environment Variables

Set these in **Vercel → Project → Settings → Environment Variables**:

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | `https://lphdjsdufwioeeoselcg.supabase.co` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (keep secret) | ✅ |
| `SUPABASE_ANON_KEY` | Anon/public key | ✅ |
| `EXCHANGE_SECRET` | Random 32+ char string for HMAC password derivation | ✅ |
| `CORS_ORIGIN` | Additional allowed CORS origin (optional) | ➖ |

> ⚠️ **Never commit `SUPABASE_SERVICE_ROLE_KEY` or `EXCHANGE_SECRET` to git.**

Generate a secure `EXCHANGE_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## CORS Configuration

The iframe calls `/api/auth/exchange` from its **own origin** (`communities-ten.vercel.app`), not from `kumii.africa`. Both must be in the CORS allowlist in `apps/api/src/index.ts`.

**Currently allowed:**
- `https://kumii.africa`
- `https://www.kumii.africa`
- `https://communities-ten.vercel.app`
- `*.lovable.app`
- `*.lovableproject.com`
- `*.gptengineer.app`
- Vercel preview deployment pattern (`*.vercel.app`)

> ⚠️ If you rename the Vercel project or add a custom domain, add the new origin here.

---

## Supabase Database Requirements

### `user_role` enum
The `handle_new_user()` trigger must use a **valid enum value**. The valid roles are:

```sql
('entrepreneur', 'funder', 'advisor', 'moderator', 'admin')
```

> ❌ `'user'` is **not** a valid role — it will cause a "Database error creating new user" 500.

### `handle_new_user()` trigger (correct version)
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'entrepreneur')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## vercel.json

```json
{
  "version": 2,
  "buildCommand": "bash build.sh",
  "outputDirectory": "apps/web/dist",
  "installCommand": "echo 'Dependencies installed in build.sh'",
  "framework": null,
  "rewrites": [
    { "source": "/api/(.*)",           "destination": "/api/index.js" },
    { "source": "/admin/audit-logs/(.*)", "destination": "/api/index.js" },
    { "source": "/admin/audit-logs",   "destination": "/api/index.js" },
    { "source": "/((?!api/).*)",       "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "ALLOW-FROM https://kumii.africa" },
        { "key": "Content-Security-Policy",
          "value": "frame-ancestors 'self' https://kumii.africa https://*.lovable.app https://*.lovableproject.com https://*.gptengineer.app" }
      ]
    }
  ]
}
```

**Key rules:**
- Use `rewrites` — **not** `routes` (conflicts with `headers`)
- Do **not** use a `builds` array (causes 404 in monorepo setups)
- The SPA fallback `/((?!api/).*)` must be **last** in the rewrites list

---

## Mount Race Condition — `messageBuffer.ts`

React's `useEffect` fires **after** the first render. The parent app may send `KUMII_SESSION` before `useEffect` has registered the message listener, causing the session to be silently dropped.

**Solution**: `messageBuffer.ts` installs a `window.addEventListener('message')` at **module evaluation time** (before React mounts). Messages are buffered until `App.tsx` calls `registerAppHandler()`, which replays them synchronously.

```ts
// messageBuffer.ts — runs before React
window.addEventListener('message', (e) => {
  if (liveHandler) liveHandler(e);
  else buffer.push(e);   // buffer until App.tsx registers
});

// App.tsx — inside useEffect
const unregister = registerAppHandler(handleMessage);
// ^ replays any buffered messages immediately
```

---

## Trusted Origin Check

All incoming `postMessage` events are validated against the trusted origin list **before** any token handling. Messages from unknown origins are silently ignored (with a console warning).

```ts
const TRUSTED_ORIGINS = ['https://kumii.africa', 'https://www.kumii.africa'];
const TRUSTED_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/[a-z0-9-]+\.gptengineer\.app$/,
];
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "Session not received" after 20 s | `KUMII_SESSION` never arrived | Check parent app is listening for `KUMII_READY` and responding |
| `postMessage from untrusted origin ignored` in console | Parent is on an unlisted origin | Add origin to `TRUSTED_ORIGINS` in `App.tsx` |
| Exchange endpoint returns 500 `CORS: origin ... not allowed` | Iframe's own origin not in CORS list | Add origin to `ALLOWED_ORIGINS` in `index.ts` |
| Exchange endpoint returns 500 `Failed to provision user account` | `handle_new_user()` trigger using invalid role | Run `FIX_TRIGGER_ROLE.sql` in Supabase SQL editor |
| Exchange endpoint returns 500 `Failed to create session` | `EXCHANGE_SECRET` not set, or Supabase misconfigured | Set `EXCHANGE_SECRET` env var in Vercel |
| `setSession` fails with `invalid JWT` | Expected — Lovable JWT is for a different Supabase project | This is normal; exchange endpoint handles it |
| `Multiple GoTrueClient instances` warning | Dev only — two Supabase clients initialised | Safe to ignore; does not affect production |
