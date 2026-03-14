# Lovable Integration — Collaboration Module

## Overview

The Kumii Collaboration module (`https://communities-ten.vercel.app`) is configured to be embedded as an iframe inside Lovable. It uses a `postMessage` handshake to receive the logged-in user's Supabase session from the parent frame — no separate login required.

---

## Lovable Prompt

Paste the following into Lovable:

---

> The `/community` page needs to embed `https://communities-ten.vercel.app` as a full-screen iframe and pass the current user's Supabase session to it via `postMessage`.
>
> **Replace the entire content of the `/community` page** with this exact React component. Do not change the logic — only adjust styling to fit the app's design system if needed:
>
> ```tsx
> import { useEffect, useRef, useState } from 'react';
> import { supabase } from '@/integrations/supabase/client';
>
> const COLLAB_URL = 'https://communities-ten.vercel.app';
>
> export default function CommunityPage() {
>   const iframeRef = useRef<HTMLIFrameElement>(null);
>   const [ready, setReady] = useState(false);
>   // Timestamp of the last KUMII_SESSION send — prevents duplicate sends within 500 ms
>   // but never blocks a legitimate retry (e.g. user clicks "Try again" after a failed auth)
>   const lastSentAtRef = useRef<number>(0);
>
>   const sendSession = async () => {
>     // Try the cached session first; if it's gone, force a refresh
>     let { data: { session } } = await supabase.auth.getSession();
>     if (!session) {
>       const { data: refreshed } = await supabase.auth.refreshSession();
>       session = refreshed.session;
>     }
>     if (!session) return; // user is genuinely not logged in
>     iframeRef.current?.contentWindow?.postMessage(
>       {
>         type: 'KUMII_SESSION',
>         access_token: session.access_token,
>         refresh_token: session.refresh_token,
>       },
>       COLLAB_URL
>     );
>     lastSentAtRef.current = Date.now();
>   };
>
>   useEffect(() => {
>     const handleMessage = async (event: MessageEvent) => {
>       if (event.origin !== COLLAB_URL) return;
>
>       // ── KUMII_READY: iframe is ready — send session ──────────────────────
>       if (event.data?.type === 'KUMII_READY') {
>         // Debounce: ignore duplicate pings within 500 ms, but always allow retries
>         const timeSinceLast = Date.now() - lastSentAtRef.current;
>         if (timeSinceLast < 500) return;
>         await sendSession();
>         return;
>       }
>
>       // ── KUMII_SESSION_EXPIRED: iframe received an expired token ──────────
>       // Force-refresh the Supabase session in this parent window, then resend.
>       // This prevents an infinite loop of sending the same dead token.
>       if (event.data?.type === 'KUMII_SESSION_EXPIRED') {
>         const { data } = await supabase.auth.refreshSession();
>         if (data.session) {
>           iframeRef.current?.contentWindow?.postMessage(
>             {
>               type: 'KUMII_SESSION',
>               access_token: data.session.access_token,
>               refresh_token: data.session.refresh_token,
>             },
>             COLLAB_URL
>           );
>           lastSentAtRef.current = Date.now();
>         }
>         return;
>       }
>
>       // ── KUMII_OPEN_URL: iframe wants to open an external link / file ─────
>       // Browsers may block window.open() calls from inside an iframe.
>       // The iframe forwards external URLs here so the parent can open them.
>       if (event.data?.type === 'KUMII_OPEN_URL' && event.data?.url) {
>         window.open(event.data.url, '_blank', 'noopener,noreferrer');
>         return;
>       }
>     };
>
>     window.addEventListener('message', handleMessage);
>
>     // Also re-send whenever the Supabase session refreshes (keeps iframe in sync)
>     const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
>       if (!session) return;
>       // Only push to iframe if it's already loaded
>       if (iframeRef.current) {
>         iframeRef.current.contentWindow?.postMessage(
>           {
>             type: 'KUMII_SESSION',
>             access_token: session.access_token,
>             refresh_token: session.refresh_token,
>           },
>           COLLAB_URL
>         );
>         lastSentAtRef.current = Date.now();
>       }
>     });
>
>     return () => {
>       window.removeEventListener('message', handleMessage);
>       subscription.unsubscribe();
>     };
>   }, []);
>
>   return (
>     <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
>       {!ready && (
>         <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F3' }}>
>           <span>Loading community…</span>
>         </div>
>       )}
>       <iframe
>         ref={iframeRef}
>         src={COLLAB_URL}
>         title="Kumii Collaboration"
>         allow="same-origin"
>         style={{
>           flex: 1,
>           border: 'none',
>           width: '100%',
>           display: ready ? 'block' : 'none',
>         }}
>         onLoad={() => {
>           setReady(true);
>           // Send session immediately when iframe finishes loading
>           sendSession();
>         }}
>       />
>     </div>
>   );
> }
> ```
>
> **Critical notes:**
> - The `supabase` import path (`@/integrations/supabase/client`) must match wherever the Supabase client is initialised in this project.
> - Both apps share the same Supabase project — the tokens are valid on both sides automatically.
> - `lastSentAtRef` replaces the old `sessionSentRef` boolean — it allows re-sending if the iframe re-pings after 5 s (handles slow connections and the "Try again" button).
> - The `onAuthStateChange` subscription keeps the iframe session in sync when the parent refreshes its token.
> - The `onLoad` callback sends the session immediately on iframe load as a belt-and-braces measure alongside the postMessage listener.
> - Do **not** wrap the iframe in a scrollable container — it manages its own scroll internally.

---

## How the handshake works

```
Parent (kumii.africa)             Iframe (communities-ten.vercel.app)
─────────────────────             ───────────────────────────────────
                                  loads → posts KUMII_READY
receives KUMII_READY         ←
posts KUMII_SESSION          →    calls supabase.auth.setSession()
                                  renders dashboard
fetches profile + startup
posts KUMII_PROFILE          →    stores in KumiiContext + localStorage ✅

                                  user clicks external link / download
receives KUMII_OPEN_URL      ←
calls window.open(url)            opens in new tab ✅
```

### postMessage type reference

| Direction | Type | Sender | Purpose |
|---|---|---|---|
| iframe → parent | `KUMII_READY` | Collaboration app | Signals iframe is loaded; requests session |
| parent → iframe | `KUMII_SESSION` | Lovable | Delivers `access_token` + `refresh_token` |
| parent → iframe | `KUMII_PROFILE` | Lovable | Delivers user profile + startup data |
| iframe → parent | `KUMII_SESSION_EXPIRED` | Collaboration app | Token was rejected — parent must `refreshSession()` then resend |
| iframe → parent | `KUMII_OPEN_URL` | Collaboration app | Asks parent to open external URL / file download |

### KUMII_PROFILE payload shape

```ts
// profile
{
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  organization: string | null;
  persona_type: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  industry_sectors: string[] | null;
  skills: string[] | null;
  interests: string[] | null;
  profile_picture_url: string | null;
  profile_completion_percentage: number | null;
}

// startup (or null)
{
  company_name: string | null;
  industry: string | null;
  stage: string | null;
  description: string | null;
  location: string | null;
  website: string | null;
  team_size: number | null;
  founded_year: number | null;
  key_products_services: string | null;
  market_access_needs: string | null;
  challenges: string | null;
}
```

### Using the profile inside the collaboration app

```ts
import { useKumii } from '@/lib/KumiiContext';

function MyComponent() {
  const { profile, startup } = useKumii();
  // profile.first_name, profile.persona_type, profile.profile_picture_url …
  // startup?.company_name, startup?.stage …
}
```

## Trusted origins (already configured on the collaboration app)

| Origin | Allowed |
|---|---|
| `https://kumii.africa` | ✅ |
| `https://*.lovable.app` | ✅ |
| `https://*.lovableproject.com` | ✅ |
| `https://*.gptengineer.app` | ✅ |

## Notes

- The session `access_token` and `refresh_token` come from the Lovable app's own Supabase client. The collaboration app's server automatically exchanges Lovable tokens for valid tokens in its own Supabase project — **the two apps do not need to share the same Supabase project**.
- First-time users are provisioned silently in the collaboration project on their first visit — no manual account creation needed.
- The collaboration app will auto-refresh the token via Supabase's built-in `autoRefreshToken: true` after the initial handoff.
- If the user logs out in the parent app, call `supabase.auth.signOut()` and reload the iframe to clear the child session too.
- The `KUMII_SESSION_EXPIRED` message from the iframe means the exchanged token expired mid-session. The Lovable component handles this by calling `refreshSession()` and resending — the exchange endpoint will provision a fresh session automatically.
