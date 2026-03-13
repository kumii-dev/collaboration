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
>   const sessionSentRef = useRef(false);
>
>   useEffect(() => {
>     const handleMessage = async (event: MessageEvent) => {
>       // Only accept signals from the collaboration app
>       if (event.origin !== COLLAB_URL) return;
>       if (event.data?.type !== 'KUMII_READY') return;
>       // Guard — only send the session once even if KUMII_READY fires repeatedly
>       if (sessionSentRef.current) return;
>       sessionSentRef.current = true;
>
>       const { data: { session } } = await supabase.auth.getSession();
>       if (!session) return; // user is not logged in — iframe will show its own login
>
>       iframeRef.current?.contentWindow?.postMessage(
>         {
>           type: 'KUMII_SESSION',
>           access_token: session.access_token,
>           refresh_token: session.refresh_token,
>         },
>         COLLAB_URL
>       );
>     };
>
>     window.addEventListener('message', handleMessage);
>     return () => window.removeEventListener('message', handleMessage);
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
>         onLoad={() => setReady(true)}
>       />
>     </div>
>   );
> }
> ```
>
> **Critical notes:**
> - The `supabase` import path (`@/integrations/supabase/client`) must match wherever the Supabase client is initialised in this project.
> - Both apps share the same Supabase project — the tokens are valid on both sides automatically.
> - The iframe will keep retrying the `KUMII_READY` signal every 800 ms for up to 12 seconds, so the `sessionSentRef` guard ensures we only respond once.
> - Do **not** wrap the iframe in a scrollable container — it manages its own scroll internally.

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
