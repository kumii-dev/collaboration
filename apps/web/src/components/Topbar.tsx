import { Button } from 'react-bootstrap';
import { FaBell } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { supabase } from '../lib/supabase';
import api from '../lib/api';

export default function Topbar() {
  const navigate = useNavigate();

  // Fetch unread notification count
  const { data: unreadCount } = useQuery(
    'unread-notifications-count',
    async () => {
      const response = await api.get('/notifications/unread-count');
      return response.data.count || 0;
    },
    {
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="topbar">
      <div>
        <h4 className="mb-0">Collaboration Platform</h4>
      </div>
      <div className="d-flex align-items-center gap-3">
        <Button
          variant="link"
          className="position-relative"
          onClick={() => navigate('/notifications')}
        >
          <FaBell size={20} />
          {unreadCount && unreadCount > 0 && (
            <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
        <Button variant="outline-danger" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </div>
  );
}
