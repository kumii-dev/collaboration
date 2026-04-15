import { useState } from 'react';
import { Card, Button, Spinner, Alert, Form, Badge } from 'react-bootstrap';
import { FiCheck, FiX, FiCalendar, FiClock, FiLink, FiHash, FiUser, FiRefreshCw } from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  fetchAllBookings,
  approveBooking,
  cancelBooking,
  formatSlotSAST,
  formatDateSAST,
  Booking,
  BookingStatus,
} from '../../lib/boardroomApi';
import RescheduleModal from './RescheduleModal';

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BookingStatus }) {
  const map: Record<BookingStatus, { label: string; bg: string }> = {
    pending:            { label: 'Awaiting Payment', bg: 'warning'  },
    awaiting_approval:  { label: 'Needs Review',     bg: 'info'     },
    confirmed:          { label: 'Confirmed',         bg: 'success'  },
    rejected:           { label: 'Rejected',          bg: 'danger'   },
    cancelled:          { label: 'Cancelled',         bg: 'secondary'},
  };
  const cfg = map[status] ?? { label: status, bg: 'secondary' };
  return <Badge bg={cfg.bg} style={{ fontSize: 11 }}>{cfg.label}</Badge>;
}

// ── Approve / reject panel ────────────────────────────────────────────────────

function ApprovePanel({
  booking,
  onDone,
}: {
  booking: Booking;
  onDone:  () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason]   = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  const mutation = useMutation(
    (payload: { approve: boolean; rejection_reason?: string }) =>
      approveBooking(booking.id, payload),
    {
      onSuccess: () => {
        qc.invalidateQueries('all-bookings');
        qc.invalidateQueries('boardroom-availability');
        onDone();
      },
      onError: (err: any) => {
        setApiError(err?.response?.data?.error ?? err?.message ?? 'Action failed');
      },
    }
  );

  const handleApprove = () => { setApiError(null); mutation.mutate({ approve: true }); };
  const handleReject  = () => {
    if (!reason.trim()) { setApiError('Please provide a rejection reason'); return; }
    setApiError(null);
    mutation.mutate({ approve: false, rejection_reason: reason.trim() });
  };

  return (
    <div
      style={{
        background: '#f0f4ea',
        border: '1px solid #c5df96',
        borderRadius: 8,
        padding: '12px 14px',
        marginTop: 10,
      }}
    >
      {apiError && (
        <Alert variant="danger" onClose={() => setApiError(null)} dismissible className="py-2 mb-2" style={{ fontSize: 12 }}>
          {apiError}
        </Alert>
      )}

      <div className="d-flex gap-2 mb-2 align-items-center">
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={mutation.isLoading}
          style={{ background: '#198754', borderColor: '#198754', color: 'white', fontSize: 12 }}
        >
          {mutation.isLoading ? <Spinner size="sm" animation="border" /> : <><FiCheck size={12} className="me-1" />Approve</>}
        </Button>
        <span style={{ fontSize: 12, color: '#888' }}>or reject with a reason:</span>
      </div>

      <Form.Group className="mb-2">
        <Form.Control
          as="textarea"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Rejection reason (required)"
          style={{ fontSize: 12 }}
        />
      </Form.Group>

      <div className="d-flex gap-2">
        <Button
          size="sm"
          variant="outline-danger"
          onClick={handleReject}
          disabled={mutation.isLoading}
          style={{ fontSize: 12 }}
        >
          <FiX size={12} className="me-1" />Reject
        </Button>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={onDone}
          disabled={mutation.isLoading}
          style={{ fontSize: 12 }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Booking card ──────────────────────────────────────────────────────────────

function AdminBookingCard({ booking }: { booking: Booking }) {
  const qc = useQueryClient();
  const [expanded,       setExpanded]       = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);

  const room    = booking.boardrooms;
  const profile = booking.profiles;

  const cancelMutation = useMutation(
    () => cancelBooking(booking.id),
    {
      onSuccess: () => {
        qc.invalidateQueries('all-bookings');
        qc.invalidateQueries('boardroom-availability');
      },
    }
  );

  const isActionable = booking.status === 'awaiting_approval';

  return (
    <div
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid #f0f4ea',
        opacity: booking.status === 'confirmed' ? 0.85 : 1,
      }}
    >
      {/* Header row */}
      <div className="d-flex align-items-center justify-content-between gap-2 mb-1 flex-wrap">
        <span style={{ fontWeight: 600, color: '#3a3a3a', fontSize: 14 }}>
          {room?.name ?? 'Boardroom'}
        </span>
        <StatusBadge status={booking.status} />
      </div>

      {/* Date / time */}
      <div style={{ fontSize: 13, color: '#666', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <span><FiCalendar size={12} className="me-1" />{formatDateSAST(booking.slot_start)}</span>
        <span><FiClock    size={12} className="me-1" />{formatSlotSAST(booking.slot_start)}</span>
      </div>

      {/* User */}
      {profile && (
        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
          <FiUser size={12} className="me-1" />
          {profile.full_name ?? 'Unknown'} · {profile.email}
        </div>
      )}

      {/* Notes */}
      {booking.notes && (
        <div style={{ fontSize: 12, color: '#999', fontStyle: 'italic', marginBottom: 4 }}>
          "{booking.notes}"
        </div>
      )}

      {/* Payment proof */}
      {booking.payment_proof_url && (
        <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>
          <FiLink size={12} className="me-1" />
          <a href={booking.payment_proof_url} target="_blank" rel="noreferrer" style={{ color: '#7a8567' }}>
            View Payment Proof
          </a>
        </div>
      )}
      {booking.payment_reference && (
        <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
          <FiHash size={12} className="me-1" />
          Ref: <strong>{booking.payment_reference}</strong>
        </div>
      )}

      {/* Action buttons */}
      {isActionable && !expanded && (
        <div className="d-flex gap-2 mt-2">
          <Button
            size="sm"
            onClick={() => setExpanded(true)}
            style={{ fontSize: 12, background: '#7a8567', borderColor: '#7a8567', color: 'white', padding: '3px 12px' }}
          >
            Review
          </Button>
        </div>
      )}

      {isActionable && expanded && (
        <ApprovePanel booking={booking} onDone={() => setExpanded(false)} />
      )}

      {/* Admin cancel for confirmed */}
      {booking.status === 'confirmed' && (
        <div className="d-flex gap-2 mt-2 flex-wrap">
          <Button
            size="sm"
            variant="outline-secondary"
            style={{ fontSize: 11, padding: '2px 10px' }}
            onClick={() => setShowReschedule(true)}
          >
            <FiRefreshCw size={11} className="me-1" />Reschedule
          </Button>
          <Button
            size="sm"
            variant="outline-danger"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isLoading}
          >
            {cancelMutation.isLoading
              ? <Spinner size="sm" animation="border" />
              : <><FiX size={11} className="me-1" />Cancel Booking</>
            }
          </Button>
        </div>
      )}

      {/* Reschedule modal */}
      <RescheduleModal
        booking={booking}
        show={showReschedule}
        onHide={() => setShowReschedule(false)}
      />
    </div>
  );
}

// ── Main admin panel ──────────────────────────────────────────────────────────

export default function AdminBookingsPanel() {
  const { data, isLoading, isError } = useQuery<Booking[]>(
    'all-bookings',
    fetchAllBookings,
    { staleTime: 30_000 }
  );

  const bookings = data ?? [];

  const queue     = bookings.filter(b => b.status === 'awaiting_approval' || b.status === 'pending');
  const confirmed = bookings.filter(b => b.status === 'confirmed');

  const awaitingCount = bookings.filter(b => b.status === 'awaiting_approval').length;

  return (
    <Card style={{ borderRadius: 14, border: '1px solid #E5E5E3' }}>
      <Card.Header
        style={{
          background: 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)',
          borderRadius: '14px 14px 0 0',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 700, color: 'white', fontSize: 15 }}>Booking Approvals</span>
        {awaitingCount > 0 && (
          <Badge bg="danger" style={{ fontSize: 11 }}>{awaitingCount} needs review</Badge>
        )}
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

        {/* Approval queue */}
        {!isLoading && queue.length === 0 && confirmed.length === 0 && (
          <div className="text-center py-5 text-muted" style={{ fontSize: 14 }}>
            No bookings to review.
          </div>
        )}

        {queue.length > 0 && (
          <>
            <div style={{ padding: '10px 16px 4px', fontSize: 11, fontWeight: 700, color: '#7a8567', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Approval Queue ({queue.length})
            </div>
            {queue.map(b => <AdminBookingCard key={b.id} booking={b} />)}
          </>
        )}

        {confirmed.length > 0 && (
          <>
            <div style={{ padding: '10px 16px 4px', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Confirmed Upcoming ({confirmed.length})
            </div>
            {confirmed.map(b => <AdminBookingCard key={b.id} booking={b} />)}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
