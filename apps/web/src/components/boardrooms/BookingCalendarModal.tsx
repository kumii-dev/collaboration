import React, { useState } from 'react';
import { Modal, Button, Spinner, Alert, Badge, Form } from 'react-bootstrap';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { FiChevronLeft, FiChevronRight, FiClock } from 'react-icons/fi';
import {
  Boardroom,
  BookingSlot,
  fetchAvailability,
  createBooking,
  getBookableDates,
} from '../../lib/boardroomApi';

interface Props {
  show:      boolean;
  onHide:    () => void;
  boardroom: Boardroom;
}

const BTN_STYLE    = { background: '#7a8567', borderColor: '#7a8567', color: 'white' };
const ACTIVE_SLOT  = { background: 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)', color: 'white', borderColor: 'transparent' };
const MINE_SLOT    = { background: '#e8f4d4', color: '#7a8567', borderColor: '#c5df96' };
const BOOKED_SLOT  = { background: '#f5f5f5', color: '#aaa', borderColor: '#e5e5e3', cursor: 'not-allowed' };
const AVAIL_SLOT   = { background: 'white', color: '#444', borderColor: '#E5E5E3', cursor: 'pointer' };

export default function BookingCalendarModal({ show, onHide, boardroom }: Props) {
  const qc          = useQueryClient();
  const dates       = getBookableDates();
  const [dayIdx,    setDayIdx]    = useState(0);
  const [selected,  setSelected]  = useState<BookingSlot | null>(null);
  const [notes,     setNotes]     = useState('');
  const [success,   setSuccess]   = useState(false);
  const [apiError,  setApiError]  = useState<string | null>(null);

  const currentDay = dates[dayIdx];

  // Reset when modal opens
  React.useEffect(() => {
    if (show) {
      setDayIdx(0);
      setSelected(null);
      setNotes('');
      setSuccess(false);
      setApiError(null);
    }
  }, [show]);

  // Reset selected slot when day changes
  React.useEffect(() => {
    setSelected(null);
  }, [dayIdx]);

  const { data: slots, isLoading: slotsLoading } = useQuery(
    ['boardroom-availability', boardroom.id, currentDay?.iso],
    () => fetchAvailability(boardroom.id, currentDay!.iso),
    { enabled: !!currentDay, staleTime: 30_000 }
  );

  const bookMutation = useMutation(
    () => createBooking({
      boardroom_id: boardroom.id,
      slot_start:   selected!.slot_start,
      notes:        notes.trim() || undefined,
    }),
    {
      onSuccess: () => {
        qc.invalidateQueries(['boardroom-availability', boardroom.id]);
        qc.invalidateQueries('my-bookings');
        setSuccess(true);
        setSelected(null);
        setNotes('');
      },
      onError: (err: any) => {
        setApiError(err?.response?.data?.error ?? err?.message ?? 'Booking failed');
      },
    }
  );

  const handleBook = () => {
    if (!selected) return;
    setApiError(null);
    bookMutation.mutate();
  };

  const handleClose = () => {
    setSuccess(false);
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title style={{ color: '#7a8567', fontWeight: 700 }}>
          Book · {boardroom.name}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {success ? (
          <div className="text-center py-4">
            <div style={{ fontSize: 48 }}>✅</div>
            <h5 className="mt-3" style={{ color: '#7a8567' }}>Booking Confirmed!</h5>
            <p className="text-muted">
              You'll receive a notification 60 and 30 minutes before your booking.
            </p>
            <Button style={BTN_STYLE} onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <>
            {apiError && <Alert variant="danger" onClose={() => setApiError(null)} dismissible>{apiError}</Alert>}

            {/* ── Day Selector ── */}
            <div className="d-flex align-items-center justify-content-between mb-3">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setDayIdx(i => Math.max(0, i - 1))}
                disabled={dayIdx === 0}
              >
                <FiChevronLeft />
              </Button>
              <span style={{ fontWeight: 600, color: '#7a8567' }}>
                {currentDay?.label}
              </span>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setDayIdx(i => Math.min(dates.length - 1, i + 1))}
                disabled={dayIdx >= dates.length - 1}
              >
                <FiChevronRight />
              </Button>
            </div>

            {/* ── Slot Grid ── */}
            {slotsLoading ? (
              <div className="text-center py-4">
                <Spinner animation="border" style={{ color: '#7a8567' }} />
              </div>
            ) : (
              <div className="d-flex flex-wrap gap-2 mb-3">
                {(slots ?? []).map(slot => {
                  const isSelected = selected?.slot_start === slot.slot_start;
                  const style = isSelected
                    ? ACTIVE_SLOT
                    : slot.is_mine
                      ? MINE_SLOT
                      : !slot.available
                        ? BOOKED_SLOT
                        : AVAIL_SLOT;

                  return (
                    <button
                      key={slot.slot_start}
                      onClick={() => slot.available && !slot.is_mine && setSelected(slot)}
                      disabled={!slot.available || slot.is_mine}
                      style={{
                        ...style,
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: '1px solid',
                        fontSize: 13,
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <FiClock size={13} />
                      {slot.label.replace(' SAST', '')}
                      {slot.is_mine && (
                        <Badge style={{ background: '#7a8567', fontSize: 10, marginLeft: 4 }}>
                          Yours
                        </Badge>
                      )}
                      {!slot.available && !slot.is_mine && (
                        <span style={{ fontSize: 10, marginLeft: 4, color: '#bbb' }}>Booked</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Notes ── */}
            {selected && (
              <div
                style={{
                  background: '#f0f4ea',
                  borderRadius: 10,
                  padding: '14px 16px',
                  marginBottom: 8,
                  border: '1px solid #c5df96',
                }}
              >
                <p className="mb-2" style={{ fontWeight: 600, color: '#7a8567' }}>
                  Selected: {currentDay?.label} · {selected.label}
                </p>
                <Form.Group>
                  <Form.Label style={{ fontSize: 13, color: '#666' }}>
                    Notes <span className="text-muted">(optional)</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    maxLength={500}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Purpose of booking, attendees, etc."
                    style={{ fontSize: 13 }}
                  />
                </Form.Group>
              </div>
            )}

            <p style={{ fontSize: 12, color: '#999', marginBottom: 0 }}>
              All times shown in SAST (UTC+2). Slots are 1 hour each (08:00–17:00, Mon–Fri). Bookings up to 1 month in advance.
            </p>
          </>
        )}
      </Modal.Body>

      {!success && (
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={handleClose} disabled={bookMutation.isLoading}>
            Cancel
          </Button>
          <Button
            style={BTN_STYLE}
            onClick={handleBook}
            disabled={!selected || bookMutation.isLoading}
          >
            {bookMutation.isLoading
              ? <><Spinner size="sm" animation="border" className="me-2" />Booking…</>
              : 'Confirm Booking'}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}
