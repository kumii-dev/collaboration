import { useState } from 'react';
import { Modal, Form, Button, Alert, Row, Col } from 'react-bootstrap';
import { BsCalendarPlus } from 'react-icons/bs';
import { CommunityEvent, CreateEventPayload, eventsApi } from '../../lib/eventsApi';

interface Props {
  show: boolean;
  onHide: () => void;
  categoryId: string;
  onCreated: (event: CommunityEvent) => void;
}

const INITIAL = {
  category_id:   '',
  title:         '',
  description:   '',
  location:      '',
  meeting_url:   '',
  starts_at:     '',
  ends_at:       '',
  max_attendees: '' as string,
  is_online:     false,
};

export default function CreateEventModal({ show, onHide, categoryId, onCreated }: Props) {
  const [form,    setForm]    = useState({ ...INITIAL, category_id: categoryId });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const set = (key: string, val: unknown) => setForm(p => ({ ...p, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: CreateEventPayload = {
        category_id:   categoryId,
        title:         form.title,
        description:   form.description || undefined,
        location:      form.is_online ? undefined : (form.location || undefined),
        meeting_url:   form.is_online ? (form.meeting_url || undefined) : undefined,
        starts_at:     new Date(form.starts_at).toISOString(),
        ends_at:       form.ends_at ? new Date(form.ends_at).toISOString() : undefined,
        max_attendees: form.max_attendees ? parseInt(form.max_attendees as string) : undefined,
        is_online:     form.is_online,
      };

      const event = await eventsApi.create(payload);
      onCreated(event);
      onHide();
      setForm({ ...INITIAL, category_id: categoryId });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message);
    } finally {
      setLoading(false);
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

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg,#7a8567,#c5df96)' }} />

        <Modal.Header closeButton style={{ borderBottom: '1px solid #E5E5E3', padding: '1.25rem 1.5rem' }}>
          <Modal.Title style={{ fontWeight: 700, color: '#2D2D2D', fontSize: '1.1rem' }}>
            <BsCalendarPlus className="me-2" style={{ color: '#7a8567' }} />
            Create Community Event
          </Modal.Title>
        </Modal.Header>

        <Modal.Body style={{ padding: '1.5rem' }}>
          {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

          <Form onSubmit={handleSubmit}>
            {/* Title */}
            <Form.Group className="mb-3">
              <Form.Label style={labelStyle}>Event Title <span className="text-danger">*</span></Form.Label>
              <Form.Control
                style={inputStyle}
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="e.g. Monthly Startup Meetup"
                required
              />
            </Form.Group>

            {/* Description */}
            <Form.Group className="mb-3">
              <Form.Label style={labelStyle}>Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                style={{ ...inputStyle, resize: 'none' }}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="What is this event about?"
              />
            </Form.Group>

            {/* Date range */}
            <Row className="mb-3">
              <Col>
                <Form.Label style={labelStyle}>Start <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="datetime-local"
                  style={inputStyle}
                  value={form.starts_at}
                  onChange={e => set('starts_at', e.target.value)}
                  required
                />
              </Col>
              <Col>
                <Form.Label style={labelStyle}>End (optional)</Form.Label>
                <Form.Control
                  type="datetime-local"
                  style={inputStyle}
                  value={form.ends_at}
                  onChange={e => set('ends_at', e.target.value)}
                />
              </Col>
            </Row>

            {/* Online toggle */}
            <Form.Group className="mb-3">
              <Form.Check
                type="switch"
                id="create-event-online"
                label={<span style={labelStyle}>Online Event</span>}
                checked={form.is_online}
                onChange={e => set('is_online', e.target.checked)}
                style={{ accentColor: '#7a8567' }}
              />
            </Form.Group>

            {/* Location / URL */}
            {form.is_online ? (
              <Form.Group className="mb-3">
                <Form.Label style={labelStyle}>Meeting URL</Form.Label>
                <Form.Control
                  type="url"
                  style={inputStyle}
                  value={form.meeting_url}
                  onChange={e => set('meeting_url', e.target.value)}
                  placeholder="https://zoom.us/j/..."
                />
              </Form.Group>
            ) : (
              <Form.Group className="mb-3">
                <Form.Label style={labelStyle}>Location</Form.Label>
                <Form.Control
                  style={inputStyle}
                  value={form.location}
                  onChange={e => set('location', e.target.value)}
                  placeholder="e.g. Nairobi Hub, Floor 3"
                />
              </Form.Group>
            )}

            {/* Capacity */}
            <Form.Group className="mb-4">
              <Form.Label style={labelStyle}>Max Attendees (optional)</Form.Label>
              <Form.Control
                type="number"
                min="1"
                style={inputStyle}
                value={form.max_attendees}
                onChange={e => set('max_attendees', e.target.value)}
                placeholder="Leave empty for unlimited"
              />
            </Form.Group>

            <div className="d-flex gap-2 justify-content-end">
              <Button
                variant="outline-secondary"
                onClick={onHide}
                style={{ borderRadius: '8px' }}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg,#7a8567,#c5df96)',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  minWidth: '130px',
                  color: '#fff',
                }}
              >
                {loading ? 'Creating…' : 'Create Event'}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </div>
    </Modal>
  );
}
