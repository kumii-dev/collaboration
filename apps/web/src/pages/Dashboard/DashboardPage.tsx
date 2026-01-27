import { useQuery } from 'react-query';
import { Card, Row, Col, Badge, ListGroup, Spinner, Button } from 'react-bootstrap';
import { FiMessageSquare, FiUsers, FiTrendingUp, FiActivity, FiArrowRight } from 'react-icons/fi';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';

interface DashboardStats {
  total_conversations: number;
  unread_messages: number;
  total_threads: number;
  total_posts: number;
  reputation_score: number;
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
      message: <FiMessageSquare className="text-primary" />,
      thread: <FiActivity className="text-success" />,
      post: <FiActivity className="text-info" />,
      vote: <FiTrendingUp className="text-warning" />
    };
    return icons[type] || <FiActivity />;
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="mb-1">Dashboard</h2>
        <p className="text-muted">Welcome back! Here's what's happening.</p>
      </div>

      {/* Stats Cards */}
      <Row className="mb-4">
        <Col md={3}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted mb-1">Conversations</div>
                  {loadingStats ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <h3 className="mb-0">{stats?.total_conversations || 0}</h3>
                  )}
                </div>
                <div
                  className="rounded-circle bg-primary bg-opacity-10 p-3"
                  style={{ width: '60px', height: '60px' }}
                >
                  <FiMessageSquare size={24} className="text-primary" />
                </div>
              </div>
              {stats && stats.unread_messages > 0 && (
                <div className="mt-2">
                  <Badge bg="danger">{stats.unread_messages} unread</Badge>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted mb-1">Forum Threads</div>
                  {loadingStats ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <h3 className="mb-0">{stats?.total_threads || 0}</h3>
                  )}
                </div>
                <div
                  className="rounded-circle bg-success bg-opacity-10 p-3"
                  style={{ width: '60px', height: '60px' }}
                >
                  <FiActivity size={24} className="text-success" />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted mb-1">Reputation</div>
                  {loadingStats ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <h3 className="mb-0">{stats?.reputation_score || 0}</h3>
                  )}
                </div>
                <div
                  className="rounded-circle bg-warning bg-opacity-10 p-3"
                  style={{ width: '60px', height: '60px' }}
                >
                  <FiTrendingUp size={24} className="text-warning" />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted mb-1">Total Posts</div>
                  {loadingStats ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <h3 className="mb-0">{stats?.total_posts || 0}</h3>
                  )}
                </div>
                <div
                  className="rounded-circle bg-info bg-opacity-10 p-3"
                  style={{ width: '60px', height: '60px' }}
                >
                  <FiUsers size={24} className="text-info" />
                </div>
              </div>
              {stats && stats.pending_reports && stats.pending_reports > 0 && (
                <div className="mt-2">
                  <Badge bg="danger">{stats.pending_reports} reports pending</Badge>
                </div>
              )}
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
                  onClick={() => navigate('/profile')}
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
                      <span className="text-success">{thread.vote_score} votes</span>
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
          <Card className="border-0 shadow-sm bg-primary bg-gradient text-white">
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
                    <FiActivity className="me-1" /> Browse Forum
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
