import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import {
  KumiiContext,
  KumiiProfile,
  KumiiStartup,
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
import ProfilePage from './pages/Profile/ProfilePage';
import NotificationsPage from './pages/Notifications/NotificationsPage';

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
const TRUSTED_ORIGINS = ['https://kumii.africa', 'https://www.kumii.africa'];
const TRUSTED_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/[a-z0-9-]+\.gptengineer\.app$/,
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
  // Set to true when setSession fails with a JWT signature error — means
  // Lovable is using a different Supabase project than this app.
  const [wrongProject, setWrongProject] = useState(false);

  // Refs to the active ping interval + fallback timer so "Try again" can restart them
  const activeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-seed from localStorage so profile is available immediately on
  // subsequent navigations within the same iframe session.
  const cached = loadKumiiProfile();
  const [kumiiProfile, setKumiiProfile] = useState<KumiiProfile | null>(cached.profile);
  const [kumiiStartup, setKumiiStartup] = useState<KumiiStartup | null>(cached.startup);

  useEffect(() => {
    // ── Message handler — registered via messageBuffer so messages that
    // arrived before React mounted are replayed immediately. This eliminates
    // the race where Lovable sends KUMII_SESSION before useEffect fires. ────
    const handleMessage = async (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return;

      const { type, access_token, refresh_token, profile, startup } = event.data ?? {};

      // ── KUMII_SESSION: inject the Supabase session ────────────────────────
      if (type === 'KUMII_SESSION' && access_token && refresh_token) {
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!error && data.session) {
          setSession(data.session);
          setLoading(false);
          // Clear the ping interval — session received successfully
          if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
          if (activeFallbackRef.current) clearTimeout(activeFallbackRef.current);
        } else {
          const msg = error?.message ?? '';
          // "Invalid JWT" / "invalid signature" = token was issued by a DIFFERENT
          // Supabase project. No amount of refreshing will fix this — the operator
          // needs to point Lovable at the same Supabase project as this app.
          const isWrongProject = /invalid.*jwt|invalid.*sig|jwt.*invalid/i.test(msg);
          if (isWrongProject) {
            console.error('[Kumii] setSession rejected — Lovable is using a different Supabase project.', msg);
            setWrongProject(true);
            setIframeTimeout(true);
            setLoading(false);
            if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
            if (activeFallbackRef.current) clearTimeout(activeFallbackRef.current);
          } else {
            // Token is expired — tell Lovable to refresh its own session, then resend.
            console.warn('[Kumii] setSession failed:', msg, '— requesting token refresh from parent');
            window.parent.postMessage({ type: 'KUMII_SESSION_EXPIRED' }, '*');
          }
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

    // ── KUMII_READY pings — retry every 800 ms, max 25 retries (~20 s) ───────
    if (inIframe) {
      const ping = () => window.parent.postMessage({ type: 'KUMII_READY' }, '*');
      ping(); // immediate first ping

      let retries = 0;
      const interval = setInterval(() => {
        retries++;
        ping();
        if (retries >= 25) clearInterval(interval); // ~20 s total
      }, 800);

      // After 20 s with no KUMII_SESSION, give up on auto-auth and show hint
      const fallbackTimer = setTimeout(() => {
        setIframeTimeout(true);
        setLoading(false);
        clearInterval(interval);
      }, 20000);

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
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>{wrongProject ? '⚙️' : '🔒'}</div>
            <p style={{ color: '#7a8567', fontWeight: 600, marginBottom: 4 }}>
              {wrongProject ? 'Configuration error' : 'Session not received'}
            </p>
            <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
              {wrongProject
                ? 'The Kumii community app and the main Kumii app are using different Supabase projects. Please contact support.'
                : 'The community app did not receive your login credentials from Kumii.'
              }
            </p>
            {!wrongProject && (
              <button
                onClick={() => {
                  // Clear any stale timers
                  if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
                  if (activeFallbackRef.current) clearTimeout(activeFallbackRef.current);

                  // Reset UI back to spinner
                  setIframeTimeout(false);
                  setLoading(true);

                  // Restart full ping cadence — 800 ms × 25 = 20 s
                  const ping = () => window.parent.postMessage({ type: 'KUMII_READY' }, '*');
                  ping(); // immediate
                  let retries = 0;
                  const interval = setInterval(() => {
                    retries++;
                    ping();
                    if (retries >= 25) clearInterval(interval);
                  }, 800);
                  activeIntervalRef.current = interval;

                  // New 20 s fallback
                  const fallback = setTimeout(() => {
                    setIframeTimeout(true);
                    setLoading(false);
                    clearInterval(interval);
                  }, 20000);
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
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <KumiiContext.Provider value={{ profile: kumiiProfile, startup: kumiiStartup }}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
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
              <Route path="profile" element={<ProfilePage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </KumiiContext.Provider>
  );
}

export default App;
