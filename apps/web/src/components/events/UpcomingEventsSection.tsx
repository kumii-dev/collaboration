import { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Button, Spinner, Alert } from 'react-bootstrap';
import { BsCalendarPlus } from 'react-icons/bs';
import { eventsApi, CommunityEvent, RsvpCounts } from '../../lib/eventsApi';
import EventCard from './EventCard';
import EventDetailModal from './EventDetailModal';
import CreateEventModal from './CreateEventModal';

interface Props {
  categoryId: string;
  isAdmin?: boolean;
}

export default function UpcomingEventsSection({ categoryId, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(null);
  const [showDetail,    setShowDetail]    = useState(false);
  const [showCreate,    setShowCreate]    = useState(false);

  const { data: events = [], isLoading, error } = useQuery<CommunityEvent[]>(
    ['community-events', categoryId],
    () => eventsApi.list(categoryId),
    { staleTime: 30_000, retry: 2 }
  );

  // ── Optimistic RSVP update (shared by card & modal) ─────────────────────────
  const handleRsvpChange = (eventId: string, status: string | null, counts: RsvpCounts) => {
    queryClient.setQueryData<CommunityEvent[]>(
      ['community-events', categoryId],
      (prev = []) =>
        prev.map(e =>
          e.id === eventId
            ? { ...e, user_rsvp: status as CommunityEvent['user_rsvp'], rsvp_counts: counts }
            : e
        )
    );
    // Keep selectedEvent in sync if modal is open
    setSelectedEvent(prev =>
      prev?.id === eventId
        ? { ...prev, user_rsvp: status as CommunityEvent['user_rsvp'], rsvp_counts: counts }
        : prev
    );
  };

  const handleViewDetails = (event: CommunityEvent) => {
    setSelectedEvent(event);
    setShowDetail(true);
  };

  const handleEventCreated = (event: CommunityEvent) => {
    queryClient.setQueryData<CommunityEvent[]>(
      ['community-events', categoryId],
      (prev = []) => [event, ...prev]
    );
  };

  return (
    <div className="mb-4">
      {/* Section header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 style={{ fontWeight: 700, color: '#2D2D2D', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-block', width: 4, height: 20,
            background: 'linear-gradient(180deg,#7a8567,#c5df96)',
            borderRadius: 2,
          }} />
          Upcoming Events
          {events.length > 0 && (
            <span style={{
              background: '#c5df96', color: '#2D2D2D',
              borderRadius: '20px', padding: '1px 10px',
              fontSize: '0.75rem', fontWeight: 600,
            }}>
              {events.length}
            </span>
          )}
        </h5>

        {isAdmin && (
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            style={{
              background: 'linear-gradient(135deg,#7a8567,#c5df96)',
              border: 'none', borderRadius: '8px',
              fontWeight: 600, fontSize: '0.82rem', color: '#fff',
            }}
          >
            <BsCalendarPlus className="me-1" />Create Event
          </Button>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="text-center py-4">
          <Spinner animation="border" size="sm" style={{ color: '#7a8567' }} />
          <span className="ms-2" style={{ color: '#666', fontSize: '0.9rem' }}>Loading events…</span>
        </div>
      ) : error ? (
        <Alert variant="warning" style={{ borderRadius: '12px', fontSize: '0.9rem' }}>
          Could not load events. Please refresh.
        </Alert>
      ) : events.length === 0 ? (
        <div style={{
          background: '#F5F5F3', borderRadius: '12px',
          padding: '2rem', textAlign: 'center',
          border: '1px dashed #E5E5E3',
        }}>
          <BsCalendarPlus size={28} style={{ color: '#c5df96', marginBottom: '0.5rem' }} />
          <p style={{ color: '#666', margin: 0, fontSize: '0.9rem' }}>No upcoming events in this community</p>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              className="mt-3"
              style={{
                background: 'linear-gradient(135deg,#7a8567,#c5df96)',
                border: 'none', borderRadius: '8px',
                fontWeight: 600, color: '#fff',
              }}
            >
              <BsCalendarPlus className="me-1" />Create the first event
            </Button>
          )}
        </div>
      ) : (
        <div className="row g-3">
          {events.map(event => (
            <div key={event.id} className="col-sm-6 col-xl-4">
              <EventCard
                event={event}
                onRsvpChange={handleRsvpChange}
                onViewDetails={handleViewDetails}
              />
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <EventDetailModal
        event={selectedEvent}
        show={showDetail}
        onHide={() => setShowDetail(false)}
        onRsvpChange={handleRsvpChange}
      />
      <CreateEventModal
        show={showCreate}
        onHide={() => setShowCreate(false)}
        categoryId={categoryId}
        onCreated={handleEventCreated}
      />
    </div>
  );
}
