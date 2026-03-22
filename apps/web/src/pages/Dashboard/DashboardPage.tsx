import { useQuery } from 'react-query';
import { Card, Row, Col, Badge, ListGroup, Spinner, Button, ProgressBar } from 'react-bootstrap';
import { FiMessageSquare, FiUsers, FiTrendingUp, FiActivity, FiArrowRight, FiBell, FiShield, FiCalendar } from 'react-icons/fi';
import { BsPeopleFill } from 'react-icons/bs';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useKumii } from '../../lib/KumiiContext';

interface DashboardStats {
  total_conversations: number;
  unread_messages: number;
  total_threads: number;
  total_posts: number;
  reputation_score: number;
  groups_joined: number;
  events_rsvpd: number;
  pending_reports?: number;
}

interface RecentActivity {
  id: string;
  type: 'message' | 'thread' | 'post' | 'vote';
  title: string;
  description: string;
  link: string;
  created_at: string;
}

interface TrendingThread {
  id: string;
  title: string;
  board_name: string;
  reply_count: number;
  vote_score: number;
  view_count: number;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile, startup, role } = useKumii();

  // Derived display values from the Lovable profile (falls back gracefully)
  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || 'there'
    : 'there';
  const avatarUrl = profile?.profile_picture_url ?? null;
  const personaType = profile?.persona_type ?? null;
  const completion = profile?.profile_completion_percentage ?? null;

  // Fetch dashboard stats
  const { data: stats, isLoading: loadingStats } = useQuery(
    'dashboard-stats',
    async () => {
      const response = await api.get('/dashboard/stats');
      return response.data.data as DashboardStats;
    }
  );

  // Fetch recent activity
  const { data: activities, isLoading: loadingActivities } = useQuery(
    'dashboard-activity',
    async () => {
      const response = await api.get('/dashboard/activity', {
        params: { limit: 10 }
      });
      return response.data.data as RecentActivity[];
    }
  );

  // Fetch trending threads
  const { data: trending, isLoading: loadingTrending } = useQuery(
    'dashboard-trending',
    async () => {
      const response = await api.get('/forum/threads', {
        params: { sort: 'trending', limit: 5 }
      });
      return response.data.data as TrendingThread[];
    }
  );

  const getActivityIcon = (type: string) => {
    const icons: Record<string, JSX.Element> = {
      message: <FiMessageSquare style={{ color: '#7a8567' }} />,
      thread: <FiActivity style={{ color: '#7a8567' }} />,
      post: <FiActivity style={{ color: '#7a8567' }} />,
      vote: <FiTrendingUp style={{ color: '#7a8567' }} />,
      event_rsvp: <FiCalendar style={{ color: '#7a8567' }} />,
    };
    return icons[type] || <FiActivity />;
  };

  return (
    <div>
      {/* ── Personalised welcome header ──────────────────────────────────── */}
      <div className="mb-4 d-flex align-items-center gap-3">
        {/* Avatar */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #c5df96', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,#7a8567,#c5df96)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: '1.2rem',
          }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <h2 className="mb-0" style={{ fontSize: '1.3rem' }}>
              Welcome back, {displayName}!
            </h2>
            {personaType && (
              <Badge style={{ background: 'linear-gradient(135deg,#7a8567,#c5df96)', color: '#fff', fontWeight: 500, fontSize: '0.72rem' }}>
                {personaType}
              </Badge>
            )}
            {startup?.company_name && (
              <Badge bg="light" text="dark" style={{ fontWeight: 400, fontSize: '0.72rem', border: '1px solid #E5E5E3' }}>
                {startup.company_name}
              </Badge>
            )}
          </div>
          {/* Profile completion bar — only show if incomplete */}
          {completion !== null && completion < 100 && (
            <div className="mt-1" style={{ maxWidth: 260 }}>
              <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.72rem', color: '#888' }}>
                <span>Profile completion</span>
                <span>{completion}%</span>
              </div>
              <ProgressBar
                now={completion}
                style={{ height: 4, borderRadius: 4 }}
                variant="success"
              />
            </div>
          )}
          {completion === null && (
            <p className="text-muted mb-0" style={{ fontSize: '0.88rem' }}>Here's what's happening in your community.</p>
          )}
        </div>
      </div>

      {/* ── Hero Navigation Cards ─────────────────────────────────────────── */}
      <Row className="g-3 mb-4">
        {(
          [
            {
              path: '/forum',
              icon: <BsPeopleFill size={26} />,
              label: 'Communities',
              desc: 'Browse Communities & join discussions',
              gradient: 'linear-gradient(135deg,#7a8567,#c5df96)',
            },
            {
              path: '/chat',
              icon: <FiMessageSquare size={26} />,
              label: 'Chat',
              desc: 'Direct & group messaging',
              gradient: 'linear-gradient(135deg,#6b8f71,#b8d4a8)',
            },
            {
              path: '/notifications',
              icon: <FiBell size={26} />,
              label: 'Notifications',
              desc: 'Alerts, mentions & updates',
              gradient: 'linear-gradient(135deg,#8a9e76,#c5df96)',
            },
            // Moderation: only visible to moderators and admins
            ...(role === 'moderator' || role === 'admin'
              ? [{
                  path: '/moderation',
                  icon: <FiShield size={26} />,
                  label: 'Moderation',
                  desc: 'Reports & community health',
                  gradient: 'linear-gradient(135deg,#5c7a5e,#8fbb91)',
                }]
              : []),
          ] as Array<{ path: string; icon: JSX.Element; label: string; desc: string; gradient: string }>
        ).map(({ path, icon, label, desc, gradient }) => (
          <Col key={path} xs={6} md={4} xl={2}>
            <Card
              className="border-0 h-100"
              onClick={() => navigate(path)}
              style={{
                cursor: 'pointer',
                borderRadius: 16,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)';
              }}
            >
              {/* Gradient top accent */}
              <div style={{ height: 6, background: gradient, borderRadius: '16px 16px 0 0' }} />
              <Card.Body className="d-flex flex-column align-items-start p-3">
                <div style={{
                  width: 46, height: 46, borderRadius: 12,
                  background: gradient,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', marginBottom: 12,
                }}>
                  {icon}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2D2D2D', marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#888', lineHeight: 1.3 }}>
                  {desc}
                </div>
                <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                  <FiArrowRight size={16} style={{ color: '#7a8567' }} />
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      {/* ── End Hero Nav Cards ───────────────────────────────────────────── */}

      {/* Stats Cards */}
      <Row className="mb-4 g-3">
        <Col xs={6} md={4} lg={2}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>Conversations</div>
                  {loadingStats ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <h3 className="mb-0">{stats?.total_conversations || 0}</h3>
                  )}
                </div>
                <div
                  className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                  style={{ width: 46, height: 46, background: 'rgba(122,133,103,0.1)', flexShrink: 0 }}
                >
                  <FiMessageSquare size={20} style={{ color: '#7a8567' }} />
                </div>
              </div>
              {stats && stats.unread_messages > 0 && (
                <div className="mt-2">
                  <Badge bg="danger" style={{ fontSize: '0.72rem' }}>{stats.unread_messages} unread</Badge>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} md={4} lg={2}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>Forum Threads</div>
                  {loadingStats ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <h3 className="mb-0">{stats?.total_threads || 0}</h3>
                  )}
                </div>
                <div
                  className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                  style={{ width: 46, height: 46, background: 'rgba(197,223,150,0.2)', flexShrink: 0 }}
                >
                  <FiActivity size={20} style={{ color: '#7a8567' }} />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} md={4} lg={2}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>Reputation</div>
                  {loadingStats ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <h3 className="mb-0">{stats?.reputation_score || 0}</h3>
                  )}
                </div>
                <div
                  className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                  style={{ width: 46, height: 46, background: 'rgba(122,133,103,0.1)', flexShrink: 0 }}
                >
                  <FiTrendingUp size={20} style={{ color: '#7a8567' }} />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} md={4} lg={2}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>Total Posts</div>
                  {loadingStats ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <h3 className="mb-0">{stats?.total_posts || 0}</h3>
                  )}
                </div>
                <div
                  className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                  style={{ width: 46, height: 46, background: 'rgba(197,223,150,0.2)', flexShrink: 0 }}
                >
                  <FiUsers size={20} style={{ color: '#7a8567' }} />
                </div>
              </div>
              {/* Pending reports badge — mods/admins only */}
              {(role === 'moderator' || role === 'admin') && stats && stats.pending_reports && stats.pending_reports > 0 && (
                <div className="mt-2">
                  <Badge bg="danger" style={{ fontSize: '0.72rem' }}>{stats.pending_reports} reports pending</Badge>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} md={4} lg={2}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>Groups Joined</div>
                  {loadingStats ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <h3 className="mb-0">{stats?.groups_joined || 0}</h3>
                  )}
                </div>
                <div
                  className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                  style={{ width: 46, height: 46, background: 'rgba(122,133,103,0.1)', flexShrink: 0 }}
                >
                  <FiUsers size={20} style={{ color: '#7a8567' }} />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} md={4} lg={2}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>Events RSVPd</div>
                  {loadingStats ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <h3 className="mb-0">{stats?.events_rsvpd || 0}</h3>
                  )}
                </div>
                <div
                  className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                  style={{ width: 46, height: 46, background: 'rgba(197,223,150,0.2)', flexShrink: 0 }}
                >
                  <FiCalendar size={20} style={{ color: '#7a8567' }} />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        {/* Recent Activity */}
        <Col md={7}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white border-bottom">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Recent Activity</h5>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => navigate('/forum')}
                  className="text-decoration-none"
                >
                  View All <FiArrowRight />
                </Button>
              </div>
            </Card.Header>
            <ListGroup variant="flush">
              {loadingActivities && (
                <ListGroup.Item className="text-center p-4">
                  <Spinner animation="border" size="sm" />
                </ListGroup.Item>
              )}

              {activities && activities.length === 0 && (
                <ListGroup.Item className="text-center p-4 text-muted">
                  No recent activity
                </ListGroup.Item>
              )}

              {activities?.map((activity) => (
                <ListGroup.Item
                  key={activity.id}
                  action
                  onClick={() => navigate(activity.link)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="d-flex align-items-start gap-3">
                    <div className="mt-1">{getActivityIcon(activity.type)}</div>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <h6 className="mb-1">{activity.title}</h6>
                          <p className="text-muted mb-0" style={{ fontSize: '14px' }}>
                            {activity.description}
                          </p>
                        </div>
                        <small className="text-muted text-nowrap ms-2">
                          {format(new Date(activity.created_at), 'MMM d')}
                        </small>
                      </div>
                    </div>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
        </Col>

        {/* Trending Threads */}
        <Col md={5}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white border-bottom">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Trending Discussions</h5>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => navigate('/forum')}
                  className="text-decoration-none"
                >
                  View All <FiArrowRight />
                </Button>
              </div>
            </Card.Header>
            <ListGroup variant="flush">
              {loadingTrending && (
                <ListGroup.Item className="text-center p-4">
                  <Spinner animation="border" size="sm" />
                </ListGroup.Item>
              )}

              {trending && trending.length === 0 && (
                <ListGroup.Item className="text-center p-4 text-muted">
                  No trending threads
                </ListGroup.Item>
              )}

              {trending?.map((thread) => (
                <ListGroup.Item
                  key={thread.id}
                  action
                  onClick={() => navigate(`/forum/threads/${thread.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    <h6 className="mb-2">{thread.title}</h6>
                    <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: '13px' }}>
                      <Badge bg="light" text="dark">
                        {thread.board_name}
                      </Badge>
                      <span>•</span>
                      <span>{thread.reply_count} replies</span>
                      <span>•</span>
                      <span style={{ color: '#7a8567' }}>{thread.vote_score} votes</span>
                    </div>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
        </Col>
      </Row>

      {/* Quick Actions */}
      <Row className="mt-4">
        <Col md={12}>
          <Card className="border-0 shadow-sm text-white" style={{ background: 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)' }}>
            <Card.Body>
              <Row className="align-items-center">
                <Col md={8}>
                  <h5 className="mb-2">Ready to collaborate?</h5>
                  <p className="mb-0">
                    Start a conversation, create a thread, or explore trending discussions.
                  </p>
                </Col>
                <Col md={4} className="text-end">
                  <Button variant="light" className="me-2" onClick={() => navigate('/chat')}>
                    <FiMessageSquare className="me-1" /> New Chat
                  </Button>
                  <Button variant="outline-light" onClick={() => navigate('/forum')}>
                    <FiActivity className="me-1" /> Browse Categories
                  </Button>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
