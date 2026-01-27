import { useState } from 'react';
import { useQuery } from 'react-query';
import { Card, Row, Col, Badge, Button, ListGroup, Spinner, Tabs, Tab } from 'react-bootstrap';
import { FiMessageSquare, FiTrendingUp, FiClock, FiStar } from 'react-icons/fi';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';

interface Category {
  id: string;
  name: string;
  description: string;
  slug: string;
  icon?: string;
  board_count: number;
}

interface Board {
  id: string;
  name: string;
  description: string;
  slug: string;
  category_id: string;
  thread_count: number;
  post_count: number;
  last_post?: {
    title: string;
    created_at: string;
    author_name: string;
  };
}

interface Thread {
  id: string;
  title: string;
  content_preview: string;
  author_id: string;
  author_name: string;
  board_id: string;
  board_name: string;
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
  vote_score: number;
  tags?: string[];
}

export default function ForumPage() {
  const [selectedTab, setSelectedTab] = useState<string>('categories');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const navigate = useNavigate();

  // Fetch categories
  const { data: categories, isLoading: loadingCategories } = useQuery(
    'forum-categories',
    async () => {
      const response = await api.get('/forum/categories');
      return response.data.data as Category[];
    }
  );

  // Fetch boards for selected category
  const { data: boards, isLoading: loadingBoards } = useQuery(
    ['forum-boards', selectedCategory],
    async () => {
      if (!selectedCategory) return [];
      const response = await api.get(`/forum/categories/${selectedCategory}/boards`);
      return response.data.data as Board[];
    },
    { enabled: !!selectedCategory }
  );

  // Fetch trending threads
  const { data: trendingThreads, isLoading: loadingTrending } = useQuery(
    'forum-trending',
    async () => {
      const response = await api.get('/forum/threads', {
        params: { sort: 'trending', limit: 10 }
      });
      return response.data.data as Thread[];
    }
  );

  // Fetch recent threads
  const { data: recentThreads, isLoading: loadingRecent } = useQuery(
    'forum-recent',
    async () => {
      const response = await api.get('/forum/threads', {
        params: { sort: 'recent', limit: 10 }
      });
      return response.data.data as Thread[];
    }
  );

  const renderCategoryIcon = (icon?: string) => {
    return (
      <div
        className="category-icon"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '24px',
          marginRight: '16px'
        }}
      >
        {icon || '📂'}
      </div>
    );
  };

  const renderThreadItem = (thread: Thread) => (
    <ListGroup.Item
      key={thread.id}
      action
      onClick={() => navigate(`/forum/threads/${thread.id}`)}
      className="thread-item"
    >
      <div className="d-flex align-items-start">
        <div className="flex-grow-1">
          <div className="d-flex align-items-center gap-2 mb-2">
            {thread.is_pinned && (
              <Badge bg="warning" className="d-flex align-items-center gap-1">
                <FiStar size={12} /> Pinned
              </Badge>
            )}
            {thread.is_locked && (
              <Badge bg="secondary">🔒 Locked</Badge>
            )}
            {thread.tags?.map((tag) => (
              <Badge key={tag} bg="light" text="dark" className="px-2">
                {tag}
              </Badge>
            ))}
          </div>
          
          <h6 className="mb-2">{thread.title}</h6>
          
          <p className="text-muted mb-2" style={{ fontSize: '14px' }}>
            {thread.content_preview}
          </p>
          
          <div className="d-flex align-items-center gap-3 text-muted" style={{ fontSize: '13px' }}>
            <span>By {thread.author_name}</span>
            <span>•</span>
            <span>in {thread.board_name}</span>
            <span>•</span>
            <span>{format(new Date(thread.created_at), 'MMM d, yyyy')}</span>
          </div>
        </div>
        
        <div className="d-flex flex-column align-items-end gap-2 ms-3">
          <div className="d-flex align-items-center gap-3">
            <div className="text-center">
              <div className="fw-bold" style={{ color: '#10b981' }}>
                {thread.vote_score}
              </div>
              <small className="text-muted">votes</small>
            </div>
            
            <div className="text-center">
              <div className="fw-bold">{thread.reply_count}</div>
              <small className="text-muted">replies</small>
            </div>
            
            <div className="text-center">
              <div className="fw-bold">{thread.view_count}</div>
              <small className="text-muted">views</small>
            </div>
          </div>
        </div>
      </div>
    </ListGroup.Item>
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Forum & Discussions</h2>
        <Button variant="primary" onClick={() => navigate('/forum/new-thread')}>
          Create Thread
        </Button>
      </div>

      <Tabs
        activeKey={selectedTab}
        onSelect={(k) => setSelectedTab(k || 'categories')}
        className="mb-4"
      >
        {/* Categories Tab */}
        <Tab eventKey="categories" title="Categories">
          {loadingCategories && (
            <div className="text-center p-5">
              <Spinner animation="border" />
            </div>
          )}

          <Row>
            {categories?.map((category) => (
              <Col md={12} key={category.id} className="mb-3">
                <Card
                  className="forum-category-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedCategory(category.id);
                    setSelectedTab('boards');
                  }}
                >
                  <Card.Body>
                    <div className="d-flex align-items-center">
                      {renderCategoryIcon(category.icon)}
                      
                      <div className="flex-grow-1">
                        <h5 className="mb-1">{category.name}</h5>
                        <p className="text-muted mb-0">{category.description}</p>
                      </div>
                      
                      <div className="text-end ms-3">
                        <div className="fw-bold fs-4">{category.board_count}</div>
                        <small className="text-muted">boards</small>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>

          {categories && categories.length === 0 && (
            <div className="text-center p-5 text-muted">
              <FiMessageSquare size={48} className="mb-3" />
              <p>No categories available yet</p>
            </div>
          )}
        </Tab>

        {/* Boards Tab */}
        <Tab eventKey="boards" title="Boards">
          {!selectedCategory && (
            <div className="text-center p-5 text-muted">
              <p>Select a category from the Categories tab to view its boards</p>
            </div>
          )}

          {loadingBoards && selectedCategory && (
            <div className="text-center p-5">
              <Spinner animation="border" />
            </div>
          )}

          {boards && boards.length > 0 && (
            <ListGroup>
              {boards.map((board) => (
                <ListGroup.Item
                  key={board.id}
                  action
                  onClick={() => navigate(`/forum/boards/${board.slug}`)}
                  className="board-item"
                >
                  <Row className="align-items-center">
                    <Col md={7}>
                      <h6 className="mb-1">{board.name}</h6>
                      <p className="text-muted mb-0" style={{ fontSize: '14px' }}>
                        {board.description}
                      </p>
                    </Col>
                    
                    <Col md={2} className="text-center">
                      <div className="fw-bold">{board.thread_count}</div>
                      <small className="text-muted">threads</small>
                    </Col>
                    
                    <Col md={3}>
                      {board.last_post && (
                        <div>
                          <small className="d-block text-truncate" style={{ fontSize: '13px' }}>
                            {board.last_post.title}
                          </small>
                          <small className="text-muted">
                            by {board.last_post.author_name} •{' '}
                            {format(new Date(board.last_post.created_at), 'MMM d')}
                          </small>
                        </div>
                      )}
                    </Col>
                  </Row>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Tab>

        {/* Trending Tab */}
        <Tab
          eventKey="trending"
          title={
            <span>
              <FiTrendingUp className="me-1" /> Trending
            </span>
          }
        >
          {loadingTrending && (
            <div className="text-center p-5">
              <Spinner animation="border" />
            </div>
          )}

          <ListGroup>
            {trendingThreads?.map((thread) => renderThreadItem(thread))}
          </ListGroup>

          {trendingThreads && trendingThreads.length === 0 && (
            <div className="text-center p-5 text-muted">
              <FiTrendingUp size={48} className="mb-3" />
              <p>No trending threads at the moment</p>
            </div>
          )}
        </Tab>

        {/* Recent Tab */}
        <Tab
          eventKey="recent"
          title={
            <span>
              <FiClock className="me-1" /> Recent
            </span>
          }
        >
          {loadingRecent && (
            <div className="text-center p-5">
              <Spinner animation="border" />
            </div>
          )}

          <ListGroup>
            {recentThreads?.map((thread) => renderThreadItem(thread))}
          </ListGroup>

          {recentThreads && recentThreads.length === 0 && (
            <div className="text-center p-5 text-muted">
              <FiClock size={48} className="mb-3" />
              <p>No recent threads available</p>
            </div>
          )}
        </Tab>
      </Tabs>
    </div>
  );
}
