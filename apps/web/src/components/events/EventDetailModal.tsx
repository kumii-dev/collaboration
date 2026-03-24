import { useState, useEffect } from 'react';
import { Modal, Button, Badge, Alert, Spinner, Form, Row, Col } from 'react-bootstrap';
import {
  BsCalendarEvent, BsGeoAlt, BsCameraVideo,
  BsPeopleFill, BsBell, BsPersonCircle, BsLink45Deg,
  BsPencil, BsX, BsStarFill, BsStar,
} from 'react-icons/bs';
import { FiExternalLink } from 'react-icons/fi';
import { CommunityEvent, RsvpCounts, UpdateEventPayload, eventsApi } from '../../lib/eventsApi';

interface Category { id: string; name: string; slug?: string; }

interface Props {
  event: CommunityEvent | null;
  show: boolean;
  onHide: () => void;
  onRsvpChange: (eventId: string, status: string | null, counts: RsvpCounts) => void;
  isAdmin?: boolean;
  categories?: Category[];
  onEventUpdated?: (event: CommunityEvent) => void;
}

export default function EventDetailModal({ event, show, onHide, onRsvpChange, isAdmin = false, categories = [], onEventUpdated }: Props) {
  const [userRsvp,    setUserRsvp]    = useState<string | null>(null);
  const [counts,      setCounts]      = useState<RsvpCounts>({ going: 0, interested: 0, not_going: 0 });
  const [loading,     setLoading]     = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Edit mode state
  const [isEditing,   setIsEditing]   = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError,   setEditError]   = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState({
    category_id:   '',
    title:         '',
    description:   '',
    location:      '',
    meeting_url:   '',
    starts_at:     '',
    ends_at:       '',
    max_attendees: '' as string,
    is_online:     false,
    is_featured:   false,
  });

  function toLocalDatetime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const setEF = (key: string, val: unknown) => setEditForm(p => ({ ...p, [key]: val }));

  // Sync RSVP state whenever the event prop changes (e.g. after card RSVP)
  useEffect(() => {
    if (event) {
      setUserRsvp(event.user_rsvp);
      setCounts(event.rsvp_counts);
      setReminderSet(false);
      setError(null);
      // Pre-fill edit form
      setIsEditing(false);
      setEditError(null);
      setEditForm({
        category_id:   event.category_id,
        title:         event.title,
        description:   event.description ?? '',
        location:      event.location ?? '',
        meeting_url:   event.meeting_url ?? '',
        starts_at:     toLocalDatetime(event.starts_at),
        ends_at:       event.ends_at ? toLocalDatetime(event.ends_at) : '',
        max_attendees: event.max_attendees != null ? String(event.max_attendees) : '',
        is_online:     event.is_online,
        is_featured:   event.is_featured,
      });
    }
  }, [event?.id, event?.user_rsvp, event?.rsvp_counts]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const payload: UpdateEventPayload = {
        category_id:   editForm.category_id || undefined,
        title:         editForm.title,
        description:   editForm.description || undefined,
        location:      editForm.is_online ? undefined : (editForm.location || undefined),
        meeting_url:   editForm.is_online ? (editForm.meeting_url || undefined) : undefined,
        starts_at:     new Date(editForm.starts_at).toISOString(),
        ends_at:       editForm.ends_at ? new Date(editForm.ends_at).toISOString() : undefined,
        max_attendees: editForm.max_attendees ? parseInt(editForm.max_attendees as string) : null,
        is_online:     editForm.is_online,
        is_featured:   editForm.is_featured,
      };
      const updated = await eventsApi.update(event.id, payload);
      onEventUpdated?.(updated);
      setIsEditing(false);
    } catch (err: any) {
      setEditError(err?.response?.data?.error ?? err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    borderRadius: '8px',
    border: '1px solid #E5E5E3',
    fontSize: '0.9rem',
    background: '#FAFAF8',
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 600,
    color: '#2D2D2D',
    fontSize: '0.875rem',
    marginBottom: '0.35rem',
  };

  if (!event) return null;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const isFull = event.max_attendees != null && counts.going >= event.max_attendees;
  const capacityPct = event.max_attendees
    ? Math.min(100, Math.round((counts.going / event.max_attendees) * 100))
    : 0;

  const handleRsvp = async (status: 'going' | 'interested' | 'not_going') => {
    setLoading(true);
    setError(null);
    try {
      if (userRsvp === status) {
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
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetReminder = async () => {
    setError(null);
    try {
      // 1 hour before the event
      const remindAt = new Date(new Date(event.starts_at).getTime() - 60 * 60 * 1000).toISOString();
      await eventsApi.setReminder(event.id, remindAt);
      setReminderSet(true);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message);
    }
  };

  const rsvpBtnStyle = (key: 'going' | 'interested' | 'not_going'): React.CSSProperties => {
    const active = userRsvp === key;
    if (key === 'going')
      return { background: active ? 'linear-gradient(135deg,#7a8567,#c5df96)' : 'transparent', border: '1px solid #7a8567', color: active ? '#fff' : '#7a8567', fontWeight: 600, borderRadius: '8px' };
    if (key === 'interested')
      return { background: active ? '#c5df96' : 'transparent', border: '1px solid #c5df96', color: active ? '#fff' : '#7a8567', fontWeight: 600, borderRadius: '8px' };
    return { borderRadius: '8px', fontSize: '0.85rem' };
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
        {/* Gradient bar */}
        <div style={{ height: '6px', background: 'linear-gradient(90deg,#7a8567,#c5df96)' }} />

        <Modal.Header closeButton style={{ borderBottom: '1px solid #E5E5E3', padding: '1.25rem 1.5rem' }}>
          <div className="w-100 d-flex align-items-start justify-content-between pe-2">
            <div>
              <div className="d-flex gap-2 mb-1 flex-wrap">
                {event.is_online && (
                  <Badge style={{ background: '#7a8567' }}>
                    <BsCameraVideo className="me-1" />Online
                  </Badge>
                )}
                {event.forum_categories && (
                  <Badge style={{ background: '#c5df96', color: '#2D2D2D' }}>
                    {event.forum_categories.name}
                  </Badge>
                )}
                {event.is_featured && (
                  <Badge style={{ background: '#f5c542', color: '#2D2D2D' }}>
                    <BsStarFill className="me-1" size={11} />Featured
                  </Badge>
                )}
                {isFull          && <Badge bg="danger">Full</Badge>}
                {event.is_cancelled && <Badge bg="secondary">Cancelled</Badge>}
              </div>
              <Modal.Title style={{ fontWeight: 700, color: '#2D2D2D', fontSize: '1.15rem' }}>
                {event.title}
              </Modal.Title>
            </div>
            {isAdmin && !isEditing && (
              <Button
                size="sm"
                variant="outline-secondary"
                style={{ borderRadius: '8px', fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => setIsEditing(true)}
              >
                <BsPencil className="me-1" />Edit
              </Button>
            )}
            {isAdmin && isEditing && (
              <Button
                size="sm"
                variant="outline-danger"
                style={{ borderRadius: '8px', fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => setIsEditing(false)}
              >
                <BsX size={16} />Cancel Edit
              </Button>
            )}
          </div>
        </Modal.Header>

        <Modal.Body style={{ padding: '1.5rem' }}>
          {error && (
            <Alert variant="danger" dismissible onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {reminderSet && (
            <Alert variant="success" dismissible onClose={() => setReminderSet(false)}>
              <BsBell className="me-2" />Reminder set for 1 hour before the event!
            </Alert>
          )}

          {/* ── Edit form (admin only) ── */}
          {isEditing && (
            <Form onSubmit={handleSaveEdit}>
              {editError && <Alert variant="danger" dismissible onClose={() => setEditError(null)}>{editError}</Alert>}

              {/* Community */}
              {categories.length > 0 && (
                <Form.Group className="mb-3">
                  <Form.Label style={labelStyle}>Community</Form.Label>
                  <Form.Select style={inputStyle} value={editForm.category_id} onChange={e => setEF('category_id', e.target.value)}>
                    <option value="">— no community —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Form.Select>
                </Form.Group>
              )}

              {/* Title */}
              <Form.Group className="mb-3">
                <Form.Label style={labelStyle}>Title <span className="text-danger">*</span></Form.Label>
                <Form.Control style={inputStyle} value={editForm.title} onChange={e => setEF('title', e.target.value)} required />
              </Form.Group>

              {/* Description */}
              <Form.Group className="mb-3">
                <Form.Label style={labelStyle}>Description</Form.Label>
                <Form.Control as="textarea" rows={3} style={{ ...inputStyle, resize: 'none' }} value={editForm.description} onChange={e => setEF('description', e.target.value)} />
              </Form.Group>

              {/* Dates */}
              <Row className="mb-3">
                <Col>
                  <Form.Label style={labelStyle}>Start <span className="text-danger">*</span></Form.Label>
                  <Form.Control type="datetime-local" style={inputStyle} value={editForm.starts_at} onChange={e => setEF('starts_at', e.target.value)} required />
                </Col>
                <Col>
                  <Form.Label style={labelStyle}>End</Form.Label>
                  <Form.Control type="datetime-local" style={inputStyle} value={editForm.ends_at} onChange={e => setEF('ends_at', e.target.value)} />
                </Col>
              </Row>

              {/* Online toggle */}
              <Form.Group className="mb-3">
                <Form.Check type="switch" id="edit-event-online" label={<span style={labelStyle}>Online Event</span>} checked={editForm.is_online} onChange={e => setEF('is_online', e.target.checked)} />
              </Form.Group>

              {/* Location / URL */}
              {editForm.is_online ? (
                <Form.Group className="mb-3">
                  <Form.Label style={labelStyle}>Meeting URL</Form.Label>
                  <Form.Control type="url" style={inputStyle} value={editForm.meeting_url} onChange={e => setEF('meeting_url', e.target.value)} placeholder="https://zoom.us/j/..." />
                </Form.Group>
              ) : (
                <Form.Group className="mb-3">
                  <Form.Label style={labelStyle}>Location</Form.Label>
                  <Form.Control style={inputStyle} value={editForm.location} onChange={e => setEF('location', e.target.value)} placeholder="e.g. Nairobi Hub, Floor 3" />
                </Form.Group>
              )}

              {/* Capacity */}
              <Form.Group className="mb-3">
                <Form.Label style={labelStyle}>Max Attendees</Form.Label>
                <Form.Control type="number" min="1" style={inputStyle} value={editForm.max_attendees} onChange={e => setEF('max_attendees', e.target.value)} placeholder="Leave empty for unlimited" />
              </Form.Group>

              {/* Featured toggle */}
              <div
                className="mb-4 p-3"
                style={{
                  borderRadius: '10px',
                  border: editForm.is_featured ? '1px solid #c5df96' : '1px solid #E5E5E3',
                  background: editForm.is_featured ? '#f9fdf2' : '#FAFAF8',
                  cursor: 'pointer',
                }}
                onClick={() => setEF('is_featured', !editForm.is_featured)}
              >
                <div className="d-flex align-items-center gap-2">
                  {editForm.is_featured
                    ? <BsStarFill size={18} style={{ color: '#c5a830' }} />
                    : <BsStar size={18} style={{ color: '#aaa' }} />
                  }
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#2D2D2D' }}>Featured Event</div>
                    <div style={{ fontSize: '0.8rem', color: '#888' }}>Shown in the highlighted strip on the Events page</div>
                  </div>
                  <Form.Check
                    type="switch"
                    id="edit-event-featured"
                    className="ms-auto"
                    checked={editForm.is_featured}
                    onChange={e => { e.stopPropagation(); setEF('is_featured', e.target.checked); }}
                  />
                </div>
              </div>

              <div className="d-flex gap-2 justify-content-end">
                <Button variant="outline-secondary" style={{ borderRadius: '8px' }} onClick={() => setIsEditing(false)} disabled={editLoading}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={editLoading}
                  style={{ background: 'linear-gradient(135deg,#7a8567,#c5df96)', border: 'none', borderRadius: '8px', fontWeight: 600, minWidth: '130px', color: '#fff' }}
                >
                  {editLoading ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </Form>
          )}

          {/* ── View mode ── */}
          {!isEditing && (
            <div className="row g-4">
            {/* ── Left: details ── */}
            <div className="col-md-7">
              {event.description && (
                <p style={{ color: '#5A5A5A', lineHeight: 1.75, marginBottom: '1.25rem' }}>
                  {event.description}
                </p>
              )}

              {/* Date */}
              <div className="d-flex align-items-start gap-2 mb-3">
                <BsCalendarEvent style={{ color: '#7a8567', marginTop: 3, flexShrink: 0 }} size={15} />
                <div>
                  <div style={{ fontWeight: 600, color: '#2D2D2D', fontSize: '0.9rem' }}>{fmtDate(event.starts_at)}</div>
                  <div style={{ color: '#666', fontSize: '0.85rem' }}>
                    {fmtTime(event.starts_at)}{event.ends_at ? ` – ${fmtTime(event.ends_at)}` : ''}
                  </div>
                </div>
              </div>

              {/* Location */}
              {event.location && (
                <div className="d-flex align-items-start gap-2 mb-3">
                  <BsGeoAlt style={{ color: '#7a8567', marginTop: 3, flexShrink: 0 }} size={15} />
                  <span style={{ color: '#5A5A5A', fontSize: '0.9rem' }}>{event.location}</span>
                </div>
              )}

              {/* Meeting URL */}
              {event.meeting_url && (
                <div className="d-flex align-items-start gap-2 mb-3">
                  <BsLink45Deg style={{ color: '#7a8567', marginTop: 3, flexShrink: 0 }} size={15} />
                  <a href={event.meeting_url} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#7a8567', fontSize: '0.9rem' }}>
                    Join Meeting <FiExternalLink size={11} />
                  </a>
                </div>
              )}

              {/* Host */}
              {event.profiles && (
                <div className="d-flex align-items-center gap-2 mb-3">
                  <BsPersonCircle style={{ color: '#7a8567' }} size={15} />
                  <span style={{ color: '#5A5A5A', fontSize: '0.88rem' }}>
                    Hosted by <strong>{event.profiles.full_name ?? event.profiles.email}</strong>
                  </span>
                </div>
              )}

              {/* Attendees */}
              {event.attendees && event.attendees.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: '0.4rem' }}>
                    <BsPeopleFill className="me-1" style={{ color: '#7a8567' }} />
                    {counts.going} people going
                  </p>
                  <div className="d-flex flex-wrap gap-1">
                    {event.attendees.slice(0, 8).map(a => (
                      <div
                        key={a.id}
                        title={a.full_name ?? a.email}
                        style={{
                          width: 30, height: 30, borderRadius: '50%',
                          background: 'linear-gradient(135deg,#7a8567,#c5df96)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: '0.7rem', fontWeight: 700,
                        }}
                      >
                        {(a.full_name ?? a.email)?.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {counts.going > 8 && (
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#E5E5E3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', color: '#666' }}>
                        +{counts.going - 8}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right: RSVP panel ── */}
            <div className="col-md-5">
              <div style={{ background: '#F5F5F3', borderRadius: '12px', padding: '1.25rem' }}>
                <h6 style={{ fontWeight: 700, color: '#2D2D2D', marginBottom: '0.85rem' }}>
                  <BsPeopleFill className="me-2" style={{ color: '#7a8567' }} />
                  Attendance
                </h6>

                {/* Count rows */}
                <div className="mb-3">
                  {[
                    { key: 'going',      label: '✓ Going',     val: counts.going      },
                    { key: 'interested', label: '★ Interested', val: counts.interested },
                  ].map(({ key, label, val }) => (
                    <div key={key} className="d-flex justify-content-between mb-1" style={{ fontSize: '0.85rem' }}>
                      <span style={{ color: key === 'going' ? '#7a8567' : '#666', fontWeight: key === 'going' ? 600 : 400 }}>
                        {label}
                      </span>
                      <strong>{val}</strong>
                    </div>
                  ))}
                  {event.max_attendees && (
                    <div className="d-flex justify-content-between" style={{ fontSize: '0.8rem', color: isFull ? '#dc3545' : '#7a8567' }}>
                      <span>Capacity</span>
                      <span>{counts.going} / {event.max_attendees}</span>
                    </div>
                  )}
                </div>

                {/* Capacity bar */}
                {event.max_attendees && (
                  <div style={{ background: '#E5E5E3', borderRadius: 4, height: 6, marginBottom: '1rem' }}>
                    <div style={{
                      background: isFull ? '#dc3545' : 'linear-gradient(90deg,#7a8567,#c5df96)',
                      width: `${capacityPct}%`,
                      height: '100%',
                      borderRadius: 4,
                      transition: 'width .4s ease',
                    }} />
                  </div>
                )}

                {/* RSVP buttons */}
                {!event.is_cancelled && (
                  <div className="d-flex flex-column gap-2">
                    <Button
                      className="w-100"
                      style={rsvpBtnStyle('going')}
                      disabled={loading || (isFull && userRsvp !== 'going')}
                      onClick={() => handleRsvp('going')}
                    >
                      {loading
                        ? <Spinner size="sm" animation="border" />
                        : userRsvp === 'going' ? "✓ You're Going!" : "✓ I'm Going"}
                    </Button>
                    <Button
                      className="w-100"
                      style={rsvpBtnStyle('interested')}
                      disabled={loading}
                      onClick={() => handleRsvp('interested')}
                    >
                      {userRsvp === 'interested' ? '★ Marked as Interested' : '★ Interested'}
                    </Button>
                    <Button
                      className="w-100"
                      variant="outline-secondary"
                      style={rsvpBtnStyle('not_going')}
                      disabled={loading}
                      onClick={() => handleRsvp('not_going')}
                    >
                      {userRsvp === 'not_going' ? "✕ Not Going" : "Can't Make It"}
                    </Button>
                  </div>
                )}

                {/* Reminder button — shown only when user is going */}
                {userRsvp === 'going' && !reminderSet && (
                  <Button
                    variant="link"
                    size="sm"
                    className="w-100 mt-2"
                    style={{ color: '#7a8567', fontSize: '0.82rem', textDecoration: 'none' }}
                    onClick={handleSetReminder}
                  >
                    <BsBell className="me-1" />Set reminder (1 hr before)
                  </Button>
                )}
                {reminderSet && (
                  <div className="text-center mt-2" style={{ fontSize: '0.82rem', color: '#7a8567' }}>
                    <BsBell className="me-1" />Reminder saved!
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
        </Modal.Body>
      </div>
    </Modal>
  );
}
