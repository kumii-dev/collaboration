import { useState } from 'react';
import { useQuery } from 'react-query';
import { Card, Row, Col, Badge, Button, Spinner, ListGroup } from 'react-bootstrap';
import { FiMessageSquare, FiEye, FiUser, FiArrowRight } from 'react-icons/fi';
import { BsChatDots } from 'react-icons/bs';
import { FiCalendar } from 'react-icons/fi';
import { format } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import UpcomingEventsSection from '../../components/events/UpcomingEventsSection';
import CommunityChatPanel from '../../components/community/CommunityChatPanel';

interface Category {
  id: string;
  name: string;
  description: string;
  slug: string;
  icon?: string;
}

interface Board {
  id: string;
  name: string;
  description: string;
  category_id: string;
  sort_order: number;
  is_private: boolean;
  required_role?: string;
  thread_count?: number;
  post_count?: number;
  last_post?: {
    thread_title: string;
    author_name: string;
    created_at: string;
  };
}

interface Thread {
  id: string;
  title: string;
  content_preview: string;
  author_name: string;
  board_name: string;
  created_at: string;
  view_count: number;
  reply_count: number;
  vote_score: number;
}

export default function CategoryDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'discussions' | 'chat' | 'events'>('discussions');

  // Fetch current user's role to decide whether to show Create Event button
  const { data: currentUserProfile } = useQuery(
    'current-user-profile',
    async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const response = await api.get(`/users/${user.id}`);
      return response.data.data as { role: string };
    },
    { staleTime: 300_000, retry: 1 }
  );
  const isAdmin = currentUserProfile?.role === 'admin' || currentUserProfile?.role === 'moderator';

  // Fetch all categories to find the one with matching slug
  const { data: categories, isLoading: loadingCategories, error: categoriesError } = useQuery(
    'forum-categories',
    async () => {
      console.log('🔵 Fetching categories for CategoryDetailPage');
      const response = await api.get('/forum/categories');
      console.log('✅ Categories fetched:', response.data);
      return response.data.data as Category[];
    },
    {
      retry: 3,
      retryDelay: 1000,
      staleTime: 60000, // 1 minute
    }
  );

  // Find category by slug
  const category = categories?.find(cat => 
    cat.slug === slug || cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug
  );

  // Fetch boards for this category
  const { data: boards, isLoading: loadingBoards, error: boardsError } = useQuery(
    ['category-boards', category?.id],
    async () => {
      if (!category?.id) return [];
      console.log('🔵 Fetching boards for category:', category.id);
      const response = await api.get(`/forum/categories/${category.id}/boards`);
      console.log('✅ Boards fetched:', response.data);
      return response.data.data as Board[];
    },
    {
      enabled: !!category?.id,
      retry: 3,
      retryDelay: 1000,
      staleTime: 60000,
    }
  );

  // Fetch recent threads from selected board or all boards in category
  const { data: threads, isLoading: loadingThreads, error: threadsError } = useQuery(
    ['category-threads', selectedBoard],
    async () => {
      const params: any = { sort: 'recent', limit: 10 };
      if (selectedBoard) {
        params.boardId = selectedBoard;
      }
      console.log('🔵 Fetching threads with params:', params);
      const response = await api.get('/forum/threads', { params });
      console.log('✅ Threads fetched:', response.data);
      return response.data.data as Thread[];
    },
    {
      retry: 3,
      retryDelay: 1000,
      staleTime: 30000,
    }
  );

  const isLoading = loadingCategories || loadingBoards;

  if (isLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" style={{ color: '#7a8567' }} />
        <p className="mt-3 text-muted">Loading category...</p>
      </div>
    );
  }

  if (categoriesError || boardsError) {
    const error: any = categoriesError || boardsError;
    return (
      <div className="text-center py-5">
        <h3>Error Loading Category</h3>
        <p className="text-muted">
          {error?.response?.data?.error || error?.message || 'Failed to load category data'}
        </p>
        <Button style={{ background: '#7a8567', borderColor: '#7a8567', color: 'white' }} onClick={() => navigate('/forum')}>
          Back to Forum
        </Button>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="text-center py-5">
        <h3>Category not found</h3>
        <p className="text-muted">The category you're looking for doesn't exist.</p>
        <Button style={{ background: '#7a8567', borderColor: '#7a8567', color: 'white' }} onClick={() => navigate('/forum')}>
          Back to Forum
        </Button>
      </div>
    );
  }

  return (
    <div className="category-detail-page">
      {/* Category Header */}
      <Card className="mb-4 shadow-sm">
        <Card.Body>
          <div className="d-flex align-items-center mb-3">
            {category.icon && <span className="me-3" style={{ fontSize: '2rem' }}>{category.icon}</span>}
            <div>
              <h2 className="mb-1">{category.name}</h2>
              <p className="text-muted mb-0">{category.description}</p>
            </div>
          </div>
          <div className="d-flex gap-2">
            <Button 
              style={{ background: '#7a8567', borderColor: '#7a8567', color: 'white' }}
              onClick={() => navigate('/forum/new-thread')}
            >
              Start New Thread
            </Button>
            <Button 
              variant="outline-secondary" 
              onClick={() => navigate('/forum')}
            >
              Back to Forum
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* ── Tab Bar ── */}
      <div
        className="d-flex gap-1 mb-4"
        style={{
          background: 'white',
          border: '1px solid #E5E5E3',
          borderRadius: '12px',
          padding: '6px',
          width: 'fit-content',
        }}
      >
        {([
          { key: 'discussions', label: 'Discussions', Icon: FiMessageSquare },
          { key: 'chat',        label: 'Chat',        Icon: BsChatDots },
          { key: 'events',      label: 'Events',      Icon: FiCalendar },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === key ? '600' : '400',
              background: activeTab === key
                ? 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)'
                : 'transparent',
              color: activeTab === key ? 'white' : '#666',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Discussions ── */}
      {activeTab === 'discussions' && (
        <Row>
          {/* Boards List */}
          <Col lg={4}>
            <Card className="mb-4 shadow-sm">
              <Card.Header>
                <h5 className="mb-0">Boards</h5>
              </Card.Header>
              <ListGroup variant="flush">
                <ListGroup.Item
                  active={selectedBoard === null}
                  action
                  onClick={() => setSelectedBoard(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <strong>All Boards</strong>
                      <div className="small text-muted">Show all threads</div>
                    </div>
                  </div>
                </ListGroup.Item>
                {boards?.map((board) => (
                  <ListGroup.Item
                    key={board.id}
                    active={selectedBoard === board.id}
                    action
                    onClick={() => setSelectedBoard(board.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <strong>{board.name}</strong>
                        <div className="small text-muted">{board.description}</div>
                        {board.is_private && (
                          <Badge style={{ background: '#7a8567' }} className="mt-1">
                            Private
                          </Badge>
                        )}
                      </div>
                      <FiArrowRight />
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>
          </Col>

          {/* Recent Threads */}
          <Col lg={8}>
            <Card className="shadow-sm">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">
                  {selectedBoard 
                    ? `Threads in ${boards?.find(b => b.id === selectedBoard)?.name}`
                    : 'Recent Threads'
                  }
                </h5>
              </Card.Header>
              <ListGroup variant="flush">
                {loadingThreads ? (
                  <ListGroup.Item className="text-center py-4">
                    <Spinner animation="border" size="sm" style={{ color: '#7a8567' }} />
                  </ListGroup.Item>
                ) : threadsError ? (
                  <ListGroup.Item className="text-center py-4">
                    <p className="text-danger mb-2">Failed to load threads</p>
                    <Button
                      style={{ background: 'transparent', borderColor: '#7a8567', color: '#7a8567' }}
                      size="sm"
                      onClick={() => window.location.reload()}
                    >
                      Retry
                    </Button>
                  </ListGroup.Item>
                ) : threads && threads.length > 0 ? (
                  threads.map((thread) => (
                    <ListGroup.Item
                      key={thread.id}
                      action
                      onClick={() => navigate(`/forum/threads/${thread.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="flex-grow-1">
                          <h6 className="mb-1">{thread.title}</h6>
                          <p className="text-muted small mb-2">{thread.content_preview}...</p>
                          <div className="d-flex gap-3 text-muted small">
                            <span>
                              <FiUser className="me-1" />
                              {thread.author_name}
                            </span>
                            <span>
                              <FiMessageSquare className="me-1" />
                              {thread.reply_count} replies
                            </span>
                            <span>
                              <FiEye className="me-1" />
                              {thread.view_count} views
                            </span>
                            <span>
                              {format(new Date(thread.created_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                        {thread.vote_score > 0 && (
                          <Badge style={{ background: '#7a8567' }} className="ms-2">
                            +{thread.vote_score}
                          </Badge>
                        )}
                      </div>
                    </ListGroup.Item>
                  ))
                ) : (
                  <ListGroup.Item className="text-center py-4">
                    <p className="text-muted mb-0">No threads yet.</p>
                    <Button
                      variant="link"
                      onClick={() => navigate('/forum/new-thread')}
                    >
                      Be the first to start a discussion!
                    </Button>
                  </ListGroup.Item>
                )}
              </ListGroup>
            </Card>
          </Col>
        </Row>
      )}

      {/* ── Tab: Chat ── */}
      {activeTab === 'chat' && (
        <CommunityChatPanel categoryId={category.id} categoryName={category.name} />
      )}

      {/* ── Tab: Events ── */}
      {activeTab === 'events' && (
        <UpcomingEventsSection categoryId={category.id} isAdmin={isAdmin} />
      )}
    </div>
  );
}
