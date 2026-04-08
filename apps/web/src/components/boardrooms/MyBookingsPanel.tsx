import { useState } from 'react';
import { Card, Button, Spinner, Alert } from 'react-bootstrap';
import { FiCalendar, FiClock, FiX } from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { fetchMyBookings, fetchAllBookings, cancelBooking, formatSlotSAST, formatDateSAST, Booking } from '../../lib/boardroomApi';

interface Props {
  isAdmin: boolean;
}

const BTN_CANCEL_STYLE = { fontSize: 12, padding: '3px 10px' };

function BookingRow({ booking, isAdmin, onCancel }: { booking: Booking; isAdmin: boolean; onCancel: () => void }) {
  const room      = (booking as any).boardrooms ?? {};
  const profile   = (booking as any).profiles   ?? {};
  const dateLabel = formatDateSAST(booking.slot_start);
  const timeLabel = formatSlotSAST(booking.slot_start);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #f0f4ea',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: '#3a3a3a', marginBottom: 2 }}>
          {room.name ?? 'Boardroom'}
        </div>
        <div style={{ fontSize: 13, color: '#666', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span><FiCalendar size={12} className="me-1" />{dateLabel}</span>
          <span><FiClock    size={12} className="me-1" />{timeLabel}</span>
        </div>
        {isAdmin && profile.full_name && (
          <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
            {profile.full_name} · {profile.email}
          </div>
        )}
        {booking.notes && (
          <div style={{ fontSize: 12, color: '#999', marginTop: 2, fontStyle: 'italic' }}>
            "{booking.notes}"
          </div>
        )}
      </div>
      <Button
        size="sm"
        variant="outline-danger"
        style={BTN_CANCEL_STYLE}
        onClick={onCancel}
      >
        <FiX size={12} className="me-1" />Cancel
      </Button>
    </div>
  );
}

export default function MyBookingsPanel({ isAdmin }: Props) {
  const qc = useQueryClient();
  const [view, setView] = useState<'mine' | 'all'>('mine');

  const myQuery  = useQuery('my-bookings',  fetchMyBookings,  { staleTime: 30_000 });
  const allQuery = useQuery('all-bookings', fetchAllBookings, { staleTime: 30_000, enabled: isAdmin });

  const active = view === 'all' && isAdmin ? allQuery : myQuery;

  const cancelMutation = useMutation(
    (id: string) => cancelBooking(id),
    {
      onSuccess: () => {
        qc.invalidateQueries('my-bookings');
        qc.invalidateQueries('all-bookings');
        qc.invalidateQueries('boardroom-availability');
      },
    }
  );

  const bookings: Booking[] = (active.data as Booking[] | undefined) ?? [];

  return (
    <Card style={{ borderRadius: 14, border: '1px solid #E5E5E3' }}>
      <Card.Header
        style={{
          background: 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)',
          borderRadius: '14px 14px 0 0',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 700, color: 'white', fontSize: 15 }}>My Bookings</span>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setView('mine')}
              style={{
                padding: '3px 10px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                cursor: 'pointer',
                background: view === 'mine' ? 'white' : 'rgba(255,255,255,0.25)',
                color:      view === 'mine' ? '#7a8567' : 'white',
                fontWeight: view === 'mine' ? 600 : 400,
              }}
            >
              Mine
            </button>
            <button
              onClick={() => setView('all')}
              style={{
                padding: '3px 10px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                cursor: 'pointer',
                background: view === 'all' ? 'white' : 'rgba(255,255,255,0.25)',
                color:      view === 'all' ? '#7a8567' : 'white',
                fontWeight: view === 'all' ? 600 : 400,
              }}
            >
              All
            </button>
          </div>
        )}
      </Card.Header>

      <Card.Body style={{ padding: 0 }}>
        {active.isLoading && (
          <div className="text-center py-4">
            <Spinner animation="border" style={{ color: '#7a8567' }} />
          </div>
        )}

        {active.isError && (
          <Alert variant="danger" className="m-3">
            Failed to load bookings.
          </Alert>
        )}

        {cancelMutation.isError && (
          <Alert variant="danger" className="m-3">
            {(cancelMutation.error as any)?.response?.data?.error ?? 'Cancel failed'}
          </Alert>
        )}

        {!active.isLoading && bookings.length === 0 && (
          <div className="text-center py-5 text-muted" style={{ fontSize: 14 }}>
            No upcoming bookings.
          </div>
        )}

        {bookings.map(b => (
          <BookingRow
            key={b.id}
            booking={b}
            isAdmin={isAdmin}
            onCancel={() => cancelMutation.mutate(b.id)}
          />
        ))}
      </Card.Body>
    </Card>
  );
}
