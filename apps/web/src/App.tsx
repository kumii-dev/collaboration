import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';

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

// ── Debug log (only shown in iframe mode while loading) ─────────────────────
type LogEntry = { time: string; msg: string; ok?: boolean };
let debugLog: LogEntry[] = [];
let debugSetLog: ((l: LogEntry[]) => void) | null = null;
function dbg(msg: string, ok?: boolean) {
  const entry = { time: new Date().toISOString().slice(11, 23), msg, ok };
  debugLog = [...debugLog, entry];
  debugSetLog?.([...debugLog]);
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeTimeout, setIframeTimeout] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    debugSetLog = setLog;

    if (inIframe) dbg(`iframe detected, origin=${window.location.origin}`);
    else dbg('standalone mode');

    // ── message listener — registered FIRST ─────────────────────────────────
    const trusted = ['https://kumii.africa', 'https://www.kumii.africa'];
    const trustedPatterns = [
      /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
      /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
      /^https:\/\/[a-z0-9-]+\.gptengineer\.app$/,
    ];

    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      const type = event.data?.type ?? '(no type)';
      dbg(`msg from ${origin} type=${type}`);

      const isTrusted =
        trusted.includes(origin) ||
        trustedPatterns.some(p => p.test(origin));

      if (!isTrusted) {
        dbg(`  ↳ origin NOT trusted — ignored`);
        return;
      }

      const { access_token, refresh_token } = event.data ?? {};
      if (type !== 'KUMII_SESSION' || !access_token || !refresh_token) {
        dbg(`  ↳ not KUMII_SESSION or missing tokens`);
        return;
      }

      dbg('KUMII_SESSION received — calling setSession…', true);
      const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        dbg(`setSession ERROR: ${error.message}`);
      } else {
        dbg('setSession OK ✓', true);
        setSession(data.session);
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);

    // ── initial session check ────────────────────────────────────────────────
    supabase.auth.getSession().then(({ data: { session } }) => {
      dbg(`getSession → ${session ? 'HAS session' : 'no session'}`, !!session);
      setSession(session);
      if (!inIframe || session) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // ── KUMII_READY pings ────────────────────────────────────────────────────
    if (inIframe) {
      const ping = () => {
        dbg('→ posting KUMII_READY to parent');
        window.parent.postMessage({ type: 'KUMII_READY' }, '*');
      };
      ping();

      let retries = 0;
      const interval = setInterval(() => {
        retries++;
        ping();
        if (retries >= 12) { clearInterval(interval); dbg('ping retries exhausted (12)'); }
      }, 800);

      const fallbackTimer = setTimeout(() => {
        dbg('⏱ timeout — no KUMII_SESSION received after 12 s');
        setIframeTimeout(true);
        setLoading(false);
      }, 12000);

      return () => {
        subscription.unsubscribe();
        window.removeEventListener('message', handleMessage);
        clearInterval(interval);
        clearTimeout(fallbackTimer);
        debugSetLog = null;
      };
    }

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
      debugSetLog = null;
    };
  }, []);

  // ── Debug overlay shown while loading in iframe mode ─────────────────────
  if (loading && inIframe) {
    return (
      <div style={{ background: '#0f1117', color: '#c5df96', fontFamily: 'monospace', fontSize: 12, padding: 16, minHeight: '100vh', overflowY: 'auto' }}>
        <div style={{ marginBottom: 12, fontWeight: 700, color: '#7a8567' }}>🔍 Kumii Collaboration — handshake debug</div>
        {log.map((e, i) => (
          <div key={i} style={{ color: e.ok ? '#c5df96' : e.ok === false ? '#ff6b6b' : '#aaa', marginBottom: 3 }}>
            <span style={{ color: '#555', marginRight: 8 }}>{e.time}</span>{e.msg}
          </div>
        ))}
        {log.length === 0 && <div style={{ color: '#555' }}>waiting…</div>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100" style={{ background: '#F5F5F3' }}>
        <div className="spinner-border" style={{ color: '#7a8567' }} role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  // Shown only in iframe mode if the parent never responded with KUMII_SESSION.
  // Fall through to the normal app so the user can log in manually.
  // (The iframeTimeout flag is preserved so MainLayout can show a slim header.)
  if (iframeTimeout && !session) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="*" element={<LoginPage />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              !session
                ? <LoginPage />
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
  );
}

export default App;
