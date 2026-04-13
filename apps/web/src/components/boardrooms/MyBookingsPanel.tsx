import { useState } from 'react';
import { Card, Button, Spinner, Alert } from 'react-bootstrap';
import { FiCalendar, FiClock, FiX, FiUpload, FiAlertCircle } from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  fetchMyBookings,
  cancelBooking,
  formatSlotSAST,
  formatDateSAST,
  Booking,
  BookingStatus,
} from '../../lib/boardroomApi';
import PaymentSubmitModal from './PaymentSubmitModal';

interface Props {
  isAdmin: boolean;
}

// ── Status badge helper ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BookingStatus }) {
  const map: Record<BookingStatus, { label: string; bg: string; color: string }> = {
    pending:            { label: 'Awaiting Payment', bg: '#fff3cd', color: '#856404' },
    awaiting_approval:  { label: 'Under Review',     bg: '#cff4fc', color: '#055160' },
    confirmed:          { label: 'Confirmed',         bg: '#d1e7dd', color: '#0a3622' },
    rejected:           { label: 'Rejected',          bg: '#f8d7da', color: '#842029' },
    cancelled:          { label: 'Cancelled',         bg: '#e9ecef', color: '#6c757d' },
  };
  const cfg = map[status] ?? { label: status, bg: '#e9ecef', color: '#6c757d' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Single booking row ────────────────────────────────────────────────────────

function BookingRow({
  booking,
  onCancel,
  onSubmitPayment,
  cancelLoading,
}: {
  booking:         Booking;
  onCancel:        () => void;
  onSubmitPayment: () => void;
  cancelLoading:   boolean;
}) {
  const room      = booking.boardrooms;
  const dateLabel = formatDateSAST(booking.slot_start);
  const timeLabel = formatSlotSAST(booking.slot_start);
  const isPast    = new Date(booking.slot_end) < new Date();

  const canCancel =
    !isPast && (booking.status === 'pending' || booking.status === 'awaiting_approval' || booking.status === 'confirmed');

  return (
    <div
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid #f0f4ea',
        opacity: booking.status === 'cancelled' || booking.status === 'rejected' ? 0.7 : 1,
      }}
    >
      {/* Top row: room name + status badge */}
      <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
        <span style={{ fontWeight: 600, color: '#3a3a3a', fontSize: 14 }}>
          {room?.name ?? 'Boardroom'}
        </span>
        <StatusBadge status={booking.status} />
      </div>

      {/* Date / time */}
      <div style={{ fontSize: 13, color: '#666', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <span><FiCalendar size={12} className="me-1" />{dateLabel}</span>
        <span><FiClock    size={12} className="me-1" />{timeLabel}</span>
      </div>

      {/* Notes */}
      {booking.notes && (
        <div style={{ fontSize: 12, color: '#999', fontStyle: 'italic', marginBottom: 6 }}>
          "{booking.notes}"
        </div>
      )}

      {/* Payment reference (awaiting_approval / confirmed) */}
      {booking.payment_reference && (
        <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
          Ref: <strong>{booking.payment_reference}</strong>
        </div>
      )}

      {/* Rejection reason */}
      {booking.status === 'rejected' && booking.rejection_reason && (
        <div
          style={{
            background: '#f8d7da',
            border: '1px solid #f5c2c7',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            color: '#842029',
            marginBottom: 6,
            display: 'flex',
            gap: 6,
            alignItems: 'flex-start',
          }}
        >
          <FiAlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{booking.rejection_reason}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="d-flex gap-2 mt-1">
        {booking.status === 'pending' && (
          <Button
            size="sm"
            onClick={onSubmitPayment}
            style={{
              fontSize: 12,
              padding: '3px 12px',
              background: '#7a8567',
              borderColor: '#7a8567',
              color: 'white',
            }}
          >
            <FiUpload size={12} className="me-1" />
            Submit Payment Proof
          </Button>
        )}
        {canCancel && (
          <Button
            size="sm"
            variant="outline-danger"
            style={{ fontSize: 12, padding: '3px 10px' }}
            onClick={onCancel}
            disabled={cancelLoading}
          >
            {cancelLoading ? <Spinner size="sm" animation="border" /> : <><FiX size={12} className="me-1" />Cancel</>}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function MyBookingsPanel({ isAdmin: _isAdmin }: Props) {
  const qc = useQueryClient();

  const [paymentBooking, setPaymentBooking] = useState<Booking | null>(null);
  const [cancellingId,   setCancellingId]   = useState<string | null>(null);
  const [showHistory,    setShowHistory]    = useState(false);

  const { data, isLoading, isError } = useQuery<Booking[]>(
    'my-bookings',
    fetchMyBookings,
    { staleTime: 30_000 }
  );

  const cancelMutation = useMutation(
    (id: string) => cancelBooking(id),
    {
      onMutate:  (id) => setCancellingId(id),
      onSettled: ()   => setCancellingId(null),
      onSuccess: () => {
        qc.invalidateQueries('my-bookings');
        qc.invalidateQueries('all-bookings');
        qc.invalidateQueries('boardroom-availability');
      },
    }
  );

  const bookings = data ?? [];
  const now      = new Date();

  const needsAction = bookings.filter(b => b.status === 'pending' || b.status === 'awaiting_approval');
  const upcoming    = bookings.filter(b => b.status === 'confirmed' && new Date(b.slot_end) >= now);
  const historical  = bookings.filter(b =>
    b.status === 'cancelled' ||
    b.status === 'rejected'  ||
    (b.status === 'confirmed' && new Date(b.slot_end) < now)
  );

  return (
    <>
      <Card style={{ borderRadius: 14, border: '1px solid #E5E5E3' }}>
        <Card.Header
          style={{
            background: 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)',
            borderRadius: '14px 14px 0 0',
            padding: '12px 16px',
          }}
        >
          <span style={{ fontWeight: 700, color: 'white', fontSize: 15 }}>My Bookings</span>
        </Card.Header>

        <Card.Body style={{ padding: 0 }}>
          {isLoading && (
            <div className="text-center py-4">
              <Spinner animation="border" style={{ color: '#7a8567' }} />
            </div>
          )}

          {isError && (
            <Alert variant="danger" className="m-3">Failed to load bookings.</Alert>
          )}

          {cancelMutation.isError && (
            <Alert variant="danger" className="m-3" style={{ fontSize: 13 }}>
              {(cancelMutation.error as any)?.response?.data?.error ?? 'Cancel failed. Please try again.'}
            </Alert>
          )}

          {!isLoading && bookings.length === 0 && (
            <div className="text-center py-5 text-muted" style={{ fontSize: 14 }}>
              You have no bookings yet.
            </div>
          )}

          {/* ── Needs Action ── */}
          {needsAction.length > 0 && (
            <>
              <div style={{ padding: '10px 16px 4px', fontSize: 11, fontWeight: 700, color: '#7a8567', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Action Required
              </div>
              {needsAction.map(b => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  onCancel={() => cancelMutation.mutate(b.id)}
                  onSubmitPayment={() => setPaymentBooking(b)}
                  cancelLoading={cancellingId === b.id}
                />
              ))}
            </>
          )}

          {/* ── Upcoming Confirmed ── */}
          {upcoming.length > 0 && (
            <>
              <div style={{ padding: '10px 16px 4px', fontSize: 11, fontWeight: 700, color: '#7a8567', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Upcoming
              </div>
              {upcoming.map(b => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  onCancel={() => cancelMutation.mutate(b.id)}
                  onSubmitPayment={() => setPaymentBooking(b)}
                  cancelLoading={cancellingId === b.id}
                />
              ))}
            </>
          )}

          {/* ── History toggle ── */}
          {historical.length > 0 && (
            <>
              <button
                onClick={() => setShowHistory(s => !s)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: '#fafafa',
                  border: 'none',
                  borderTop: '1px solid #f0f4ea',
                  textAlign: 'left',
                  fontSize: 12,
                  color: '#888',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {showHistory ? '▲' : '▼'} History ({historical.length})
              </button>
              {showHistory && historical.map(b => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  onCancel={() => cancelMutation.mutate(b.id)}
                  onSubmitPayment={() => setPaymentBooking(b)}
                  cancelLoading={cancellingId === b.id}
                />
              ))}
            </>
          )}
        </Card.Body>
      </Card>

      {paymentBooking && (
        <PaymentSubmitModal
          show={!!paymentBooking}
          onHide={() => setPaymentBooking(null)}
          booking={paymentBooking}
        />
      )}
    </>
  );
}
