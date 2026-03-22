import { useState } from 'react';
import { useQuery } from 'react-query';
import { Card, Row, Col, Badge, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { FiMessageSquare, FiStar, FiSearch, FiArrowRight, FiUsers, FiCalendar } from 'react-icons/fi';
import { BsLightbulb, BsBarChartFill, BsBullseye, BsRocket, BsFolder } from 'react-icons/bs';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { eventsApi, CommunityEvent } from '../../lib/eventsApi';
import EventCard from '../../components/events/EventCard';
import EventDetailModal from '../../components/events/EventDetailModal';

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
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(null);
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

  // Fetch featured events
  const { data: featuredEvents, isLoading: loadingFeatured } = useQuery(
    'featured-events',
    () => eventsApi.listFeatured(6),
    { staleTime: 2 * 60 * 1000 }
  );

  const getCategoryColor = (index: number) => {
    const colors = [
      { bg: '#7a8567', IconComponent: FiMessageSquare },
      { bg: '#c5df96', IconComponent: FiUsers },
      { bg: '#7a8567', IconComponent: BsLightbulb },
      { bg: '#7a8567', IconComponent: BsBarChartFill },
      { bg: '#c5df96', IconComponent: BsBullseye },
      { bg: '#c5df96', IconComponent: BsRocket }
    ];
    return colors[index % colors.length];
  };

  const displayThreads = activeFilter === 'trending' ? trendingThreads : 
                        activeFilter === 'recent' ? recentThreads : trendingThreads;
  const isLoading = activeFilter === 'trending' ? loadingTrending : false;
  void isLoading; // used below for filter tabs

  return (
    <>
    <div style={{ background: '#F5F5F3', minHeight: 'calc(100vh - 100px)', padding: '2rem 0' }}>
      {/* Header Section */}
      <div className="container">
        <div className="text-center mb-4">
          <div className="d-inline-flex align-items-center gap-2 mb-3 px-3 py-2" 
               style={{ background: '#E5E5E3', borderRadius: '20px' }}>
            <FiMessageSquare size={18} />
            <span style={{ fontSize: '14px', fontWeight: '500' }}>
              Browse discussion topics and connect with the community
            </span>
          </div>
          
          <h1 style={{ 
            fontSize: '3rem', 
            fontWeight: '300',
            color: '#7a8567',
            marginBottom: '1rem',
            letterSpacing: '-1px'
          }}>
            Communities
          </h1>
          
          <p style={{ 
            fontSize: '1.1rem', 
            color: '#666666',
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
                fontWeight: '500',
                background: '#7a8567',
                borderColor: '#7a8567'
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
              <Button style={{ background: '#7a8567', borderColor: '#7a8567', color: 'white' }}>
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
                      border: '1px solid #E5E5E3',
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
                          color: 'white'
                        }}
                      >
                        {category.icon ? (
                          <span style={{ fontSize: '24px' }}>{category.icon}</span>
                        ) : (
                          <colorScheme.IconComponent size={24} />
                        )}
                      </div>
                      <h6 className="mb-1" style={{ fontSize: '14px', fontWeight: '600' }}>
                        {category.name}
                      </h6>
                      <div style={{ fontSize: '12px', color: '#666666' }}>
                        {category.board_count} available
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              );
            })
          ) : (
            <Col xs={12}>
              <Card style={{ border: '2px dashed #E5E5E3', borderRadius: '12px', background: '#F5F5F3' }}>
                <Card.Body className="text-center py-5">
                  <BsFolder size={48} color="#7a8567" style={{ marginBottom: '1rem' }} />
                  <h5 className="mb-2">No Categories Yet</h5>
                  <p className="text-muted mb-3">
                    Get started by creating your first discussion category
                  </p>
                  <Button
                    variant="success"
                    onClick={() => navigate('/forum/new-thread')}
                    style={{ borderRadius: '20px', background: '#7a8567', borderColor: '#7a8567' }}
                  >
                    Create First Category
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          )}
        </Row>

        {/* Featured Events Section */}
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h3 style={{ fontWeight: '600', fontSize: '1.5rem', marginBottom: 0 }}>
            <FiCalendar className="me-2" style={{ color: '#7a8567' }} />
            Featured Events
          </h3>
          <Button
            variant="success"
            style={{ borderRadius: '20px', background: '#7a8567', borderColor: '#7a8567' }}
            onClick={() => navigate('/events')}
          >
            View All <FiArrowRight className="ms-1" />
          </Button>
        </div>

        {loadingFeatured ? (
          <div className="text-center py-5">
            <Spinner animation="border" />
          </div>
        ) : featuredEvents && featuredEvents.length > 0 ? (
          <Row>
            {featuredEvents.map(event => (
              <Col md={6} lg={4} key={event.id} className="mb-4">
                <EventCard
                  event={event}
                  onRsvpChange={(_id, _status, _counts) => {
                    // optimistic update handled inside EventCard
                  }}
                  onViewDetails={setSelectedEvent}
                />
              </Col>
            ))}
          </Row>
        ) : (
          <Card style={{ border: '2px dashed #E5E5E3', borderRadius: '12px', background: '#F5F5F3' }}>
            <Card.Body className="text-center py-5">
              <FiCalendar size={48} color="#7a8567" style={{ marginBottom: '1rem' }} />
              <h5 className="mb-2">No Featured Events</h5>
              <p className="text-muted mb-3">Admins can mark upcoming events as featured to showcase them here.</p>
              <Button
                variant="success"
                onClick={() => navigate('/events')}
                style={{ borderRadius: '20px', background: '#7a8567', borderColor: '#7a8567' }}
              >
                Browse All Events
              </Button>
            </Card.Body>
          </Card>
        )}

        {/* Stats Section */}
        <Row className="mt-5 mb-4">
          <Col md={4}>
            <Card className="text-center" style={{ border: '1px solid #E5E5E3', borderRadius: '12px' }}>
              <Card.Body className="py-4">
                <h2 className="display-4 fw-bold mb-0" style={{ color: '#7a8567' }}>
                  {categories?.length || 0}
                </h2>
                <p className="text-muted mb-0">Discussion Categories</p>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="text-center" style={{ border: '1px solid #E5E5E3', borderRadius: '12px' }}>
              <Card.Body className="py-4">
                <h2 className="display-4 fw-bold mb-0" style={{ color: '#c5df96' }}>
                  {trendingThreads?.length || 0}
                </h2>
                <p className="text-muted mb-0">Active Discussions</p>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="text-center" style={{ border: '1px solid #E5E5E3', borderRadius: '12px' }}>
              <Card.Body className="py-4">
                <h2 className="display-4 fw-bold mb-0" style={{ color: '#7a8567' }}>
                  {displayThreads?.reduce((sum, t) => sum + t.reply_count, 0) || 0}
                </h2>
                <p className="text-muted mb-0">Total Replies</p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>
    </div>

    <EventDetailModal
      event={selectedEvent}
      show={selectedEvent !== null}
      onHide={() => setSelectedEvent(null)}
      onRsvpChange={(_id, _status, counts) => {
        setSelectedEvent(prev => prev ? { ...prev, rsvp_counts: counts } : null);
      }}
    />
  </>
  );
}
