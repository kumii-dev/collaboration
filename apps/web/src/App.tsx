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

function App() {
  const [session, setSession] = useState<Session | null>(null);
  // In iframe mode keep loading=true until we receive a session via postMessage.
  // In standalone mode, resolve immediately after getSession().
  const [loading, setLoading] = useState(true);
  const [iframeTimeout, setIframeTimeout] = useState(false);

  useEffect(() => {
    // ── iframe / Lovable postMessage auth ────────────────────────────────────
    // Register the message listener FIRST — before getSession() — so we never
    // miss a KUMII_SESSION that arrives early.
    const trusted = [
      'https://kumii.africa',
      'https://www.kumii.africa',
    ];
    const trustedPatterns = [
      /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
      /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
      /^https:\/\/[a-z0-9-]+\.gptengineer\.app$/,
    ];

    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      const isTrusted =
        trusted.includes(origin) ||
        trustedPatterns.some(p => p.test(origin));
      if (!isTrusted) return;

      const { type, access_token, refresh_token } = event.data ?? {};
      if (type !== 'KUMII_SESSION' || !access_token || !refresh_token) return;

      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) {
        console.error('❌ iframe session injection failed:', error.message);
      } else {
        setSession(data.session);
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);

    // Get initial session (handles direct visits / standalone mode)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      // In iframe mode: only mark done if we already have a session.
      // Otherwise stay on the loading screen and wait for postMessage.
      if (!inIframe || session) {
        setLoading(false);
      }
    });

    // Listen for normal auth state changes (login / logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // ── KUMII_READY — tell the parent we're ready for the session handoff ────
    // Send immediately, then retry every 800 ms for up to 10 s in case the
    // parent wasn't listening yet when we first loaded (race condition fix).
    if (inIframe) {
      const ping = () => window.parent.postMessage({ type: 'KUMII_READY' }, '*');
      ping(); // immediate

      let retries = 0;
      const interval = setInterval(() => {
        retries++;
        ping();
        if (retries >= 12) clearInterval(interval); // stop after ~10 s
      }, 800);

      // Show a helpful error if the parent never responds after 15 s
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

  // Shown only in iframe mode if the parent never responded with KUMII_SESSION
  if (iframeTimeout) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 text-center px-4" style={{ background: '#F5F5F3' }}>
        <p style={{ color: '#7a8567', fontWeight: 600, marginBottom: 8 }}>Session handoff timed out.</p>
        <p style={{ color: '#888', fontSize: 14 }}>Please refresh the page or log in again from the parent app.</p>
        <button
          className="btn btn-sm mt-2"
          style={{ background: '#7a8567', color: '#fff', border: 'none' }}
          onClick={() => window.location.reload()}
        >Retry</button>
      </div>
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
