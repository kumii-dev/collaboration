import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, requireAdmin, requireModerator, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import logger from '../logger.js';

const router = Router();

// ── Schemas ───────────────────────────────────────────────────────────────────

const createBoardroomSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  capacity:    z.number().int().min(1).max(500).optional().default(10),
  amenities:   z.array(z.string().max(100)).max(20).optional().default([]),
  image_url:   z.string().url().optional().or(z.literal('')),
});

const updateBoardroomSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  capacity:    z.number().int().min(1).max(500).optional(),
  amenities:   z.array(z.string().max(100)).max(20).optional(),
  image_url:   z.string().url().optional().or(z.literal('')),
  is_active:   z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

const createBookingSchema = z.object({
  boardroom_id: z.string().uuid(),
  slot_start:   z.string().datetime({ offset: true }),
  notes:        z.string().max(500).optional(),
});

const availabilityQuerySchema = z.object({
  boardroom_id: z.string().uuid(),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

const idSchema   = z.object({ id: z.string().uuid() });
const listSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  active: z.enum(['true', 'false']).optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** SAST = UTC+2.  Valid slot hours: 08:00 – 16:00 SAST (last bookable slot starts at 16:00, ends 17:00).
 *  Valid days: Mon–Fri (DOW 1–5 in SAST). */
function validateSlotTime(slotStart: Date): { ok: boolean; reason?: string } {
  // Convert to SAST
  const sast = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000);
  const dow  = sast.getUTCDay(); // 0=Sun, 6=Sat
  const hour = sast.getUTCHours();
  const min  = sast.getUTCMinutes();
  const sec  = sast.getUTCSeconds();

  if (dow === 0 || dow === 6) return { ok: false, reason: 'Boardrooms are only available Mon–Fri' };
  if (hour < 8 || hour > 16)  return { ok: false, reason: 'Bookings are only available 08:00–17:00 SAST (last slot at 16:00)' };
  if (min !== 0 || sec !== 0) return { ok: false, reason: 'Slot must start on the hour (e.g. 09:00, 10:00)' };
  return { ok: true };
}

/** Returns all 9 slot times for a given SAST date (08:00–16:00, inclusive). */
function generateDaySlots(dateStr: string): Date[] {
  const slots: Date[] = [];
  for (let h = 8; h <= 16; h++) {
    // dateStr is YYYY-MM-DD; build as SAST then convert to UTC
    const iso  = `${dateStr}T${String(h).padStart(2, '0')}:00:00+02:00`;
    slots.push(new Date(iso));
  }
  return slots;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/boardrooms
 * List boardrooms (active by default). Admin can pass ?active=false to see inactive.
 */
router.get(
  '/',
  authenticate,
  validateQuery(listSchema),
  async (req: AuthRequest, res) => {
    try {
      const { limit, offset, active } = req.query as any;
      const isAdmin = req.user!.role === 'admin' || req.user!.role === 'moderator';

      let query = supabaseAdmin
        .from('boardrooms')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: true })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      // Non-admins only see active rooms; admins can filter by active param
      if (!isAdmin) {
        query = query.eq('is_active', true);
      } else if (active !== undefined) {
        query = query.eq('is_active', active === 'true');
      }

      const { data, error, count } = await query;
      if (error) throw error;
      res.json({ success: true, data: data ?? [], total: count ?? 0 });
    } catch (err: any) {
      logger.error('GET /boardrooms', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/boardrooms/availability?boardroom_id=<uuid>&date=<YYYY-MM-DD>
 * Returns slot availability for a specific room on a given date.
 */
router.get(
  '/availability',
  authenticate,
  validateQuery(availabilityQuerySchema),
  async (req: AuthRequest, res) => {
    try {
      const { boardroom_id, date } = req.query as { boardroom_id: string; date: string };

      const slots    = generateDaySlots(date);
      const slotUTCs = slots.map(s => s.toISOString());

      // Fetch confirmed bookings for those slots
      const { data: bookings, error } = await supabaseAdmin
        .from('boardroom_bookings')
        .select('slot_start, user_id')
        .eq('boardroom_id', boardroom_id)
        .eq('status', 'confirmed')
        .in('slot_start', slotUTCs);

      if (error) throw error;

      const bookedMap = new Map<string, string>(
        (bookings ?? []).map(b => [new Date(b.slot_start).toISOString(), b.user_id])
      );

      const result = slots.map(slot => {
        const iso      = slot.toISOString();
        const bookedBy = bookedMap.get(iso);
        const sast     = new Date(slot.getTime() + 2 * 60 * 60 * 1000);
        const label    = `${String(sast.getUTCHours()).padStart(2, '0')}:00 – ${String(sast.getUTCHours() + 1).padStart(2, '0')}:00`;
        return {
          slot_start: iso,
          label,
          available:   !bookedBy,
          is_mine:     bookedBy === req.user!.id,
        };
      });

      res.json({ success: true, data: result });
    } catch (err: any) {
      logger.error('GET /boardrooms/availability', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/boardrooms/bookings/mine
 * Returns the authenticated user's upcoming confirmed bookings.
 */
router.get('/bookings/mine', authenticate, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('boardroom_bookings')
      .select(`
        id, boardroom_id, slot_start, slot_end, status, notes, created_at,
        boardrooms ( id, name, image_url, capacity )
      `)
      .eq('user_id', req.user!.id)
      .eq('status', 'confirmed')
      .gte('slot_start', new Date().toISOString())
      .order('slot_start', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data: data ?? [] });
  } catch (err: any) {
    logger.error('GET /boardrooms/bookings/mine', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/boardrooms/bookings/all   (admin only)
 * Returns all upcoming confirmed bookings with user info.
 */
router.get(
  '/bookings/all',
  authenticate,
  requireModerator,
  async (req: AuthRequest, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('boardroom_bookings')
        .select(`
          id, boardroom_id, slot_start, slot_end, status, notes, created_at,
          boardrooms ( id, name, capacity ),
          profiles!boardroom_bookings_user_id_fkey ( id, full_name, email, avatar_url )
        `)
        .eq('status', 'confirmed')
        .gte('slot_start', new Date().toISOString())
        .order('slot_start', { ascending: true });

      if (error) throw error;
      res.json({ success: true, data: data ?? [] });
    } catch (err: any) {
      logger.error('GET /boardrooms/bookings/all', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/boardrooms/:id
 */
router.get(
  '/:id',
  authenticate,
  validateParams(idSchema),
  async (req: AuthRequest, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('boardrooms')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Boardroom not found' });
      res.json({ success: true, data });
    } catch (err: any) {
      logger.error('GET /boardrooms/:id', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * POST /api/boardrooms   (admin only)
 * Create a new boardroom.
 */
router.post(
  '/',
  authenticate,
  requireAdmin,
  validateBody(createBoardroomSchema),
  async (req: AuthRequest, res) => {
    try {
      const body = req.body as z.infer<typeof createBoardroomSchema>;
      const { data, error } = await supabaseAdmin
        .from('boardrooms')
        .insert({
          ...body,
          created_by: req.user!.id,
        })
        .select('*')
        .single();

      if (error) throw error;
      logger.info('Boardroom created', { id: data.id, adminId: req.user!.id });
      res.status(201).json({ success: true, data });
    } catch (err: any) {
      logger.error('POST /boardrooms', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * PATCH /api/boardrooms/:id   (admin only)
 * Update a boardroom (name, description, capacity, amenities, is_active, image_url).
 */
router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  validateParams(idSchema),
  validateBody(updateBoardroomSchema),
  async (req: AuthRequest, res) => {
    try {
      const body = req.body as z.infer<typeof updateBoardroomSchema>;
      const { data, error } = await supabaseAdmin
        .from('boardrooms')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select('*')
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Boardroom not found' });
      res.json({ success: true, data });
    } catch (err: any) {
      logger.error('PATCH /boardrooms/:id', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * DELETE /api/boardrooms/:id   (admin only)
 * Hard-delete a boardroom (only if no future confirmed bookings).
 */
router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  validateParams(idSchema),
  async (req: AuthRequest, res) => {
    try {
      // Check for future bookings
      const { data: future } = await supabaseAdmin
        .from('boardroom_bookings')
        .select('id')
        .eq('boardroom_id', req.params.id)
        .eq('status', 'confirmed')
        .gte('slot_start', new Date().toISOString())
        .limit(1);

      if (future && future.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Cannot delete a boardroom with upcoming bookings. Cancel all future bookings first or deactivate the room.',
        });
      }

      const { error } = await supabaseAdmin
        .from('boardrooms')
        .delete()
        .eq('id', req.params.id);

      if (error) throw error;
      logger.info('Boardroom deleted', { id: req.params.id, adminId: req.user!.id });
      res.json({ success: true });
    } catch (err: any) {
      logger.error('DELETE /boardrooms/:id', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * POST /api/boardrooms/bookings   (authenticated)
 * Book a slot.
 */
router.post(
  '/bookings',
  authenticate,
  validateBody(createBookingSchema),
  async (req: AuthRequest, res) => {
    try {
      const { boardroom_id, slot_start, notes } = req.body as z.infer<typeof createBookingSchema>;
      const slotDate = new Date(slot_start);

      // Validate day/time rules
      const validation = validateSlotTime(slotDate);
      if (!validation.ok) {
        return res.status(400).json({ success: false, error: validation.reason });
      }

      // Max 1 month advance
      const maxAdvance = new Date();
      maxAdvance.setDate(maxAdvance.getDate() + 31);
      if (slotDate > maxAdvance) {
        return res.status(400).json({ success: false, error: 'Bookings can only be made up to 1 month in advance' });
      }

      // Slot must be in the future
      if (slotDate <= new Date()) {
        return res.status(400).json({ success: false, error: 'Cannot book a slot in the past' });
      }

      // Check room exists and is active
      const { data: room, error: roomError } = await supabaseAdmin
        .from('boardrooms')
        .select('id, name, is_active')
        .eq('id', boardroom_id)
        .single();

      if (roomError || !room) {
        return res.status(404).json({ success: false, error: 'Boardroom not found' });
      }
      if (!room.is_active) {
        return res.status(400).json({ success: false, error: 'This boardroom is not currently available for booking' });
      }

      // Check for conflicting confirmed booking
      const { data: conflict } = await supabaseAdmin
        .from('boardroom_bookings')
        .select('id')
        .eq('boardroom_id', boardroom_id)
        .eq('slot_start', slotDate.toISOString())
        .eq('status', 'confirmed')
        .maybeSingle();

      if (conflict) {
        return res.status(409).json({ success: false, error: 'This slot is already booked. Please choose another time.' });
      }

      // Check user doesn't have another booking at the same time (different room)
      const { data: sameTimeConflict } = await supabaseAdmin
        .from('boardroom_bookings')
        .select('id')
        .eq('user_id', req.user!.id)
        .eq('slot_start', slotDate.toISOString())
        .eq('status', 'confirmed')
        .maybeSingle();

      if (sameTimeConflict) {
        return res.status(409).json({ success: false, error: 'You already have a boardroom booking at this time.' });
      }

      // Insert booking
      const { data: booking, error: bookingError } = await supabaseAdmin
        .from('boardroom_bookings')
        .insert({
          boardroom_id,
          user_id:    req.user!.id,
          slot_start: slotDate.toISOString(),
          notes:      notes ?? null,
          status:     'confirmed',
        })
        .select('*')
        .single();

      if (bookingError) throw bookingError;

      // Compute display values
      const sast      = new Date(slotDate.getTime() + 2 * 60 * 60 * 1000);
      const slotLabel = `${String(sast.getUTCHours()).padStart(2, '0')}:00 – ${String(sast.getUTCHours() + 1).padStart(2, '0')}:00 SAST`;
      const dateLabel = sast.toUTCString().slice(0, 16);

      // Send confirmation notification
      await supabaseAdmin.from('notifications').insert({
        user_id: req.user!.id,
        type:    'boardroom_booking_confirmed',
        title:   `Boardroom booked: ${room.name}`,
        message: `Your booking for ${room.name} on ${dateLabel} at ${slotLabel} is confirmed.`,
        data:    {
          booking_id:  booking.id,
          room_name:   room.name,
          slot_start:  slotDate.toISOString(),
          slot_label:  slotLabel,
        },
      });

      logger.info('Boardroom booked', { bookingId: booking.id, userId: req.user!.id, roomId: boardroom_id });
      res.status(201).json({ success: true, data: booking });
    } catch (err: any) {
      logger.error('POST /boardrooms/bookings', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * PATCH /api/boardrooms/bookings/:id/cancel
 * User cancels their own booking, or admin cancels any booking.
 */
router.patch(
  '/bookings/:id/cancel',
  authenticate,
  validateParams(idSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const isAdmin = req.user!.role === 'admin' || req.user!.role === 'moderator';

      // Fetch the booking
      const { data: booking, error: fetchError } = await supabaseAdmin
        .from('boardroom_bookings')
        .select(`
          id, user_id, slot_start, status,
          boardrooms ( id, name )
        `)
        .eq('id', id)
        .single();

      if (fetchError || !booking) {
        return res.status(404).json({ success: false, error: 'Booking not found' });
      }

      if (!isAdmin && booking.user_id !== req.user!.id) {
        return res.status(403).json({ success: false, error: 'You can only cancel your own bookings' });
      }

      if (booking.status === 'cancelled') {
        return res.status(400).json({ success: false, error: 'Booking is already cancelled' });
      }

      // Update to cancelled
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('boardroom_bookings')
        .update({
          status:       'cancelled',
          cancelled_by: req.user!.id,
          cancelled_at: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updateError) throw updateError;

      // Notification to the booking owner (if admin cancelled on their behalf)
      const notifyUserId = booking.user_id;
      const room = (booking as any).boardrooms ?? {};
      const slotDate  = new Date(booking.slot_start);
      const sast      = new Date(slotDate.getTime() + 2 * 60 * 60 * 1000);
      const slotLabel = `${String(sast.getUTCHours()).padStart(2, '0')}:00 – ${String(sast.getUTCHours() + 1).padStart(2, '0')}:00 SAST`;

      const cancelledByAdmin = isAdmin && booking.user_id !== req.user!.id;
      await supabaseAdmin.from('notifications').insert({
        user_id: notifyUserId,
        type:    'boardroom_booking_cancelled',
        title:   `Boardroom booking cancelled: ${room.name ?? 'Boardroom'}`,
        message: cancelledByAdmin
          ? `Your booking for ${room.name ?? 'the boardroom'} at ${slotLabel} has been cancelled by an admin.`
          : `Your booking for ${room.name ?? 'the boardroom'} at ${slotLabel} has been cancelled.`,
        data:    {
          booking_id: id,
          room_name:  room.name ?? '',
          slot_start: booking.slot_start,
          slot_label: slotLabel,
        },
      });

      logger.info('Booking cancelled', { bookingId: id, cancelledBy: req.user!.id });
      res.json({ success: true, data: updated });
    } catch (err: any) {
      logger.error('PATCH /boardrooms/bookings/:id/cancel', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
