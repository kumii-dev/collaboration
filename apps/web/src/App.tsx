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
      console.log('🔵 Initial session:', session ? 'Authenticated' : 'Not authenticated');
      console.log('🔵 Session data:', session);
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔵 Auth state change:', event, session ? 'Authenticated' : 'Not authenticated');
      console.log('🔵 Session data:', session);
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    console.log('🔵 App loading...');
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  console.log('🔵 App render - session:', session ? 'Authenticated' : 'Not authenticated');

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={!session ? <LoginPage /> : <Navigate to="/forum" />}
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
