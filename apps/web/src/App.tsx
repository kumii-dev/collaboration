import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import {
  KumiiContext,
  KumiiProfile,
  KumiiStartup,
  UserRole,
  saveKumiiProfile,
  loadKumiiProfile,
} from './lib/KumiiContext';
import { registerAppHandler } from './lib/messageBuffer';

// Layouts
import MainLayout from './components/layouts/MainLayout';

// Pages
import LoginPage from './pages/Auth/LoginPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ChatPage from './pages/Chat/ChatPage';
import ForumPage from './pages/Forum/ForumPage';
import CategoryDetailPage from './pages/Forum/CategoryDetailPage';
import NewThreadPage from './pages/Forum/NewThreadPage';
import ThreadDetailPage from './pages/Forum/ThreadDetailPage';
import ModerationPage from './pages/Moderation/ModerationPage';
import NotificationsPage from './pages/Notifications/NotificationsPage';
import EventsPage from './pages/Events/EventsPage';
import AdminUsersPage from './pages/Admin/AdminUsersPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

// Detect iframe context once at module level — stable, no re-renders
const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();

// Trusted origins for postMessage
const TRUSTED_ORIGINS = [
  'https://kumii.africa',
  'https://www.kumii.africa',
  'https://communities-ten.vercel.app',  // legacy Vercel deploy — kept while Lovable embed updates
];
const TRUSTED_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/[a-z0-9-]+\.gptengineer\.app$/,
  /^https:\/\/[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/, // Vercel preview deploys
];
function isTrustedOrigin(origin: string) {
  const trusted = (
    TRUSTED_ORIGINS.includes(origin) ||
    TRUSTED_PATTERNS.some(p => p.test(origin))
  );
  if (!trusted) {
    // Log untrusted origins so origin-mismatch bugs are immediately visible
    // in the browser console without requiring source access.
    console.warn('[Kumii] postMessage from untrusted origin ignored:', origin);
  }
  return trusted;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeTimeout, setIframeTimeout] = useState(false);

  // True while a /api/auth/exchange fetch is in flight — prevents the
  // 20 s fallback timer from firing mid-exchange on slow connections.
  const exchangeInProgressRef = useRef(false);

  // Refs to the active ping interval + fallback timer so "Try again" can restart them
  const activeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether role was already set by the exchange path to avoid stale-closure issue
  const roleSetByExchangeRef = useRef(false);

  // Pre-seed from localStorage so profile is available immediately on
  // subsequent navigations within the same iframe session.
  const cached = loadKumiiProfile();
  const [kumiiProfile, setKumiiProfile] = useState<KumiiProfile | null>(cached.profile);
  const [kumiiStartup, setKumiiStartup] = useState<KumiiStartup | null>(cached.startup);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  // Stable helper — fetch role from /api/auth/me using a specific token.
  // Called directly after exchange (avoids race with onAuthStateChange).
  const fetchAndSetRole = (token: string) => {
    console.log('[Kumii] fetchAndSetRole called with token prefix:', token.slice(0, 20) + '…');
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        console.log('[Kumii] /api/auth/me status:', r.status);
        return r.ok ? r.json() : r.json().then(err => { console.error('[Kumii] /api/auth/me error body:', err); return null; });
      })
      .then(data => {
        console.log('[Kumii] /api/auth/me full response:', JSON.stringify(data));
        const role = data?.data?.role ?? data?.profile?.role;
        console.log('[Kumii] Resolved role:', role);
        if (role) setUserRole(role as UserRole);
      })
      .catch(err => console.error('[Kumii] /api/auth/me fetch error:', err));
  };

  useEffect(() => {
    // ── Message handler — registered via messageBuffer so messages that
    // arrived before React mounted are replayed immediately. This eliminates
    // the race where Lovable sends KUMII_SESSION before useEffect fires. ────
    const handleMessage = async (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return;

      const { type, access_token, refresh_token, profile, startup } = event.data ?? {};

      // ── KUMII_SESSION: inject the Supabase session ────────────────────────
      if (type === 'KUMII_SESSION' && access_token) {
        // Log the decoded JWT payload so we can verify email is present
        try {
          const parts = access_token.split('.');
          const jwtPayload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          console.log('[Kumii] KUMII_SESSION received — JWT payload:', {
            email: jwtPayload.email,
            sub: jwtPayload.sub,
            exp: jwtPayload.exp ? new Date(jwtPayload.exp * 1000).toISOString() : null,
            hasRefreshToken: !!refresh_token,
          });
        } catch (e) {
          console.warn('[Kumii] Could not decode JWT payload:', e);
        }
        // First try setSession directly — works when both apps share the same
        // Supabase project. refresh_token may be absent if Lovable sends only
        // the access_token; exchange endpoint only needs access_token anyway.
        const { data, error } = refresh_token
          ? await supabase.auth.setSession({ access_token, refresh_token })
          : { data: { session: null }, error: new Error('no refresh_token — falling back to exchange') };

        if (!error && data.session) {
          setSession(data.session);
          fetchAndSetRole(data.session.access_token);
          setLoading(false);
          if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
          if (activeFallbackRef.current) clearTimeout(activeFallbackRef.current);
          return;
        }

        // setSession failed — most likely a different Supabase project (wrong JWT
        // secret). Fall back to the server-side token exchange endpoint, which
        // provisions the user in this project and returns a valid session.
        const isWrongProject = /invalid.*jwt|invalid.*sig|jwt.*invalid/i.test(error?.message ?? '');
        if (isWrongProject || error) {
          console.warn('[Kumii] setSession failed, attempting server-side token exchange…', error?.message);
          exchangeInProgressRef.current = true;
          try {
            const resp = await fetch('/api/auth/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token, refresh_token }),
            });
            if (resp.ok) {
              const exchanged = await resp.json();
              console.log('[Kumii] /exchange response:', {
                hasAccessToken: !!exchanged.access_token,
                hasRefreshToken: !!exchanged.refresh_token,
                role: exchanged.role,
                user: exchanged.user,
              });

              // ── Role is returned directly by /exchange — use it immediately.
              // This avoids any race with /api/auth/me.
              if (exchanged.role) {
                console.log('[Kumii] Role from exchange response:', exchanged.role);
                setUserRole(exchanged.role as UserRole);
                roleSetByExchangeRef.current = true;
              }

              const { data: exchData, error: exchError } = await supabase.auth.setSession({
                access_token: exchanged.access_token,
                refresh_token: exchanged.refresh_token,
              });
              if (!exchError && exchData.session) {
                console.log('[Kumii] Token exchange succeeded — session set');
                exchangeInProgressRef.current = false;
                setSession(exchData.session);
                setLoading(false);
                if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
                if (activeFallbackRef.current) clearTimeout(activeFallbackRef.current);
                return;
              }
              // setSession failed but role + exchange token are still valid
              if (exchanged.access_token) {
                console.warn('[Kumii] setSession after exchange failed:', exchError?.message, '— continuing with exchange token');
                exchangeInProgressRef.current = false;
                setLoading(false);
                if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
                if (activeFallbackRef.current) clearTimeout(activeFallbackRef.current);
                return;
              }
              console.error('[Kumii] setSession after exchange failed:', exchError?.message);
            } else {
              const body = await resp.json().catch(() => ({}));
              console.error('[Kumii] Token exchange endpoint error:', resp.status, body);
            }
          } catch (fetchErr) {
            console.error('[Kumii] Token exchange fetch failed:', fetchErr);
          }
          exchangeInProgressRef.current = false;
          // Exchange also failed — show timeout UI
          setIframeTimeout(true);
          setLoading(false);
          if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
          if (activeFallbackRef.current) clearTimeout(activeFallbackRef.current);
        }
        return;
      }

      // ── KUMII_PROFILE: store the rich Lovable profile + startup data ───────
      if (type === 'KUMII_PROFILE') {
        const p: KumiiProfile = profile ?? null;
        const s: KumiiStartup = startup ?? null;
        setKumiiProfile(p);
        setKumiiStartup(s);
        saveKumiiProfile(p, s);
        return;
      }
    };

    // Register with the module-level buffer — drains any messages that
    // arrived before this useEffect ran, then forwards future ones directly.
    const unregister = registerAppHandler(handleMessage);

    // ── Initial session check (handles direct / standalone visits) ───────────
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Already have a valid persisted session — no need to wait for parent
        setSession(session);
        setLoading(false);
      } else if (!inIframe) {
        // Standalone mode: no session = show login
        setLoading(false);
      }
      // In iframe with no session: stay loading and wait for KUMII_SESSION
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // In iframe: ignore null events — these are token refresh gaps.
      // The parent will send a fresh KUMII_SESSION; we don't want to flash
      // a reconnect screen mid-session.
      if (inIframe && !session) return;

      // Accept positive auth events (SIGNED_IN, TOKEN_REFRESHED) in all modes
      setSession(session);
      if (session) setLoading(false);
    });

    // ── KUMII_READY pings — retry every 1.2 s, max 33 retries (~40 s) ────────
    if (inIframe) {
      const ping = () => window.parent.postMessage({ type: 'KUMII_READY' }, '*');
      ping(); // immediate first ping

      let retries = 0;
      const interval = setInterval(() => {
        retries++;
        ping();
        if (retries >= 33) clearInterval(interval); // ~40 s total
      }, 1200);

      // After 40 s with no KUMII_SESSION, give up — but only if no exchange
      // is currently in flight (exchange can take 3-5 s on Vercel cold start)
      const fallbackTimer = setTimeout(() => {
        if (exchangeInProgressRef.current) {
          // Exchange is still running — give it another 15 s before giving up
          activeFallbackRef.current = setTimeout(() => {
            setIframeTimeout(true);
            setLoading(false);
            clearInterval(interval);
          }, 15000);
          return;
        }
        setIframeTimeout(true);
        setLoading(false);
        clearInterval(interval);
      }, 40000);

      // Expose interval + fallback ids so the "Try again" button can restart them
      activeIntervalRef.current = interval;
      activeFallbackRef.current = fallbackTimer;

      return () => {
        unregister();
        subscription.unsubscribe();
        clearInterval(interval);
        clearTimeout(fallbackTimer);
      };
    }

    return () => {
      unregister();
      subscription.unsubscribe();
    };
  }, []);

  // Fetch role when a session arrives via getSession() or onAuthStateChange
  // (i.e. returning users / standalone mode). Skip if the exchange path already
  // set the role — use a ref to avoid stale closure on userRole state.
  useEffect(() => {
    if (!session) return;
    if (roleSetByExchangeRef.current) return; // exchange already handled it
    console.log('[Kumii] Session via getSession/onAuthStateChange — fetching role', {
      userId: session.user?.id,
      email: session.user?.email,
    });
    fetchAndSetRole(session.access_token);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100" style={{ background: '#F5F5F3' }}>
        <div className="spinner-border" style={{ color: '#7a8567' }} role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  // In iframe: if no session yet, never show the login page — show a reconnect
  // prompt instead. The parent will re-send KUMII_SESSION on its next render.
  if (inIframe && !session) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 text-center px-4" style={{ background: '#F5F5F3' }}>
        {!iframeTimeout ? (
          <>
            <div className="spinner-border mb-3" style={{ color: '#7a8567' }} role="status">
              <span className="visually-hidden">Reconnecting…</span>
            </div>
            <p style={{ color: '#7a8567', fontWeight: 600, marginBottom: 4 }}>Connecting to your session…</p>
            <p style={{ color: '#aaa', fontSize: 13 }}>Waiting for Kumii to pass your credentials.</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔒</div>
            <p style={{ color: '#7a8567', fontWeight: 600, marginBottom: 4 }}>
              Session not received
            </p>
            <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
              The community app did not receive your login credentials from Kumii.
            </p>
            <button
                onClick={() => {
                  // Clear any stale timers
                  if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
                  if (activeFallbackRef.current) clearTimeout(activeFallbackRef.current);

                  // Reset UI back to spinner
                  setIframeTimeout(false);
                  setLoading(true);

                  // Restart full ping cadence — 1200 ms × 33 = 40 s
                  const ping = () => window.parent.postMessage({ type: 'KUMII_READY' }, '*');
                  ping(); // immediate
                  let retries = 0;
                  const interval = setInterval(() => {
                    retries++;
                    ping();
                    if (retries >= 33) clearInterval(interval);
                  }, 1200);
                  activeIntervalRef.current = interval;

                  // New 40 s fallback
                  const fallback = setTimeout(() => {
                    if (exchangeInProgressRef.current) return; // still exchanging
                    setIframeTimeout(true);
                    setLoading(false);
                    clearInterval(interval);
                  }, 40000);
                  activeFallbackRef.current = fallback;
                }}
                style={{
                  background: 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 24px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Try again
              </button>
          </>
        )}
      </div>
    );
  }

  return (
    <KumiiContext.Provider value={{ profile: kumiiProfile, startup: kumiiStartup, role: userRole }}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route
              path="/login"
              element={
                !session
                  ? (inIframe ? <Navigate to="/dashboard" /> : <LoginPage />)
                  : <Navigate to="/dashboard" />
              }
            />
            <Route
              path="/"
              element={session ? <MainLayout /> : <Navigate to="/login" />}
            >
              <Route index element={<Navigate to="/dashboard" />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="chat/*" element={<ChatPage />} />
              <Route path="forum" element={<ForumPage />} />
              <Route path="forum/categories/:slug" element={<CategoryDetailPage />} />
              <Route path="forum/new-thread" element={<NewThreadPage />} />
              <Route path="forum/threads/:threadId" element={<ThreadDetailPage />} />
              <Route path="moderation" element={<ModerationPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="admin/users" element={<AdminUsersPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </KumiiContext.Provider>
  );
}

export default App;
