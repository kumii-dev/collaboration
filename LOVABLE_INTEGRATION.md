# Lovable Integration — Collaboration Module

## Overview

The Kumii Collaboration module (`https://communities-ten.vercel.app`) is configured to be embedded as an iframe inside Lovable. It uses a `postMessage` handshake to receive the logged-in user's Supabase session from the parent frame — no separate login required.

---

## Lovable Prompt

Paste the following into Lovable:

---

> I need to embed the Kumii Collaboration module (`https://communities-ten.vercel.app`) as an iframe inside this app. The collaboration app is already configured to receive a Supabase session via `postMessage` — it will post `{ type: 'KUMII_READY' }` when it loads, and expects the parent to respond with `{ type: 'KUMII_SESSION', access_token, refresh_token }` to auto-login the current user without showing a login screen.
>
> Please implement the following:
>
> 1. **Create a `CollaborationPage` component** that renders a full-screen iframe pointing to `https://communities-ten.vercel.app`. The iframe should have no border, take up the full available height (minus any navigation), and include `allow="same-origin"`.
>
> 2. **Wire the session handoff** — on mount, add a `window.addEventListener('message', ...)` listener. When a message `{ type: 'KUMII_READY' }` is received from `https://communities-ten.vercel.app`, immediately get the current Supabase session with `supabase.auth.getSession()` and post back to the iframe's `contentWindow`:
>
> ```js
> iframeRef.current?.contentWindow?.postMessage(
>   { type: 'KUMII_SESSION', access_token: session.access_token, refresh_token: session.refresh_token },
>   'https://communities-ten.vercel.app'
> )
> ```
>
> 3. **Add a navigation entry** — add a "Community" or "Collaborate" link/tab in the app's main navigation that routes to this page. Use a suitable icon (e.g. people/community icon).
>
> 4. **Handle loading state** — show a subtle spinner or skeleton while the iframe is loading (`onLoad` to clear it).
>
> 5. **Handle unauthenticated state** — if `supabase.auth.getSession()` returns no session, do not render the iframe; instead show a message prompting the user to log in first.
>
> The target origin for all `postMessage` calls must be exactly `'https://communities-ten.vercel.app'`. Clean up the event listener on component unmount.

---

## How the handshake works

```
Lovable app (parent)          Collaboration iframe (child)
──────────────────────────    ──────────────────────────────
                              loads → posts KUMII_READY
receives KUMII_READY    ←
gets supabase session
posts KUMII_SESSION     →
                              calls supabase.auth.setSession()
                              renders dashboard ✅
```

## Trusted origins (already configured on the collaboration app)

| Origin | Allowed |
|---|---|
| `https://kumii.africa` | ✅ |
| `https://*.lovable.app` | ✅ |
| `https://*.lovableproject.com` | ✅ |
| `https://*.gptengineer.app` | ✅ |

## Notes

- The session `access_token` and `refresh_token` come from the Lovable app's own Supabase client — both apps must share the **same Supabase project** so the token is valid on both sides.
- The collaboration app will auto-refresh the token via Supabase's built-in `autoRefreshToken: true` after the initial handoff.
- If the user logs out in the parent app, call `supabase.auth.signOut()` and reload the iframe to clear the child session too.
