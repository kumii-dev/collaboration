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
  slot_start:  string; // ISO UTC
  label:       string; // e.g. "09:00 – 10:00"
  available:   boolean;
  is_mine:     boolean;
  held_status: 'awaiting_approval' | 'confirmed' | null;
}

export type BookingStatus =
  | 'pending'           // user requested slot — no payment yet, slot NOT held
  | 'awaiting_approval' // payment proof submitted — slot IS held, admin must approve
  | 'confirmed'         // admin approved
  | 'rejected'          // admin rejected (see rejection_reason)
  | 'cancelled';        // cancelled by user or admin

export interface Booking {
  id:                    string;
  boardroom_id:          string;
  user_id:               string;
  slot_start:            string;
  slot_end:              string;
  status:                BookingStatus;
  notes:                 string | null;
  created_at:            string;
  // payment / approval fields
  payment_proof_url:     string | null;
  payment_reference:     string | null;
  payment_submitted_at:  string | null;
  approved_by:           string | null;
  approved_at:           string | null;
  rejection_reason:      string | null;
  boardrooms?:  Pick<Boardroom, 'id' | 'name' | 'image_url' | 'capacity'>;
  profiles?: {
    id:         string;
    full_name:  string | null;
    email:      string;
    avatar_url: string | null;
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

export interface SubmitPaymentPayload {
  payment_proof_url?: string;
  payment_reference?: string;
}

export interface ApproveBookingPayload {
  approve:           boolean;
  rejection_reason?: string;
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

/** Fetch all confirmed bookings for a given SAST date (YYYY-MM-DD) — staff/admin only. */
export async function fetchCalendarBookings(date: string): Promise<Booking[]> {
  const res = await api.get('/boardrooms/bookings/calendar', { params: { date } });
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

export async function submitPayment(id: string, payload: SubmitPaymentPayload): Promise<Booking> {
  const res = await api.patch(`/boardrooms/bookings/${id}/submit-payment`, payload);
  return res.data.data;
}

export async function approveBooking(id: string, payload: ApproveBookingPayload): Promise<Booking> {
  const res = await api.patch(`/boardrooms/bookings/${id}/approve`, payload);
  return res.data.data;
}

export async function rescheduleBooking(id: string, slot_start: string): Promise<Booking> {
  const res = await api.patch(`/boardrooms/bookings/${id}/reschedule`, { slot_start });
  return res.data.data;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Format a UTC ISO slot_start into a human-readable SAST time. */
export function formatSlotSAST(isoUtc: string): string {
  const d      = new Date(isoUtc);
  const sast   = new Date(d.getTime() + 2 * 60 * 60 * 1000);
  const h      = sast.getUTCHours();
  const m      = sast.getUTCMinutes();
  const endMin = h * 60 + m + 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} – ${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')} SAST`;
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
