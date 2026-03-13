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

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes (normal login / logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // ── iframe / Lovable postMessage auth ────────────────────────────────────
    // When this app runs inside a Lovable iframe the parent posts:
    //   { type: 'KUMII_SESSION', access_token: '...', refresh_token: '...' }
    // We call setSession() so the user is instantly logged in without a
    // separate login page.
    const handleMessage = async (event: MessageEvent) => {
      // Only accept messages from trusted origins
      const trusted = [
        'https://kumii.africa',
        'https://www.kumii.africa',
      ];
      const trustedPatterns = [
        /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
        /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
        /^https:\/\/[a-z0-9-]+\.gptengineer\.app$/,
      ];
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
        console.log('✅ Session received from parent frame');
        setSession(data.session);
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);

    // Tell the parent frame we're ready to receive the session
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'KUMII_READY' }, '*');
    }

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Detect iframe context once (stable across renders)
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100" style={{ background: '#F5F5F3' }}>
        <div className="spinner-border" style={{ color: '#7a8567' }} role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
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
                // In iframe: stay on loading spinner while waiting for postMessage; never show login form
                ? inIframe ? <div className="d-flex justify-content-center align-items-center vh-100" style={{ background: '#F5F5F3' }}><div className="spinner-border" style={{ color: '#7a8567' }} role="status" /></div> : <LoginPage />
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
