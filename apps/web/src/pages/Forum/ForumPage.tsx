import { useState } from 'react';
import { useQuery } from 'react-query';
import { Card, Row, Col, Badge, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { FiMessageSquare, FiStar, FiSearch, FiArrowRight, FiUsers, FiEye } from 'react-icons/fi';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const navigate = useNavigate();

  // Fetch categories
  const { data: categories, isLoading: loadingCategories } = useQuery(
    'forum-categories',
    async () => {
      const response = await api.get('/forum/categories');
      return response.data.data as Category[];
    }
  );

  // Fetch trending threads
  const { data: trendingThreads, isLoading: loadingTrending } = useQuery(
    'forum-trending',
    async () => {
      const response = await api.get('/forum/threads', {
        params: { sort: 'trending', limit: 9 }
      });
      return response.data.data as Thread[];
    }
  );

  // Fetch recent threads
  const { data: recentThreads } = useQuery(
    'forum-recent',
    async () => {
      const response = await api.get('/forum/threads', {
        params: { sort: 'recent', limit: 9 }
      });
      return response.data.data as Thread[];
    }
  );

  const getCategoryColor = (index: number) => {
    const colors = [
      { bg: '#10b981', icon: '💬' },
      { bg: '#3b82f6', icon: '💰' },
      { bg: '#f59e0b', icon: '💡' },
      { bg: '#8b5cf6', icon: '📊' },
      { bg: '#ef4444', icon: '🎯' },
      { bg: '#06b6d4', icon: '🚀' }
    ];
    return colors[index % colors.length];
  };

  const displayThreads = activeFilter === 'trending' ? trendingThreads : 
                        activeFilter === 'recent' ? recentThreads : trendingThreads;
  const isLoading = activeFilter === 'trending' ? loadingTrending : false;

  return (
    <div style={{ background: '#f8f9fa', minHeight: 'calc(100vh - 100px)', padding: '2rem 0' }}>
      {/* Header Section */}
      <div className="container">
        <div className="text-center mb-4">
          <div className="d-inline-flex align-items-center gap-2 mb-3 px-3 py-2" 
               style={{ background: '#e5e7eb', borderRadius: '20px' }}>
            <FiMessageSquare size={18} />
            <span style={{ fontSize: '14px', fontWeight: '500' }}>
              Browse discussion topics and connect with the community
            </span>
          </div>
          
          <h1 style={{ 
            fontSize: '3rem', 
            fontWeight: '300',
            color: '#a3b18a',
            marginBottom: '1rem',
            letterSpacing: '-1px'
          }}>
            Communities
          </h1>
          
          <p style={{ 
            fontSize: '1.1rem', 
            color: '#6b7280',
            maxWidth: '700px',
            margin: '0 auto 2rem'
          }}>
            Connect with entrepreneurs, funders, and advisors. Share insights, ask questions, 
            and collaborate on ideas.
          </p>

          {/* Action Buttons */}
          <div className="d-flex justify-content-center gap-3 mb-4">
            <Button 
              variant="success" 
              size="lg"
              style={{
                borderRadius: '8px',
                padding: '12px 32px',
                fontWeight: '500'
              }}
              onClick={() => navigate('/forum/new-thread')}
            >
              <FiMessageSquare className="me-2" />
              Browse Discussions
            </Button>
            <Button 
              variant="outline-secondary" 
              size="lg"
              style={{
                borderRadius: '8px',
                padding: '12px 32px',
                fontWeight: '500'
              }}
            >
              <FiUsers className="me-2" />
              Categories
            </Button>
            <Button 
              variant="outline-secondary" 
              size="lg"
              style={{
                borderRadius: '8px',
                padding: '12px 32px',
                fontWeight: '500'
              }}
              onClick={() => navigate('/forum/new-thread')}
            >
              <FiStar className="me-2" />
              Start a Discussion
            </Button>
          </div>

          {/* Search Bar */}
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <InputGroup size="lg">
              <InputGroup.Text style={{ background: 'white', border: '1px solid #dee2e6' }}>
                <FiSearch />
              </InputGroup.Text>
              <Form.Control
                type="text"
                placeholder="Search discussion topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: '1px solid #dee2e6' }}
              />
              <Button variant="success">
                Search
              </Button>
            </InputGroup>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="d-flex justify-content-center gap-3 mb-4">
          {[
            { key: 'all', label: 'Communities', count: trendingThreads?.length || 0 },
            { key: 'trending', label: 'Trending', count: trendingThreads?.length || 0 },
            { key: 'recent', label: 'Recent', count: recentThreads?.length || 0 },
          ].map((filter) => (
            <Button
              key={filter.key}
              variant={activeFilter === filter.key ? 'dark' : 'light'}
              onClick={() => setActiveFilter(filter.key)}
              style={{
                borderRadius: '20px',
                padding: '8px 20px',
                border: activeFilter === filter.key ? 'none' : '1px solid #dee2e6'
              }}
            >
              {filter.label}
              {filter.count > 0 && (
                <Badge 
                  bg={activeFilter === filter.key ? 'light' : 'secondary'} 
                  text={activeFilter === filter.key ? 'dark' : 'light'}
                  className="ms-2"
                >
                  {filter.count}
                </Badge>
              )}
            </Button>
          ))}
        </div>

        {/* Category Cards */}
        <Row className="mb-5">
          {loadingCategories ? (
            <div className="text-center py-5">
              <Spinner animation="border" />
            </div>
          ) : categories && categories.length > 0 ? (
            categories.map((category, index) => {
              const colorScheme = getCategoryColor(index);
              return (
                <Col md={4} lg={2} key={category.id} className="mb-3">
                  <Card 
                    className="text-center h-100" 
                    style={{ 
                      cursor: 'pointer',
                      border: '1px solid #e5e7eb',
                      transition: 'all 0.2s',
                      borderRadius: '12px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    onClick={() => navigate(`/forum/categories/${category.slug}`)}
                  >
                    <Card.Body className="p-3">
                      <div 
                        className="mx-auto mb-2" 
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '50%',
                          background: colorScheme.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '24px'
                        }}
                      >
                        {category.icon || colorScheme.icon}
                      </div>
                      <h6 className="mb-1" style={{ fontSize: '14px', fontWeight: '600' }}>
                        {category.name}
                      </h6>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {category.board_count} available
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              );
            })
          ) : (
            <Col xs={12}>
              <Card style={{ border: '2px dashed #e5e7eb', borderRadius: '12px', background: '#f8f9fa' }}>
                <Card.Body className="text-center py-5">
                  <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📂</div>
                  <h5 className="mb-2">No Categories Yet</h5>
                  <p className="text-muted mb-3">
                    Get started by creating your first discussion category
                  </p>
                  <Button
                    variant="success"
                    onClick={() => navigate('/forum/new-thread')}
                    style={{ borderRadius: '20px' }}
                  >
                    Create First Category
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          )}
        </Row>

        {/* Featured Discussions Section */}
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h3 style={{ fontWeight: '600', fontSize: '1.5rem', marginBottom: 0 }}>
            Featured Discussions
          </h3>
          <Button 
            variant="success" 
            style={{ borderRadius: '20px' }}
            onClick={() => setActiveFilter('all')}
          >
            View All <FiArrowRight className="ms-1" />
          </Button>
        </div>

        {/* Discussion Cards */}
        {isLoading ? (
          <div className="text-center py-5">
            <Spinner animation="border" />
          </div>
        ) : (
          <Row>
            {displayThreads?.slice(0, 6).map((thread) => (
              <Col md={6} lg={4} key={thread.id} className="mb-4">
                <Card 
                  className="h-100" 
                  style={{ 
                    cursor: 'pointer',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onClick={() => navigate(`/forum/threads/${thread.id}`)}
                >
                  <Card.Body>
                    {/* Header with Icon and Badge */}
                    <div className="d-flex justify-content-between align-items-start mb-3">
                      <div 
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '20px'
                        }}
                      >
                        <FiMessageSquare />
                      </div>
                      <Badge 
                        bg="dark" 
                        style={{ 
                          borderRadius: '12px',
                          padding: '4px 12px',
                          fontWeight: '500',
                          fontSize: '11px'
                        }}
                      >
                        Discussion
                      </Badge>
                    </div>

                    {/* Title */}
                    <h5 
                      className="mb-2" 
                      style={{ 
                        fontSize: '1.1rem',
                        fontWeight: '600',
                        color: '#111827',
                        lineHeight: '1.4'
                      }}
                    >
                      {thread.title}
                    </h5>

                    {/* Board Badge */}
                    <div className="mb-3">
                      <Badge bg="light" text="dark" style={{ fontWeight: '500', fontSize: '12px' }}>
                        Board: {thread.board_name}
                      </Badge>
                    </div>

                    {/* Description */}
                    <p 
                      className="text-muted mb-3" 
                      style={{ 
                        fontSize: '14px',
                        lineHeight: '1.6',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {thread.content_preview || 'Click to read the full discussion and join the conversation...'}
                    </p>

                    {/* Stats */}
                    <div className="mb-3">
                      <Row>
                        <Col xs={6}>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            <strong style={{ color: '#10b981', fontSize: '16px' }}>
                              {thread.vote_score > 0 ? `+${thread.vote_score}` : thread.vote_score}
                            </strong>
                            <div>Votes</div>
                          </div>
                        </Col>
                        <Col xs={6}>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            <strong style={{ fontSize: '16px', color: '#111827' }}>
                              {thread.reply_count}
                            </strong>
                            <div>Replies</div>
                          </div>
                        </Col>
                      </Row>
                    </div>

                    {/* Metadata */}
                    <div 
                      className="pt-3" 
                      style={{ 
                        borderTop: '1px solid #e5e7eb',
                        fontSize: '13px',
                        color: '#6b7280'
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center">
                        <span>By: <strong>{thread.author_name}</strong></span>
                        <div className="d-flex align-items-center gap-2">
                          <FiEye size={14} />
                          <span>{thread.view_count}</span>
                        </div>
                      </div>
                      <div className="mt-1">
                        Posted: {format(new Date(thread.created_at), 'MMM d, yyyy')}
                      </div>
                    </div>

                    {/* Apply Button */}
                    <Button 
                      variant="warning" 
                      className="w-100 mt-3"
                      style={{
                        borderRadius: '8px',
                        padding: '10px',
                        fontWeight: '600'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/forum/threads/${thread.id}`);
                      }}
                    >
                      <FiArrowRight className="me-2" />
                      Join Discussion
                    </Button>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        )}

        {/* Stats Section */}
        <Row className="mt-5 mb-4">
          <Col md={4}>
            <Card className="text-center" style={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              <Card.Body className="py-4">
                <h2 className="display-4 fw-bold mb-0" style={{ color: '#10b981' }}>
                  {categories?.length || 0}
                </h2>
                <p className="text-muted mb-0">Discussion Categories</p>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="text-center" style={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              <Card.Body className="py-4">
                <h2 className="display-4 fw-bold mb-0" style={{ color: '#3b82f6' }}>
                  {trendingThreads?.length || 0}
                </h2>
                <p className="text-muted mb-0">Active Discussions</p>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="text-center" style={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              <Card.Body className="py-4">
                <h2 className="display-4 fw-bold mb-0" style={{ color: '#f59e0b' }}>
                  {displayThreads?.reduce((sum, t) => sum + t.reply_count, 0) || 0}
                </h2>
                <p className="text-muted mb-0">Total Replies</p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}
