import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Spinner, Alert, Badge, OverlayTrigger, Tooltip, Form } from 'react-bootstrap';
import { FiChevronLeft, FiChevronRight, FiCalendar, FiUser, FiUsers, FiEye, FiEyeOff, FiRefreshCw, FiPlus } from 'react-icons/fi';
import { useQuery, useQueryClient } from 'react-query';
import { fetchCalendarBookings, fetchBoardrooms, Booking, Boardroom } from '../../lib/boardroomApi';
import BookingCalendarModal from './BookingCalendarModal';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Business hours to display: 07:00–20:00 SAST in 30-min increments */
const SLOT_START_MIN = 7 * 60;
const SLOT_END_MIN   = 20 * 60;
const SLOTS = Array.from(
  { length: (SLOT_END_MIN - SLOT_START_MIN) / 30 },
  (_, i) => {
    const total = SLOT_START_MIN + i * 30;
    return { h: Math.floor(total / 60), m: total % 60 };
  }
);

/** Total bookable 30-min slots per room per day (08:00–16:30 = 18 slots) */
const BOOKABLE_SLOTS_PER_DAY = 18;

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

/** Format YYYY-MM-DD to short "Wed 15" */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Navigate a SAST date string by N days */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** Get Monday of the week containing iso */
function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = date.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

/** Build an array of 7 date strings starting from monday */
function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Today in SAST (Africa/Johannesburg = UTC+2) */
function todaySAST(): string {
  const now = new Date();
  const sast = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return sast.toISOString().slice(0, 10);
}

/** Current SAST time as minutes-since-midnight */
function nowSASTMinutes(): number {
  const sast = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return sast.getUTCHours() * 60 + sast.getUTCMinutes();
}

/** Extract the SAST "HH:MM" key from a UTC ISO slot_start */
function slotKeySAST(isoUtc: string): string {
  const d = new Date(isoUtc);
  const sast = new Date(d.getTime() + 2 * 60 * 60 * 1000);
  return `${String(sast.getUTCHours()).padStart(2, '0')}:${String(sast.getUTCMinutes()).padStart(2, '0')}`;
}

/** Initials from a name */
function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

/** Percent of day booked for a room (0–100) */
function utilPct(roomId: string, bookings: Booking[]): number {
  const count = bookings.filter(b => b.boardroom_id === roomId).length;
  return Math.round((count / BOOKABLE_SLOTS_PER_DAY) * 100);
}

// ── Component ─────────────────────────────────────────────────────────────────

type ViewMode = 'day' | 'week';

export default function AllBookingsCalendar() {
  const [date,          setDate]          = useState<string>(todaySAST());
  const [viewMode,      setViewMode]      = useState<ViewMode>('day');
  const [hideEmpty,     setHideEmpty]     = useState<boolean>(false);
  const [nowMinutes,    setNowMinutes]    = useState<number>(nowSASTMinutes());
  const [bookTarget,    setBookTarget]    = useState<{ room: Boardroom; date: string; slotKey: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // Tick the "now" line every minute
  useEffect(() => {
    const id = setInterval(() => setNowMinutes(nowSASTMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Fetch all boardrooms
  const { data: roomsData } = useQuery(
    'boardrooms-all',
    () => fetchBoardrooms({ active: true }),
    { staleTime: 120_000 }
  );
  const rooms = useMemo(() => roomsData?.data ?? [], [roomsData]);

  // ── Day view data ───────────────────────────────────────────────────────────
  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<Booking[]>(
    ['calendar-bookings', date],
    () => fetchCalendarBookings(date),
    { staleTime: 60_000, refetchInterval: 60_000 }  // auto-refresh every 60 s
  );

  // ── Week view data ──────────────────────────────────────────────────────────
  const monday    = useMemo(() => weekStart(date), [date]);
  const weekDays  = useMemo(() => weekDates(monday), [monday]);

  const weekQueries = weekDays.map(d =>
    useQuery<Booking[]>(
      ['calendar-bookings', d],
      () => fetchCalendarBookings(d),
      { staleTime: 60_000, refetchInterval: 60_000, enabled: viewMode === 'week' }
    )
  );
  const weekBookings: Record<string, Booking[]> = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    weekDays.forEach((d, i) => { map[d] = weekQueries[i].data ?? []; });
    return map;
  }, [weekDays, ...weekQueries.map(q => q.data)]);

  // ── Grid lookup for day view ────────────────────────────────────────────────
  const grid = useMemo(() => {
    const map: Record<string, Record<string, Booking>> = {};
    for (const b of bookings) {
      if (!map[b.boardroom_id]) map[b.boardroom_id] = {};
      map[b.boardroom_id][slotKeySAST(b.slot_start)] = b;
    }
    return map;
  }, [bookings]);

  const totalBookings = bookings.length;
  const isToday       = date === todaySAST();

  // Auto-scroll to current time on today's day view
  useEffect(() => {
    if (!isToday || viewMode !== 'day' || !gridRef.current) return;
    const pxPerMin = 52 / 30; // each 30-min slot is 52px tall
    const offset   = (nowMinutes - SLOT_START_MIN) * pxPerMin - 80;
    gridRef.current.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  }, [isToday, viewMode, date]);

  // Visible slots (hide empty ones when toggle is on, day view only)
  const visibleSlots = useMemo(() => {
    if (!hideEmpty || viewMode === 'week') return SLOTS;
    return SLOTS.filter(({ h, m }) => {
      const key = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      return rooms.some(r => grid[r.id]?.[key]);
    });
  }, [hideEmpty, viewMode, rooms, grid]);

  // "Now" line position (px from top of grid, relative to SLOT_START_MIN)
  const nowLineTop = useMemo(() => {
    const pxPerMin = 52 / 30;
    return (nowMinutes - SLOT_START_MIN) * pxPerMin;
  }, [nowMinutes]);

  const handleDateInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) setDate(e.target.value);
  }, []);

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">

        {/* Left: date label + jump-to-date */}
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <FiCalendar style={{ color: '#7a8567', fontSize: 18, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 15, color: '#333' }}>
            {viewMode === 'week'
              ? `Week of ${formatShortDate(monday)} – ${formatShortDate(addDays(monday, 6))}`
              : formatDateLabel(date)}
          </span>
          {isToday && viewMode === 'day' && (
            <Badge style={{ background: '#7a8567', fontSize: 10 }}>Today</Badge>
          )}
          {totalBookings > 0 && viewMode === 'day' && (
            <Badge bg="secondary" style={{ fontSize: 10 }}>
              {totalBookings} booking{totalBookings !== 1 ? 's' : ''}
            </Badge>
          )}
          {isFetching && <Spinner animation="border" size="sm" style={{ color: '#7a8567', width: 14, height: 14 }} />}

          {/* Jump-to-date */}
          <Form.Control
            type="date"
            size="sm"
            value={date}
            onChange={handleDateInput}
            style={{ width: 140, fontSize: 12, padding: '3px 8px', borderRadius: 8 }}
          />
        </div>

        {/* Right: controls */}
        <div className="d-flex align-items-center gap-2 flex-wrap">

          {/* Hide empty toggle (day view only) */}
          {viewMode === 'day' && (
            <button
              onClick={() => setHideEmpty(h => !h)}
              title={hideEmpty ? 'Show all slots' : 'Hide empty slots'}
              style={{
                ...navBtnStyle,
                background: hideEmpty ? '#f0f4ea' : 'white',
                borderColor: hideEmpty ? '#7a8567' : '#ddd',
                color: hideEmpty ? '#5a6e45' : '#666',
                fontSize: 12,
                gap: 5,
              }}
            >
              {hideEmpty ? <FiEye size={13} /> : <FiEyeOff size={13} />}
              {hideEmpty ? 'All slots' : 'Hide empty'}
            </button>
          )}

          {/* Manual refresh */}
          <button
            onClick={() => refetch()}
            title="Refresh"
            style={navBtnStyle}
          >
            <FiRefreshCw size={13} />
          </button>

          {/* Day / Week toggle */}
          <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            {(['day', 'week'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  padding: '5px 12px',
                  fontSize: 12,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === v ? '#7a8567' : 'white',
                  color:      viewMode === v ? 'white'   : '#555',
                  fontWeight: viewMode === v ? 700       : 400,
                  transition: 'all 0.12s',
                }}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Prev / Today / Next */}
          <div className="d-flex align-items-center gap-1">
            <button
              onClick={() => setDate(d => addDays(d, viewMode === 'week' ? -7 : -1))}
              style={navBtnStyle} title="Previous"
            >
              <FiChevronLeft />
            </button>
            <button
              onClick={() => setDate(todaySAST())}
              disabled={isToday}
              style={{ ...navBtnStyle, fontSize: 12, padding: '5px 12px', opacity: isToday && viewMode === 'day' ? 0.4 : 1 }}
            >
              Today
            </button>
            <button
              onClick={() => setDate(d => addDays(d, viewMode === 'week' ? 7 : 1))}
              style={navBtnStyle} title="Next"
            >
              <FiChevronRight />
            </button>
          </div>
        </div>
      </div>

      {/* ── Loading / error states ── */}
      {isLoading && (
        <div className="text-center py-5">
          <Spinner animation="border" style={{ color: '#7a8567' }} />
          <p className="mt-2 text-muted" style={{ fontSize: 14 }}>Loading bookings…</p>
        </div>
      )}
      {isError && (
        <Alert variant="warning">
          Could not load bookings.{' '}
          <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => refetch()}>
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

      {/* ══════════════════════════════════════════════════════════════════════
          DAY VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {!isLoading && !isError && rooms.length > 0 && viewMode === 'day' && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: Math.max(560, 100 + rooms.length * 160) }}>

            {/* Room header row */}
            <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${rooms.length}, 1fr)`, gap: 1 }}>
              <div style={cornerStyle} />
              {rooms.map((room, i) => {
                const pct   = utilPct(room.id, bookings);
                const color = ROOM_COLORS[i % ROOM_COLORS.length];
                return (
                  <div key={room.id} style={{ ...roomHeaderStyle, borderTop: `3px solid ${color}` }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#333', lineHeight: 1.2 }}>
                      {room.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                      <FiUsers style={{ marginRight: 3 }} />{room.capacity}
                    </div>
                    {/* Utilisation bar */}
                    <div style={{ marginTop: 6, height: 4, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{pct}% booked</div>
                  </div>
                );
              })}
            </div>

            {/* Grid with "now" line */}
            <div style={{ position: 'relative' }} ref={gridRef}>
              {/* "Now" indicator */}
              {isToday && nowMinutes >= SLOT_START_MIN && nowMinutes <= SLOT_END_MIN && (
                <div
                  style={{
                    position: 'absolute',
                    top: nowLineTop,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: '#e05252',
                    zIndex: 10,
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{
                    position: 'absolute', left: 0, top: -5,
                    width: 10, height: 10, borderRadius: '50%', background: '#e05252',
                  }} />
                </div>
              )}

              {/* Slot rows */}
              {visibleSlots.map(({ h, m }) => {
                const key    = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const endMin = h * 60 + m + 30;
                const endKey = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
                const hasAny = rooms.some(r => grid[r.id]?.[key]);
                const isCurrentSlot = isToday && nowMinutes >= h * 60 + m && nowMinutes < endMin;

                return (
                  <div
                    key={key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `80px repeat(${rooms.length}, 1fr)`,
                      gap: 1,
                      background: isCurrentSlot ? '#fffbe6' : hasAny ? '#f7f9f4' : 'transparent',
                    }}
                  >
                    <div style={{ ...hourLabelStyle, color: isCurrentSlot ? '#c89c00' : '#999', fontWeight: isCurrentSlot ? 700 : 600 }}>
                      {key}
                    </div>
                    {rooms.map((room, i) => {
                      const booking = grid[room.id]?.[key];
                      const color   = ROOM_COLORS[i % ROOM_COLORS.length];
                      if (!booking) return (
                        <div
                          key={room.id}
                          title={`Book ${room.name} at ${key}`}
                          onClick={() => setBookTarget({ room, date, slotKey: key })}
                          style={{
                            ...emptyCellStyle,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          className="empty-book-cell"
                        >
                          <FiPlus size={13} style={{ color: '#ccc', opacity: 0, transition: 'opacity 0.15s' }} className="empty-book-icon" />
                        </div>
                      );

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
                                <div>{key} – {endKey} SAST</div>
                                <div style={{ marginTop: 4 }}><FiUser style={{ marginRight: 4 }} />{name}</div>
                                {email && <div style={{ color: '#ccc', fontSize: 11 }}>{email}</div>}
                                {booking.notes && <div style={{ marginTop: 4, fontStyle: 'italic', color: '#ddd' }}>"{booking.notes}"</div>}
                              </div>
                            </Tooltip>
                          }
                        >
                          <div style={{ ...bookedCellStyle, background: color + '22', borderLeft: `3px solid ${color}` }}>
                            <div style={avatarStyle(color)}>{initials(name)}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {name.split(' ')[0]}
                              </div>
                              <div style={{ fontSize: 10, color: '#666' }}>{key}–{endKey}</div>
                            </div>
                          </div>
                        </OverlayTrigger>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {totalBookings === 0 && (
              <div className="text-center py-4 mt-2" style={{ color: '#aaa', fontSize: 14, border: '1px dashed #ddd', borderRadius: 8 }}>
                No confirmed bookings on {formatDateLabel(date)}.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          WEEK VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {!isLoading && !isError && rooms.length > 0 && viewMode === 'week' && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 600 }}>

            {/* Day header row */}
            <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(7, 1fr)`, gap: 1, marginBottom: 2 }}>
              <div style={cornerStyle} />
              {weekDays.map(d => {
                const isT  = d === todaySAST();
                const dow  = new Date(d + 'T12:00:00Z').getUTCDay();
                const isWE = dow === 0 || dow === 6;
                const dayBookings = weekBookings[d] ?? [];
                return (
                  <div
                    key={d}
                    onClick={() => { setDate(d); setViewMode('day'); }}
                    style={{
                      ...roomHeaderStyle,
                      borderTop: `3px solid ${isT ? '#e05252' : isWE ? '#ccc' : '#7a8567'}`,
                      cursor: 'pointer',
                      opacity: isWE ? 0.5 : 1,
                      background: isT ? '#fffbe6' : 'white',
                    }}
                    title="View day"
                  >
                    <div style={{ fontWeight: isT ? 700 : 600, fontSize: 12, color: isT ? '#c89c00' : '#333' }}>
                      {formatShortDate(d)}
                    </div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                      {dayBookings.length > 0
                        ? `${dayBookings.length} booking${dayBookings.length !== 1 ? 's' : ''}`
                        : isWE ? 'Weekend' : 'Free'}
                    </div>
                    {/* Booking density dots */}
                    <div style={{ display: 'flex', gap: 2, marginTop: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {rooms.map((room, ri) => {
                        const has = (weekBookings[d] ?? []).some(b => b.boardroom_id === room.id);
                        return (
                          <div
                            key={room.id}
                            style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: has ? ROOM_COLORS[ri % ROOM_COLORS.length] : '#eee',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Slot rows for week view */}
            {SLOTS.map(({ h, m }) => {
              const key    = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
              const endMin = h * 60 + m + 30;
              const endKey = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
              const hasAny = weekDays.some(d => (weekBookings[d] ?? []).length > 0 &&
                (weekBookings[d] ?? []).some(b => slotKeySAST(b.slot_start) === key));

              // Skip fully empty slots
              if (!hasAny) return (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: `80px repeat(7, 1fr)`, gap: 1 }}>
                  <div style={{ ...hourLabelStyle, minHeight: 28 }}>{key}</div>
                  {weekDays.map(d => <div key={d} style={{ ...emptyCellStyle, minHeight: 28 }} />)}
                </div>
              );

              return (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: `80px repeat(7, 1fr)`, gap: 1 }}>
                  <div style={hourLabelStyle}>{key}</div>
                  {weekDays.map(d => {
                    const dow  = new Date(d + 'T12:00:00Z').getUTCDay();
                    const isWE = dow === 0 || dow === 6;
                    if (isWE) return <div key={d} style={{ ...emptyCellStyle, background: '#fafafa' }} />;

                    const dayBook = (weekBookings[d] ?? []).filter(b => slotKeySAST(b.slot_start) === key);
                    if (dayBook.length === 0) return (
                      <div
                        key={d}
                        title={`View ${formatShortDate(d)} – ${key}`}
                        onClick={() => { setDate(d); setViewMode('day'); }}
                        style={{ ...emptyCellStyle, cursor: 'pointer' }}
                        className="empty-book-cell"
                      />
                    );

                    const isT = d === todaySAST();
                    return (
                      <OverlayTrigger
                        key={d}
                        placement="top"
                        overlay={
                          <Tooltip id={`week-${d}-${key}`}>
                            <div style={{ textAlign: 'left', fontSize: 12 }}>
                              <div style={{ fontWeight: 600 }}>{formatShortDate(d)}, {key}–{endKey}</div>
                              {dayBook.map(b => {
                                const ri   = rooms.findIndex(r => r.id === b.boardroom_id);
                                const person = (b as any).profiles;
                                return (
                                  <div key={b.id} style={{ marginTop: 4 }}>
                                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ROOM_COLORS[ri % ROOM_COLORS.length], marginRight: 5 }} />
                                    {rooms[ri]?.name}: {person?.full_name ?? person?.email ?? 'Unknown'}
                                  </div>
                                );
                              })}
                            </div>
                          </Tooltip>
                        }
                      >
                        <div
                          onClick={() => { setDate(d); setViewMode('day'); }}
                          style={{
                            ...emptyCellStyle,
                            background: isT ? '#fffbe6' : '#f7f9f4',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            padding: '4px 6px',
                          }}
                        >
                          {dayBook.map(b => {
                            const ri = rooms.findIndex(r => r.id === b.boardroom_id);
                            const person = (b as any).profiles;
                            return (
                              <div key={b.id} style={avatarStyle(ROOM_COLORS[ri % ROOM_COLORS.length])}>
                                {initials((person as any)?.full_name ?? (person as any)?.email)}
                              </div>
                            );
                          })}
                        </div>
                      </OverlayTrigger>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Booking modal (pre-navigated to the clicked date + slot) ── */}
      {bookTarget && (
        <BookingCalendarModal
          show={!!bookTarget}
          boardroom={bookTarget.room}
          initialDate={bookTarget.date}
          initialSASTKey={bookTarget.slotKey}
          onHide={() => setBookTarget(null)}
          onSuccess={() => {
            qc.invalidateQueries(['calendar-bookings', bookTarget.date]);
            setBookTarget(null);
          }}
        />
      )}

      {/* Hover-reveal "+" icon on empty cells */}
      <style>{`
        .empty-book-cell:hover { background: #f0f4ea !important; }
        .empty-book-cell:hover .empty-book-icon { opacity: 1 !important; color: #7a8567 !important; }
      `}</style>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function avatarStyle(color: string): React.CSSProperties {
  return {
    width: 22, height: 22, borderRadius: '50%',
    background: color, color: 'white',
    fontSize: 9, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  };
}

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
