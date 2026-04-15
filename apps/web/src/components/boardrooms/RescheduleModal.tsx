import { useState, useEffect } from 'react';
import { Modal, Button, Spinner, Alert, Form } from 'react-bootstrap';
import { FiCalendar, FiClock, FiRefreshCw } from 'react-icons/fi';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { fetchAvailability, rescheduleBooking, getBookableDates, Booking } from '../../lib/boardroomApi';

// ── Hours available for selection (07:00–19:00 start = 08:00 end) ─────────────
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7..19

interface Props {
  booking: Booking;
  show:    boolean;
  onHide:  () => void;
}

export default function RescheduleModal({ booking, show, onHide }: Props) {
  const qc        = useQueryClient();
  const dates     = getBookableDates();
  const room      = booking.boardrooms;
  const roomName  = room?.name ?? 'Boardroom';

  // Current booking's SAST date as default selected date
  const currentSAST = new Date(new Date(booking.slot_start).getTime() + 2 * 60 * 60 * 1000);
  const currentDate = currentSAST.toISOString().slice(0, 10);
  const currentHour = currentSAST.getUTCHours();

  const [selectedDate, setSelectedDate] = useState<string>(currentDate);
  const [selectedHour, setSelectedHour] = useState<number | null>(currentHour);
  const [apiError,     setApiError]     = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (show) {
      setSelectedDate(currentDate);
      setSelectedHour(currentHour);
      setApiError(null);
      setSuccess(false);
    }
  }, [show]);

  // Fetch availability for the selected date
  const { data: slots = [], isFetching: slotsLoading } = useQuery(
    ['reschedule-availability', booking.boardroom_id, selectedDate],
    () => fetchAvailability(booking.boardroom_id, selectedDate),
    { staleTime: 30_000, enabled: show }
  );

  // Build a set of hours that are blocked (held by someone else)
  const blockedHours = new Set(
    slots
      .filter(s => !s.available && !s.is_mine)
      .map(s => new Date(new Date(s.slot_start).getTime() + 2 * 60 * 60 * 1000).getUTCHours())
  );

  // Is the currently-selected hour the same as the current booking?
  const unchanged = selectedDate === currentDate && selectedHour === currentHour;

  const mutation = useMutation(
    () => {
      // Build UTC ISO from SAST date + hour
      const utcHour = selectedHour! - 2; // SAST - 2 = UTC
      // Handle day-wrap if utcHour < 0
      const [y, m, d] = selectedDate.split('-').map(Number);
      const utcDate   = new Date(Date.UTC(y, m - 1, d, utcHour < 0 ? 22 : utcHour));
      if (utcHour < 0) utcDate.setUTCDate(utcDate.getUTCDate() - 1);
      return rescheduleBooking(booking.id, utcDate.toISOString());
    },
    {
      onSuccess: () => {
        qc.invalidateQueries('all-bookings');
        qc.invalidateQueries('calendar-bookings');
        qc.invalidateQueries('my-bookings');
        qc.invalidateQueries('boardroom-availability');
        setSuccess(true);
      },
      onError: (err: any) => {
        setApiError(err?.response?.data?.error ?? err?.message ?? 'Reschedule failed');
      },
    }
  );

  const handleConfirm = () => {
    if (selectedHour === null) return;
    setApiError(null);
    mutation.mutate();
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header
        closeButton
        style={{
          background: 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)',
          borderBottom: 'none',
        }}
      >
        <Modal.Title style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>
          <FiRefreshCw className="me-2" />
          Reschedule Booking
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {success ? (
          <div className="text-center py-3">
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <p style={{ fontWeight: 600, color: '#3a3a3a' }}>Booking rescheduled!</p>
            <p style={{ fontSize: 13, color: '#666' }}>
              The user has been notified and their Outlook calendar updated.
            </p>
            <Button
              size="sm"
              onClick={onHide}
              style={{ background: '#7a8567', borderColor: '#7a8567', color: 'white' }}
            >
              Close
            </Button>
          </div>
        ) : (
          <>
            {/* Room + current booking info */}
            <div
              style={{
                background: '#f7f9f4',
                border: '1px solid #e0e8d0',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: '#555',
              }}
            >
              <strong style={{ color: '#3a3a3a' }}>{roomName}</strong>
              <div className="mt-1">
                <FiCalendar size={12} className="me-1" />
                Currently: <strong>{currentSAST.toLocaleDateString('en-ZA', {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
                })}</strong> at <strong>{String(currentHour).padStart(2, '0')}:00 – {String(currentHour + 1).padStart(2, '0')}:00 SAST</strong>
              </div>
            </div>

            {apiError && (
              <Alert variant="danger" onClose={() => setApiError(null)} dismissible className="py-2" style={{ fontSize: 13 }}>
                {apiError}
              </Alert>
            )}

            {/* Date picker */}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 13, fontWeight: 600 }}>
                <FiCalendar size={13} className="me-1" />New Date
              </Form.Label>
              <Form.Select
                size="sm"
                value={selectedDate}
                onChange={e => { setSelectedDate(e.target.value); setSelectedHour(null); }}
                style={{ fontSize: 13 }}
              >
                {dates.map(({ iso, label }) => (
                  <option key={iso} value={iso}>{label}</option>
                ))}
              </Form.Select>
            </Form.Group>

            {/* Hour grid */}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 13, fontWeight: 600 }}>
                <FiClock size={13} className="me-1" />New Time (SAST)
                {slotsLoading && <Spinner size="sm" animation="border" className="ms-2" style={{ color: '#7a8567' }} />}
              </Form.Label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 6,
                }}
              >
                {HOURS.map(hour => {
                  const isBlocked  = blockedHours.has(hour);
                  const isCurrent  = selectedDate === currentDate && hour === currentHour;
                  const isSelected = hour === selectedHour;

                  let bg     = 'white';
                  let border = '1px solid #ddd';
                  let color  = '#333';
                  let cursor = 'pointer';

                  if (isBlocked) {
                    bg = '#f5f5f5'; border = '1px solid #eee'; color = '#bbb'; cursor = 'not-allowed';
                  } else if (isSelected) {
                    bg = '#7a8567'; border = '1px solid #7a8567'; color = 'white';
                  } else if (isCurrent) {
                    bg = '#f0f4ea'; border = '1px solid #c5df96'; color = '#5a6e45';
                  }

                  return (
                    <button
                      key={hour}
                      disabled={isBlocked}
                      onClick={() => !isBlocked && setSelectedHour(hour)}
                      title={isBlocked ? 'Already booked' : isCurrent ? 'Current slot' : ''}
                      style={{
                        padding: '8px 4px',
                        borderRadius: 8,
                        background: bg,
                        border,
                        color,
                        cursor,
                        fontSize: 12,
                        fontWeight: isSelected ? 700 : 400,
                        transition: 'all 0.12s ease',
                        textAlign: 'center',
                        lineHeight: 1.2,
                      }}
                    >
                      {String(hour).padStart(2, '0')}:00
                      {isCurrent && !isSelected && (
                        <div style={{ fontSize: 9, color: '#7a8567', marginTop: 1 }}>current</div>
                      )}
                      {isBlocked && (
                        <div style={{ fontSize: 9, color: '#ccc', marginTop: 1 }}>taken</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </Form.Group>

            {/* Selected summary */}
            {selectedHour !== null && (
              <div style={{ fontSize: 13, color: '#555', background: '#f7f9f4', borderRadius: 8, padding: '8px 12px' }}>
                New slot:{' '}
                <strong>
                  {new Date(Date.UTC(...selectedDate.split('-').map(Number) as [number, number, number], 12))
                    .toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  {' '}at {String(selectedHour).padStart(2, '0')}:00 – {String(selectedHour + 1).padStart(2, '0')}:00 SAST
                </strong>
              </div>
            )}
          </>
        )}
      </Modal.Body>

      {!success && (
        <Modal.Footer style={{ borderTop: '1px solid #eee' }}>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={onHide}
            disabled={mutation.isLoading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={selectedHour === null || unchanged || mutation.isLoading || slotsLoading}
            style={{
              background: '#7a8567', borderColor: '#7a8567', color: 'white',
              opacity: (selectedHour === null || unchanged) ? 0.5 : 1,
            }}
          >
            {mutation.isLoading
              ? <><Spinner size="sm" animation="border" className="me-1" />Rescheduling…</>
              : <><FiRefreshCw size={13} className="me-1" />Confirm Reschedule</>
            }
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}
