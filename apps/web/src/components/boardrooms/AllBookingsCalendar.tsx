import { useState, useMemo } from 'react';
import { Spinner, Alert, Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { FiChevronLeft, FiChevronRight, FiCalendar, FiUser, FiUsers } from 'react-icons/fi';
import { useQuery } from 'react-query';
import { fetchCalendarBookings, fetchBoardrooms, Booking } from '../../lib/boardroomApi';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Business hours to display: 07:00–20:00 SAST */
const HOUR_START = 7;
const HOUR_END   = 20;
const HOURS      = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

const ROOM_COLORS = [
  '#7a8567', '#5a7d4e', '#8b6f47', '#4a7c8e', '#7b5ea7',
  '#b85c38', '#3d7a6a', '#7a6545', '#4e6e8e', '#6e4e7a',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a SAST YYYY-MM-DD to a display label e.g. "Wed 15 Apr 2026" */
function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Navigate a SAST date string by N days */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** Today in SAST (Africa/Johannesburg = UTC+2) */
function todaySAST(): string {
  const now = new Date();
  const sast = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return sast.toISOString().slice(0, 10);
}

/** Extract the SAST hour (0-23) from a UTC ISO slot_start */
function slotHourSAST(isoUtc: string): number {
  const d = new Date(isoUtc);
  const sast = new Date(d.getTime() + 2 * 60 * 60 * 1000);
  return sast.getUTCHours();
}

/** Initials from a name */
function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AllBookingsCalendar() {
  const [date, setDate] = useState<string>(todaySAST());

  // Fetch all boardrooms (to get stable column order + names)
  const { data: roomsData } = useQuery(
    'boardrooms-all',
    () => fetchBoardrooms({ active: true }),
    { staleTime: 120_000 }
  );
  const rooms = useMemo(() => roomsData?.data ?? [], [roomsData]);

  // Fetch confirmed bookings for selected date
  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Booking[]>(
    ['calendar-bookings', date],
    () => fetchCalendarBookings(date),
    { staleTime: 60_000 }
  );

  // Build lookup: roomId → hour → booking
  const grid = useMemo(() => {
    const map: Record<string, Record<number, Booking>> = {};
    for (const b of bookings) {
      if (!map[b.boardroom_id]) map[b.boardroom_id] = {};
      map[b.boardroom_id][slotHourSAST(b.slot_start)] = b;
    }
    return map;
  }, [bookings]);

  // Total booking count for header badge
  const totalBookings = bookings.length;

  // Whether a date is today in SAST
  const isToday = date === todaySAST();

  return (
    <div>
      {/* ── Date navigator ── */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <FiCalendar style={{ color: '#7a8567', fontSize: 18 }} />
          <span style={{ fontWeight: 600, fontSize: 16, color: '#333' }}>
            {formatDateLabel(date)}
          </span>
          {isToday && (
            <Badge style={{ background: '#7a8567', fontSize: 10 }}>Today</Badge>
          )}
          {totalBookings > 0 && (
            <Badge bg="secondary" style={{ fontSize: 10 }}>
              {totalBookings} booking{totalBookings !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <div className="d-flex align-items-center gap-1">
          <button
            onClick={() => setDate(d => addDays(d, -1))}
            style={navBtnStyle}
            title="Previous day"
          >
            <FiChevronLeft />
          </button>
          <button
            onClick={() => setDate(todaySAST())}
            disabled={isToday}
            style={{ ...navBtnStyle, fontSize: 12, padding: '5px 12px', opacity: isToday ? 0.4 : 1 }}
          >
            Today
          </button>
          <button
            onClick={() => setDate(d => addDays(d, 1))}
            style={navBtnStyle}
            title="Next day"
          >
            <FiChevronRight />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-5">
          <Spinner animation="border" style={{ color: '#7a8567' }} />
          <p className="mt-2 text-muted" style={{ fontSize: 14 }}>Loading bookings…</p>
        </div>
      )}

      {isError && (
        <Alert variant="warning">
          Could not load bookings for this date.{' '}
          <span
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => refetch()}
          >
            Retry
          </span>
        </Alert>
      )}

      {!isLoading && !isError && rooms.length === 0 && (
        <div className="text-center py-5" style={{ color: '#999' }}>
          <div style={{ fontSize: 36 }}>🏢</div>
          <p className="mt-2">No boardrooms found.</p>
        </div>
      )}

      {!isLoading && !isError && rooms.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: Math.max(560, 120 + rooms.length * 160) }}>

            {/* ── Room header row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${rooms.length}, 1fr)`, gap: 1 }}>
              {/* Empty corner */}
              <div style={cornerStyle} />
              {rooms.map((room, i) => (
                <div key={room.id} style={{ ...roomHeaderStyle, borderTop: `3px solid ${ROOM_COLORS[i % ROOM_COLORS.length]}` }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#333', lineHeight: 1.2 }}>
                    {room.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    <FiUsers style={{ marginRight: 3 }} />
                    {room.capacity}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Hour rows ── */}
            {HOURS.map(hour => {
              const hasAnyBooking = rooms.some(r => grid[r.id]?.[hour]);
              return (
                <div
                  key={hour}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `80px repeat(${rooms.length}, 1fr)`,
                    gap: 1,
                    background: hasAnyBooking ? '#f7f9f4' : 'transparent',
                  }}
                >
                  {/* Hour label */}
                  <div style={hourLabelStyle}>
                    {String(hour).padStart(2, '0')}:00
                  </div>

                  {/* Cells for each room */}
                  {rooms.map((room, i) => {
                    const booking = grid[room.id]?.[hour];
                    const color   = ROOM_COLORS[i % ROOM_COLORS.length];

                    if (!booking) {
                      return (
                        <div key={room.id} style={emptyCellStyle} />
                      );
                    }

                    const person = (booking as any).profiles;
                    const name   = person?.full_name ?? person?.email ?? 'Unknown';
                    const email  = person?.email ?? '';

                    return (
                      <OverlayTrigger
                        key={room.id}
                        placement="top"
                        overlay={
                          <Tooltip id={`tip-${booking.id}`}>
                            <div style={{ textAlign: 'left', fontSize: 12 }}>
                              <div style={{ fontWeight: 600 }}>{room.name}</div>
                              <div>{String(hour).padStart(2,'0')}:00 – {String(hour+1).padStart(2,'0')}:00 SAST</div>
                              <div style={{ marginTop: 4 }}>
                                <FiUser style={{ marginRight: 4 }} />
                                {name}
                              </div>
                              {email && <div style={{ color: '#ccc', fontSize: 11 }}>{email}</div>}
                              {booking.notes && (
                                <div style={{ marginTop: 4, fontStyle: 'italic', color: '#ddd' }}>
                                  "{booking.notes}"
                                </div>
                              )}
                            </div>
                          </Tooltip>
                        }
                      >
                        <div
                          style={{
                            ...bookedCellStyle,
                            background: color + '22',   // 13% opacity fill
                            borderLeft: `3px solid ${color}`,
                          }}
                        >
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: color,
                              color: 'white',
                              fontSize: 10,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {initials(name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {name.split(' ')[0]}
                            </div>
                            <div style={{ fontSize: 10, color: '#666' }}>
                              {String(hour).padStart(2,'0')}–{String(hour+1).padStart(2,'0')}
                            </div>
                          </div>
                        </div>
                      </OverlayTrigger>
                    );
                  })}
                </div>
              );
            })}

            {/* ── No bookings state ── */}
            {totalBookings === 0 && (
              <div
                className="text-center py-4 mt-2"
                style={{
                  color: '#aaa',
                  fontSize: 14,
                  border: '1px dashed #ddd',
                  borderRadius: 8,
                }}
              >
                No confirmed bookings on {formatDateLabel(date)}.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 8,
  border: '1px solid #ddd',
  background: 'white',
  cursor: 'pointer',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  color: '#444',
};

const cornerStyle: React.CSSProperties = {
  padding: '10px 8px',
};

const roomHeaderStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'white',
  borderBottom: '2px solid #eee',
  textAlign: 'center' as const,
};

const hourLabelStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 11,
  color: '#999',
  fontWeight: 600,
  textAlign: 'right' as const,
  borderRight: '1px solid #eee',
  borderBottom: '1px solid #f5f5f5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  minHeight: 52,
};

const emptyCellStyle: React.CSSProperties = {
  borderBottom: '1px solid #f0f0f0',
  borderRight: '1px solid #f5f5f5',
  minHeight: 52,
};

const bookedCellStyle: React.CSSProperties = {
  borderBottom: '1px solid #e8ede0',
  borderRight: '1px solid #f5f5f5',
  minHeight: 52,
  padding: '6px 8px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'default',
  borderRadius: 4,
};
