import { useState } from 'react';
import { Card, Badge, Button, ButtonGroup, Spinner } from 'react-bootstrap';
import { BsCalendarEvent, BsGeoAlt, BsCameraVideo, BsPeopleFill } from 'react-icons/bs';
import { FiClock } from 'react-icons/fi';
import { CommunityEvent, RsvpCounts, eventsApi } from '../../lib/eventsApi';

interface Props {
  event: CommunityEvent;
  onRsvpChange: (eventId: string, status: string | null, counts: RsvpCounts) => void;
  onViewDetails: (event: CommunityEvent) => void;
}

export default function EventCard({ event, onRsvpChange, onViewDetails }: Props) {
  const [userRsvp, setUserRsvp]  = useState<string | null>(event.user_rsvp);
  const [counts,   setCounts]    = useState<RsvpCounts>(event.rsvp_counts);
  const [loading,  setLoading]   = useState(false);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const isFull =
    event.max_attendees != null && counts.going >= event.max_attendees;

  const handleRsvp = async (status: 'going' | 'interested' | 'not_going') => {
    if (loading) return;
    setLoading(true);
    try {
      if (userRsvp === status) {
        // Toggle off
        const res = await eventsApi.removeRsvp(event.id);
        setCounts(res.rsvp_counts);
        setUserRsvp(null);
        onRsvpChange(event.id, null, res.rsvp_counts);
      } else {
        const res = await eventsApi.rsvp(event.id, status);
        setCounts(res.rsvp_counts);
        setUserRsvp(res.status);
        onRsvpChange(event.id, res.status, res.rsvp_counts);
      }
    } catch (err) {
      console.error('RSVP error', err);
    } finally {
      setLoading(false);
    }
  };

  // Button style factory
  const rsvpBtn = (key: 'going' | 'interested' | 'not_going') => {
    const active = userRsvp === key;
    const styles: Record<typeof key, React.CSSProperties> = {
      going: {
        background:   active ? 'linear-gradient(135deg,#7a8567,#c5df96)' : 'transparent',
        border:       '1px solid #7a8567',
        color:        active ? '#fff' : '#7a8567',
        fontWeight:   600,
        fontSize:     '0.75rem',
      },
      interested: {
        background:   active ? '#c5df96' : 'transparent',
        border:       '1px solid #c5df96',
        color:        active ? '#fff' : '#7a8567',
        fontWeight:   600,
        fontSize:     '0.75rem',
      },
      not_going: {
        background:   active ? '#E5E5E3' : 'transparent',
        border:       '1px solid #E5E5E3',
        color:        '#888',
        fontSize:     '0.75rem',
      },
    };
    return styles[key];
  };

  return (
    <Card
      className="h-100"
      style={{ border: '1px solid #E5E5E3', borderRadius: '12px', overflow: 'hidden', transition: 'box-shadow .2s' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(122,133,103,.15)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Gradient bar */}
      <div style={{ height: '4px', background: 'linear-gradient(90deg,#7a8567,#c5df96)' }} />

      <Card.Body className="p-3 d-flex flex-column">
        {/* Badges row */}
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div className="d-flex gap-1 flex-wrap">
            {event.is_online && (
              <Badge style={{ background: '#7a8567', fontSize: '0.68rem' }}>
                <BsCameraVideo className="me-1" />Online
              </Badge>
            )}
            {isFull && <Badge bg="danger" style={{ fontSize: '0.68rem' }}>Full</Badge>}
            {event.is_cancelled && <Badge bg="secondary" style={{ fontSize: '0.68rem' }}>Cancelled</Badge>}
          </div>
          {event.forum_categories && (
            <span style={{ fontSize: '0.68rem', color: '#7a8567', fontWeight: 600 }}>
              {event.forum_categories.name}
            </span>
          )}
        </div>

        {/* Title */}
        <h6
          style={{ fontWeight: 700, color: '#2D2D2D', cursor: 'pointer', lineHeight: 1.4, marginBottom: '0.4rem' }}
          onClick={() => onViewDetails(event)}
        >
          {event.title}
        </h6>

        {/* Description snippet */}
        {event.description && (
          <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.6rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {event.description}
          </p>
        )}

        {/* Date / time */}
        <div className="d-flex align-items-center gap-1 mb-1" style={{ fontSize: '0.78rem', color: '#5A5A5A' }}>
          <BsCalendarEvent style={{ color: '#7a8567', flexShrink: 0 }} />
          <span>{fmtDate(event.starts_at)}</span>
        </div>
        <div className="d-flex align-items-center gap-1 mb-1" style={{ fontSize: '0.78rem', color: '#5A5A5A' }}>
          <FiClock style={{ color: '#7a8567', flexShrink: 0 }} />
          <span>{fmtTime(event.starts_at)}{event.ends_at ? ` – ${fmtTime(event.ends_at)}` : ''}</span>
        </div>

        {/* Location */}
        {(event.location || event.meeting_url) && (
          <div className="d-flex align-items-center gap-1 mb-2" style={{ fontSize: '0.78rem', color: '#5A5A5A' }}>
            {event.is_online
              ? <BsCameraVideo style={{ color: '#7a8567', flexShrink: 0 }} />
              : <BsGeoAlt     style={{ color: '#7a8567', flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {event.location ?? event.meeting_url}
            </span>
          </div>
        )}

        {/* Counts */}
        <div className="d-flex align-items-center gap-3 mb-3 mt-auto" style={{ fontSize: '0.76rem', color: '#666' }}>
          <span><BsPeopleFill style={{ color: '#7a8567' }} className="me-1" />{counts.going} going</span>
          <span>{counts.interested} interested</span>
          {event.max_attendees && (
            <span style={{ color: isFull ? '#dc3545' : '#7a8567', fontWeight: 600 }}>
              {Math.max(0, event.max_attendees - counts.going)} spots left
            </span>
          )}
        </div>

        {/* RSVP buttons */}
        {!event.is_cancelled && (
          <ButtonGroup size="sm" className="w-100" style={{ borderRadius: '8px', overflow: 'hidden' }}>
            <Button
              style={rsvpBtn('going')}
              disabled={loading || (isFull && userRsvp !== 'going')}
              onClick={() => handleRsvp('going')}
            >
              {loading && userRsvp !== 'going' ? <Spinner size="sm" animation="border" /> : '✓ Going'}
            </Button>
            <Button
              style={rsvpBtn('interested')}
              disabled={loading}
              onClick={() => handleRsvp('interested')}
            >
              ★ Interested
            </Button>
            <Button
              style={rsvpBtn('not_going')}
              disabled={loading}
              onClick={() => handleRsvp('not_going')}
            >
              ✕
            </Button>
          </ButtonGroup>
        )}
      </Card.Body>
    </Card>
  );
}
