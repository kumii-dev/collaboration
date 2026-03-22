import { Button } from 'react-bootstrap';
import { FaBell } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { useKumii } from '../lib/KumiiContext';

export default function Topbar() {
  const navigate = useNavigate();
  const { profile } = useKumii();

  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || ''
    : '';
  const avatarUrl = profile?.profile_picture_url ?? null;
  const initials = displayName ? displayName.charAt(0).toUpperCase() : '?';

  // Fetch unread notification count — notifications endpoint is live
  const { data: unreadCount } = useQuery(
    'unread-notifications-count',
    async () => {
      const response = await api.get('/notifications/unread-count');
      return response.data.count || 0;
    },
    {
      enabled: true,
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
        {/* Notification bell */}
        <Button
          variant="link"
          className="position-relative p-1"
          onClick={() => navigate('/notifications')}
          title="Notifications"
          style={{ color: '#7a8567' }}
        >
          <FaBell size={20} />
          {unreadCount && unreadCount > 0 && (
            <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: '0.65rem' }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>

        {/* User avatar / initials */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            title={displayName}
            style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid #c5df96', cursor: 'default' }}
          />
        ) : (
          <div
            title={displayName}
            style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#7a8567,#c5df96)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'default',
            }}
          >
            {initials}
          </div>
        )}

        {displayName && (
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#2D2D2D', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </span>
        )}

        <Button variant="outline-danger" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </div>
  );
}
