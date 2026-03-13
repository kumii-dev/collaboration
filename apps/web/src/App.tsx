import { useEffect, useState } from 'react';
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
  return (
    TRUSTED_ORIGINS.includes(origin) ||
    TRUSTED_PATTERNS.some(p => p.test(origin))
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeTimeout, setIframeTimeout] = useState(false);

  // Pre-seed from localStorage so profile is available immediately on
  // subsequent navigations within the same iframe session.
  const cached = loadKumiiProfile();
  const [kumiiProfile, setKumiiProfile] = useState<KumiiProfile | null>(cached.profile);
  const [kumiiStartup, setKumiiStartup] = useState<KumiiStartup | null>(cached.startup);

  useEffect(() => {
    // ── Message listener — registered FIRST to never miss early messages ─────
    const handleMessage = async (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return;

      const { type, access_token, refresh_token, profile, startup } = event.data ?? {};

      // ── KUMII_SESSION: inject the Supabase session ────────────────────────
      if (type === 'KUMII_SESSION' && access_token && refresh_token) {
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!error) {
          setSession(data.session);
          setLoading(false);
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

    window.addEventListener('message', handleMessage);

    // ── Initial session check (handles direct / standalone visits) ───────────
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      // In iframe: stay loading until KUMII_SESSION arrives — unless already
      // authenticated (e.g. Supabase persisted the session in localStorage).
      if (!inIframe || session) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // In iframe mode: ignore session-null events (token refresh gap) —
      // the parent will re-send KUMII_SESSION via onAuthStateChange on its side.
      if (inIframe && !session) return;
      setSession(session);
    });

    // ── KUMII_READY pings — retry every 800 ms until parent responds ─────────
    if (inIframe) {
      const ping = () => window.parent.postMessage({ type: 'KUMII_READY' }, '*');
      ping();

      let retries = 0;
      const interval = setInterval(() => {
        if (++retries >= 15) clearInterval(interval); // ~12 s total
        ping();
      }, 800);

      // After 15 s with no response, clear loading — will re-ping below
      const fallbackTimer = setTimeout(() => {
        setIframeTimeout(true);
        setLoading(false);
      }, 15000);

      return () => {
        subscription.unsubscribe();
        window.removeEventListener('message', handleMessage);
        clearInterval(interval);
        clearTimeout(fallbackTimer);
      };
    }

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
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
        <div className="spinner-border mb-3" style={{ color: '#7a8567' }} role="status">
          <span className="visually-hidden">Reconnecting…</span>
        </div>
        <p style={{ color: '#7a8567', fontWeight: 600, marginBottom: 4 }}>Connecting to your session…</p>
        <p style={{ color: '#aaa', fontSize: 13 }}>
          {iframeTimeout ? 'Please refresh the page if this takes too long.' : 'Waiting for Kumii to pass your session.'}
        </p>
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
