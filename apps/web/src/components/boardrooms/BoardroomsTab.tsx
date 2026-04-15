import { useState } from 'react';
import { Row, Col, Spinner, Alert, Button, Badge } from 'react-bootstrap';
import { FiPlus } from 'react-icons/fi';
import { useQuery } from 'react-query';
import { fetchBoardrooms, fetchAllBookings, Booking } from '../../lib/boardroomApi';
import BoardroomCard from './BoardroomCard';
import MyBookingsPanel from './MyBookingsPanel';
import AdminBookingsPanel from './AdminBookingsPanel';
import AllBookingsCalendar from './AllBookingsCalendar';
import CreateBoardroomModal from './CreateBoardroomModal';

const STAFF_DOMAINS = ['22onsloane.co', 'kumii.africa'];
function isStaffEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return STAFF_DOMAINS.includes(domain);
}

interface Props {
  isAdmin:   boolean;
  userEmail: string;
}

const BTN_STYLE = { background: '#7a8567', borderColor: '#7a8567', color: 'white' };

type SubNav = 'rooms' | 'my-bookings' | 'all-bookings' | 'approvals';

export default function BoardroomsTab({ isAdmin, userEmail }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [subNav,     setSubNav]     = useState<SubNav>('rooms');

  const isStaff = isAdmin || isStaffEmail(userEmail);

  const { data, isLoading, isError } = useQuery(
    'boardrooms',
    () => fetchBoardrooms({ active: isAdmin ? undefined : true }),
    { staleTime: 60_000 }
  );

  // Fetch all bookings for admins to compute badge count
  const { data: allBookings } = useQuery<Booking[]>(
    'all-bookings',
    fetchAllBookings,
    { staleTime: 30_000, enabled: isAdmin }
  );

  const boardrooms    = data?.data ?? [];
  const pendingCount  = isAdmin
    ? (allBookings ?? []).filter(b => b.status === 'awaiting_approval' || b.status === 'pending').length
    : 0;

  // Sub-nav items
  const navItems: { key: SubNav; label: string }[] = [
    { key: 'rooms',        label: 'Available Rooms' },
    { key: 'my-bookings',  label: 'My Bookings'     },
    ...(isStaff ? [{ key: 'all-bookings' as SubNav, label: 'All Bookings' }] : []),
    ...(isAdmin ? [{ key: 'approvals'   as SubNav, label: 'Approvals'    }] : []),
  ];

  return (
    <div>
      {/* ── Sub-navigation ── */}
      <div
        className="d-flex gap-1 mb-4 flex-wrap"
        style={{
          background: 'white',
          border: '1px solid #E5E5E3',
          borderRadius: '12px',
          padding: '6px',
          width: 'fit-content',
        }}
      >
        {navItems.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubNav(key)}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: subNav === key ? '600' : '400',
              background: subNav === key
                ? 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)'
                : 'transparent',
              color: subNav === key ? 'white' : '#666',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {label}
            {key === 'approvals' && pendingCount > 0 && (
              <Badge bg="danger" style={{ fontSize: 10, padding: '2px 6px' }}>
                {pendingCount}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* ── Available Rooms ── */}
      {subNav === 'rooms' && (
        <>
          {/* Admin toolbar — always visible when isAdmin, regardless of load state */}
          {isAdmin && (
            <div className="d-flex justify-content-end mb-3">
              <Button size="sm" style={BTN_STYLE} onClick={() => setShowCreate(true)}>
                <FiPlus className="me-1" />Add Boardroom
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-5">
              <Spinner animation="border" style={{ color: '#7a8567' }} />
              <p className="mt-2 text-muted">Loading boardrooms…</p>
            </div>
          )}

          {isError && (
            <Alert variant="warning" className="d-flex align-items-start gap-2">
              <div>
                <strong>Could not load boardrooms.</strong>
                {isAdmin && (
                  <div className="mt-1" style={{ fontSize: 13 }}>
                    If you just deployed this feature, make sure you have run the{' '}
                    <code>011_boardrooms.sql</code> migration in Supabase. Once the tables exist,
                    use the <strong>Add Boardroom</strong> button above to create your first room.
                  </div>
                )}
              </div>
            </Alert>
          )}

          {!isLoading && !isError && boardrooms.length === 0 && (
            <div
              className="text-center py-5"
              style={{ color: '#999', fontSize: 15 }}
            >
              <div style={{ fontSize: 36 }}>🏢</div>
              <p className="mt-2">
                {isAdmin
                  ? 'No boardrooms yet. Click "Add Boardroom" above to get started.'
                  : 'No boardrooms available right now.'}
              </p>
            </div>
          )}

          {!isLoading && !isError && boardrooms.length > 0 && (
            <Row className="g-4">
              {boardrooms.map(room => (
                <Col key={room.id} md={6} lg={4}>
                  <BoardroomCard boardroom={room} isAdmin={isAdmin} />
                </Col>
              ))}
            </Row>
          )}

          <CreateBoardroomModal
            show={showCreate && isAdmin}
            onHide={() => setShowCreate(false)}
          />
        </>
      )}

      {/* ── My Bookings ── */}
      {subNav === 'my-bookings' && (
        <MyBookingsPanel isAdmin={isAdmin} />
      )}

      {/* ── All Bookings calendar (staff + admin) ── */}
      {subNav === 'all-bookings' && isStaff && (
        <AllBookingsCalendar />
      )}

      {/* ── Approvals (admin only) ── */}
      {subNav === 'approvals' && isAdmin && (
        <AdminBookingsPanel />
      )}
    </div>
  );
}
