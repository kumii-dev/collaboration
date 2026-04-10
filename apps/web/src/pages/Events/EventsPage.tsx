import { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Row, Col, Spinner, Alert, Button, Form, InputGroup, Badge } from 'react-bootstrap';
import { FiCalendar, FiSearch, FiFilter } from 'react-icons/fi';
import { BsCalendarPlus } from 'react-icons/bs';
import { eventsApi, CommunityEvent, RsvpCounts, EventView } from '../../lib/eventsApi';
import EventCard from '../../components/events/EventCard';
import EventDetailModal from '../../components/events/EventDetailModal';
import CreateEventModal from '../../components/events/CreateEventModal';
import { useKumii } from '../../lib/KumiiContext';
import api from '../../lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function EventsPage() {
  const { role } = useKumii();
  const isAdmin  = role === 'admin' || role === 'moderator';

  const [search,          setSearch]          = useState('');
  const [categoryFilter,  setCategoryFilter]  = useState<string>('');
  const [view,            setView]            = useState<EventView>('upcoming');
  const [selectedEvent,   setSelectedEvent]   = useState<CommunityEvent | null>(null);
  const [showDetail,      setShowDetail]      = useState(false);
  const [showCreate,      setShowCreate]      = useState(false);

  const queryClient = useQueryClient();

  const { data: events = [], isLoading, error } = useQuery<CommunityEvent[]>(
    ['all-events', view],
    () => eventsApi.list(undefined, view),
    { staleTime: 30_000 }
  );

  const { data: categories = [] } = useQuery<Category[]>(
    'forum-categories',
    async () => {
      const { data } = await api.get('/forum/categories');
      return data.data as Category[];
    },
    { staleTime: 5 * 60_000 }
  );

  const handleRsvpChange = (eventId: string, status: string | null, counts: RsvpCounts) => {
    queryClient.setQueryData<CommunityEvent[]>(['all-events', view], (prev = []) =>
      prev.map(e =>
        e.id === eventId
          ? { ...e, user_rsvp: status as CommunityEvent['user_rsvp'], rsvp_counts: counts }
          : e
      )
    );
    setSelectedEvent(prev =>
      prev?.id === eventId
        ? { ...prev, user_rsvp: status as CommunityEvent['user_rsvp'], rsvp_counts: counts }
        : prev
    );
  };

  const handleEventCreated = (event: CommunityEvent) => {
    queryClient.setQueryData<CommunityEvent[]>(['all-events', view], (prev = []) => [event, ...prev]);
  };

  const handleEventUpdated = (event: CommunityEvent) => {
    queryClient.setQueryData<CommunityEvent[]>(['all-events', view], (prev = []) =>
      prev.map(e => e.id === event.id ? event : e)
    );
    setSelectedEvent(event);
  };

  const filtered = events.filter(e => {
    const matchesSearch   = !search || e.title.toLowerCase().includes(search.toLowerCase()) ||
                            (e.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || e.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const featuredCount = filtered.filter(e => e.is_featured).length;

  return (
    <div style={{ background: '#F5F5F3', minHeight: 'calc(100vh - 100px)', padding: '2rem 0' }}>
      <div className="container">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
          <div>
            <div className="d-inline-flex align-items-center gap-2 mb-2 px-3 py-1"
                 style={{ background: '#E5E5E3', borderRadius: '20px', fontSize: '13px' }}>
              <FiCalendar size={14} />
              <span>Community events</span>
            </div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 300, color: '#7a8567', letterSpacing: '-1px', marginBottom: 0 }}>
              Events
            </h1>
            {featuredCount > 0 && (
              <span style={{ fontSize: '0.875rem', color: '#888' }}>
                {featuredCount} featured · {filtered.length} total
              </span>
            )}
          </div>

          {isAdmin && (
            <Button
              onClick={() => setShowCreate(true)}
              style={{
                background: 'linear-gradient(135deg,#7a8567,#c5df96)',
                border: 'none', borderRadius: '10px',
                fontWeight: 600, padding: '10px 24px',
              }}
            >
              <BsCalendarPlus className="me-2" />Create Event
            </Button>
          )}
        </div>

        {/* ── View tabs: Upcoming / Past / All ────────────────────────── */}
        <div className="d-flex gap-2 mb-4">
          {(['upcoming', 'past', 'all'] as EventView[]).map(v => (
            <button
              key={v}
              onClick={() => { setView(v); setSearch(''); setCategoryFilter(''); }}
              style={{
                padding: '6px 18px',
                borderRadius: '20px',
                border: view === v ? '1.5px solid #7a8567' : '1.5px solid #dee2e6',
                background: view === v ? '#f0f4ea' : '#fff',
                color: view === v ? '#7a8567' : '#666',
                fontWeight: view === v ? 700 : 400,
                fontSize: '0.85rem',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {v === 'upcoming' ? '⏳ Upcoming' : v === 'past' ? '📁 Past' : '📋 All Events'}
            </button>
          ))}
        </div>

        {/* ── Filters ────────────────────────────────────────────────── */}
        <div className="d-flex gap-3 mb-4 flex-wrap">
          <InputGroup style={{ maxWidth: 360 }}>
            <InputGroup.Text style={{ background: '#fff', border: '1px solid #dee2e6' }}>
              <FiSearch size={14} />
            </InputGroup.Text>
            <Form.Control
              placeholder="Search events…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ border: '1px solid #dee2e6' }}
            />
          </InputGroup>

          <InputGroup style={{ maxWidth: 220 }}>
            <InputGroup.Text style={{ background: '#fff', border: '1px solid #dee2e6' }}>
              <FiFilter size={14} />
            </InputGroup.Text>
            <Form.Select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{ border: '1px solid #dee2e6' }}
            >
              <option value="">All categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Form.Select>
          </InputGroup>

          {(search || categoryFilter) && (
            <Button
              variant="outline-secondary"
              size="sm"
              style={{ borderRadius: '8px' }}
              onClick={() => { setSearch(''); setCategoryFilter(''); }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* ── Featured strip — only shown for upcoming/all ───────────── */}
        {!search && !categoryFilter && featuredCount > 0 && view !== 'past' && (
          <div className="mb-4">
            <h5 style={{ fontWeight: 700, color: '#2D2D2D', marginBottom: '1rem' }}>
              ⭐ Featured
              <Badge className="ms-2" style={{ background: 'linear-gradient(135deg,#7a8567,#c5df96)', fontSize: '0.7rem', verticalAlign: 'middle' }}>
                {featuredCount}
              </Badge>
            </h5>
            <Row>
              {filtered.filter(e => e.is_featured).map(event => (
                <Col md={6} lg={4} key={event.id} className="mb-3">
                  <EventCard
                    event={event}
                    onRsvpChange={handleRsvpChange}
                    onViewDetails={e => { setSelectedEvent(e); setShowDetail(true); }}
                  />
                </Col>
              ))}
            </Row>
            <hr style={{ borderColor: '#E5E5E3', margin: '1.5rem 0' }} />
          </div>
        )}

        {/* ── All / filtered events ──────────────────────────────────── */}
        {isLoading ? (
          <div className="text-center py-5">
            <Spinner animation="border" style={{ color: '#7a8567' }} />
          </div>
        ) : error ? (
          <Alert variant="warning" style={{ borderRadius: '12px' }}>
            Could not load events. Please refresh.
          </Alert>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <FiCalendar size={48} color="#c5df96" style={{ marginBottom: '1rem' }} />
            <h5 style={{ color: '#555', fontWeight: 600 }}>No events found</h5>
            <p style={{ color: '#888' }}>
              {search || categoryFilter
                ? 'Try adjusting your filters.'
                : view === 'past'
                ? 'No past events yet.'
                : view === 'upcoming'
                ? 'No upcoming events scheduled.'
                : 'No events yet.'}
            </p>
            {isAdmin && (
              <Button
                onClick={() => setShowCreate(true)}
                style={{ background: '#7a8567', border: 'none', borderRadius: '10px', fontWeight: 600 }}
              >
                <BsCalendarPlus className="me-2" />Create the first event
              </Button>
            )}
          </div>
        ) : (
          <>
            {(search || categoryFilter || featuredCount === 0) && (
              <h5 style={{ fontWeight: 700, color: '#2D2D2D', marginBottom: '1rem' }}>
                {search || categoryFilter
                  ? `Results (${filtered.length})`
                  : view === 'past'
                  ? `Past Events (${filtered.length})`
                  : view === 'upcoming'
                  ? `Upcoming Events (${filtered.length})`
                  : 'All Events'}
              </h5>
            )}
            {(search || categoryFilter) ? (
              <Row>
                {filtered.map(event => (
                  <Col md={6} lg={4} key={event.id} className="mb-4">
                    <div style={{ opacity: view === 'past' ? 0.75 : 1 }}>
                      <EventCard
                        event={event}
                        onRsvpChange={handleRsvpChange}
                        onViewDetails={e => { setSelectedEvent(e); setShowDetail(true); }}
                      />
                    </div>
                  </Col>
                ))}
              </Row>
            ) : (
              <>
                {/* Non-featured events below the featured strip */}
                {filtered.filter(e => !e.is_featured).length > 0 && (
                  <>
                    {featuredCount > 0 && view !== 'past' && (
                      <h5 style={{ fontWeight: 700, color: '#2D2D2D', marginBottom: '1rem' }}>
                        All Events
                      </h5>
                    )}
                    <Row>
                      {filtered.filter(e => !e.is_featured).map(event => (
                        <Col md={6} lg={4} key={event.id} className="mb-4">
                          <div style={{ opacity: view === 'past' ? 0.75 : 1 }}>
                            <EventCard
                              event={event}
                              onRsvpChange={handleRsvpChange}
                              onViewDetails={e => { setSelectedEvent(e); setShowDetail(true); }}
                            />
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────── */}
      <EventDetailModal
        event={selectedEvent}
        show={showDetail}
        onHide={() => setShowDetail(false)}
        onRsvpChange={handleRsvpChange}
        isAdmin={isAdmin}
        categories={categories}
        onEventUpdated={handleEventUpdated}
      />
      <CreateEventModal
        show={showCreate}
        onHide={() => setShowCreate(false)}
        categories={categories}
        isAdmin={isAdmin}
        onCreated={handleEventCreated}
      />
    </div>
  );
}
