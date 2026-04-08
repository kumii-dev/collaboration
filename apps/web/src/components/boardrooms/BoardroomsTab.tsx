import { useState } from 'react';
import { Row, Col, Spinner, Alert, Button } from 'react-bootstrap';
import { FiPlus } from 'react-icons/fi';
import { useQuery } from 'react-query';
import { fetchBoardrooms } from '../../lib/boardroomApi';
import BoardroomCard from './BoardroomCard';
import MyBookingsPanel from './MyBookingsPanel';
import CreateBoardroomModal from './CreateBoardroomModal';

interface Props {
  isAdmin: boolean;
}

const BTN_STYLE = { background: '#7a8567', borderColor: '#7a8567', color: 'white' };

export default function BoardroomsTab({ isAdmin }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [subNav,     setSubNav]     = useState<'rooms' | 'my-bookings'>('rooms');

  const { data, isLoading, isError } = useQuery(
    'boardrooms',
    () => fetchBoardrooms({ active: isAdmin ? undefined : true }),
    { staleTime: 60_000 }
  );

  const boardrooms = data?.data ?? [];

  return (
    <div>
      {/* ── Sub-navigation ── */}
      <div
        className="d-flex gap-1 mb-4"
        style={{
          background: 'white',
          border: '1px solid #E5E5E3',
          borderRadius: '12px',
          padding: '6px',
          width: 'fit-content',
        }}
      >
        {([
          { key: 'rooms',       label: 'Available Rooms' },
          { key: 'my-bookings', label: 'My Bookings'     },
        ] as const).map(({ key, label }) => (
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
            }}
          >
            {label}
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
    </div>
  );
}
