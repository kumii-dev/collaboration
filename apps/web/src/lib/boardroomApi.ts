import api from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Boardroom {
  id:          string;
  name:        string;
  description: string | null;
  capacity:    number;
  amenities:   string[];
  image_url:   string | null;
  is_active:   boolean;
  created_by:  string;
  created_at:  string;
  updated_at:  string;
}

export interface BookingSlot {
  slot_start: string; // ISO UTC
  label:      string; // e.g. "09:00 – 10:00"
  available:  boolean;
  is_mine:    boolean;
}

export interface Booking {
  id:           string;
  boardroom_id: string;
  user_id:      string;
  slot_start:   string;
  slot_end:     string;
  status:       'confirmed' | 'cancelled';
  notes:        string | null;
  created_at:   string;
  boardrooms?:  Pick<Boardroom, 'id' | 'name' | 'image_url' | 'capacity'>;
  profiles?: {
    id:          string;
    full_name:   string | null;
    email:       string;
    avatar_url:  string | null;
  };
}

export interface CreateBoardroomPayload {
  name:        string;
  description?: string;
  capacity?:   number;
  amenities?:  string[];
  image_url?:  string;
}

export interface UpdateBoardroomPayload extends Partial<CreateBoardroomPayload> {
  is_active?: boolean;
}

export interface CreateBookingPayload {
  boardroom_id: string;
  slot_start:   string;
  notes?:       string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchBoardrooms(params?: { active?: boolean; limit?: number; offset?: number }): Promise<{ data: Boardroom[]; total: number }> {
  // Strip undefined values so axios doesn't serialize them as the string "undefined"
  const cleanParams: Record<string, string | number> = {};
  if (params?.limit  !== undefined) cleanParams.limit  = params.limit;
  if (params?.offset !== undefined) cleanParams.offset = params.offset;
  if (params?.active !== undefined) cleanParams.active = String(params.active);
  const res = await api.get('/boardrooms', { params: Object.keys(cleanParams).length ? cleanParams : undefined });
  return res.data;
}

export async function fetchBoardroom(id: string): Promise<Boardroom> {
  const res = await api.get(`/boardrooms/${id}`);
  return res.data.data;
}

export async function fetchAvailability(boardroom_id: string, date: string): Promise<BookingSlot[]> {
  const res = await api.get('/boardrooms/availability', { params: { boardroom_id, date } });
  return res.data.data;
}

export async function fetchMyBookings(): Promise<Booking[]> {
  const res = await api.get('/boardrooms/bookings/mine');
  return res.data.data;
}

export async function fetchAllBookings(): Promise<Booking[]> {
  const res = await api.get('/boardrooms/bookings/all');
  return res.data.data;
}

export async function createBoardroom(payload: CreateBoardroomPayload): Promise<Boardroom> {
  const res = await api.post('/boardrooms', payload);
  return res.data.data;
}

export async function updateBoardroom(id: string, payload: UpdateBoardroomPayload): Promise<Boardroom> {
  const res = await api.patch(`/boardrooms/${id}`, payload);
  return res.data.data;
}

export async function deleteBoardroom(id: string): Promise<void> {
  await api.delete(`/boardrooms/${id}`);
}

export async function createBooking(payload: CreateBookingPayload): Promise<Booking> {
  const res = await api.post('/boardrooms/bookings', payload);
  return res.data.data;
}

export async function cancelBooking(id: string): Promise<Booking> {
  const res = await api.patch(`/boardrooms/bookings/${id}/cancel`);
  return res.data.data;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Format a UTC ISO slot_start into a human-readable SAST time. */
export function formatSlotSAST(isoUtc: string): string {
  const d     = new Date(isoUtc);
  const sast  = new Date(d.getTime() + 2 * 60 * 60 * 1000);
  const h     = sast.getUTCHours();
  return `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00 SAST`;
}

/** Format a UTC ISO date into a SAST date string, e.g. "Mon 10 Jun 2024". */
export function formatDateSAST(isoUtc: string): string {
  const d = new Date(isoUtc);
  return d.toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Africa/Johannesburg',
  });
}

/** Get an array of bookable weekday dates (Mon–Fri) from today up to 31 days ahead (SAST). */
export function getBookableDates(): { iso: string; label: string }[] {
  const today = new Date();
  const dates: { iso: string; label: string }[] = [];

  for (let i = 0; i < 31 && dates.length < 31; i++) {
    const d    = new Date(today);
    d.setDate(today.getDate() + i);
    const dow  = d.toLocaleDateString('en-ZA', { weekday: 'short', timeZone: 'Africa/Johannesburg' });
    if (dow === 'Sat' || dow === 'Sun') continue;
    const iso  = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' }); // YYYY-MM-DD
    const label = d.toLocaleDateString('en-ZA', {
      weekday: 'short', day: 'numeric', month: 'short',
      timeZone: 'Africa/Johannesburg',
    });
    dates.push({ iso, label });
  }
  return dates;
}
