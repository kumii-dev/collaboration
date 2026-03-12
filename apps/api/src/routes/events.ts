import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validation.js';
import logger from '../logger.js';

const router = Router();

// ── Schemas ──────────────────────────────────────────────────────────────────
const createEventSchema = z.object({
  category_id:   z.string().uuid(),
  title:         z.string().min(1).max(200),
  description:   z.string().max(2000).optional(),
  location:      z.string().max(300).optional(),
  meeting_url:   z.string().url().optional().or(z.literal('')),
  starts_at:     z.string().datetime(),
  ends_at:       z.string().datetime().optional(),
  max_attendees: z.number().int().positive().optional(),
  is_online:     z.boolean().optional().default(false),
});

const rsvpSchema = z.object({
  status: z.enum(['going', 'interested', 'not_going']),
});

const reminderSchema = z.object({
  remind_at: z.string().datetime(),
});

const idSchema = z.object({ id: z.string().uuid() });

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getCountsForEvent(eventId: string) {
  const { data } = await supabaseAdmin
    .from('community_event_rsvps')
    .select('status')
    .eq('event_id', eventId);

  return {
    going:      (data ?? []).filter(r => r.status === 'going').length,
    interested: (data ?? []).filter(r => r.status === 'interested').length,
    not_going:  (data ?? []).filter(r => r.status === 'not_going').length,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/events
 * List upcoming events. Optional ?category_id=<uuid>
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { category_id, limit = '20', offset = '0' } = req.query as Record<string, string>;

    let query = supabaseAdmin
      .from('community_events')
      .select(`
        *,
        forum_categories!category_id (id, name),
        profiles!community_events_created_by_fkey_profiles (id, email, avatar_url, full_name),
        community_event_rsvps (id, status, user_id)
      `)
      .eq('is_cancelled', false)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (category_id) query = query.eq('category_id', category_id);

    const { data, error } = await query;
    if (error) throw error;

    const userId = req.user!.id;
    const events = (data ?? []).map((e: any) => {
      const rsvps = e.community_event_rsvps ?? [];
      const cat   = e.forum_categories;
      return {
        ...e,
        forum_categories: cat ? {
          ...cat,
          slug: cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        } : null,
        rsvp_counts: {
          going:      rsvps.filter((r: any) => r.status === 'going').length,
          interested: rsvps.filter((r: any) => r.status === 'interested').length,
          not_going:  rsvps.filter((r: any) => r.status === 'not_going').length,
        },
        user_rsvp: rsvps.find((r: any) => r.user_id === userId)?.status ?? null,
        community_event_rsvps: undefined,
      };
    });

    res.json({ success: true, data: events });
  } catch (err: any) {
    logger.error('GET /events', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/events/:id
 */
router.get('/:id', authenticate, validateParams(idSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('community_events')
      .select(`
        *,
        forum_categories!category_id (id, name),
        profiles!community_events_created_by_fkey_profiles (id, email, avatar_url, full_name),
        community_event_rsvps (id, status, user_id, profiles!community_event_rsvps_user_id_fkey_profiles (id, email, avatar_url, full_name))
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Event not found' });

    const rsvps = (data as any).community_event_rsvps ?? [];
    const cat   = (data as any).forum_categories;
    const event = {
      ...data,
      forum_categories: cat ? {
        ...cat,
        slug: cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      } : null,
      rsvp_counts: {
        going:      rsvps.filter((r: any) => r.status === 'going').length,
        interested: rsvps.filter((r: any) => r.status === 'interested').length,
        not_going:  rsvps.filter((r: any) => r.status === 'not_going').length,
      },
      user_rsvp:  rsvps.find((r: any) => r.user_id === userId)?.status ?? null,
      attendees:  rsvps.filter((r: any) => r.status === 'going').map((r: any) => r.profiles),
      community_event_rsvps: undefined,
    };

    res.json({ success: true, data: event });
  } catch (err: any) {
    logger.error('GET /events/:id', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/events
 */
router.post('/', authenticate, validateBody(createEventSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const payload = { ...req.body, created_by: userId };

    const { data, error } = await supabaseAdmin
      .from('community_events')
      .insert(payload)
      .select(`*, profiles!community_events_created_by_fkey_profiles (id, email, avatar_url, full_name)`)
      .single();

    if (error) throw error;

    // Auto-RSVP creator as going
    await supabaseAdmin
      .from('community_event_rsvps')
      .insert({ event_id: data.id, user_id: userId, status: 'going' });

    const result = {
      ...data,
      rsvp_counts: { going: 1, interested: 0, not_going: 0 },
      user_rsvp: 'going',
    };

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    logger.error('POST /events', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/events/:id  (soft-cancel)
 */
router.delete('/:id', authenticate, validateParams(idSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const role   = req.user!.role;

    // Admins can cancel any event; others only their own
    let query = supabaseAdmin.from('community_events').update({ is_cancelled: true }).eq('id', id);
    if (role !== 'admin' && role !== 'moderator') query = query.eq('created_by', userId);

    const { error } = await query;
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    logger.error('DELETE /events/:id', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/events/:id/rsvp
 */
router.post('/:id/rsvp', authenticate, validateParams(idSchema), validateBody(rsvpSchema), async (req: AuthRequest, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user!.id;
    const { status } = req.body as { status: 'going' | 'interested' | 'not_going' };

    // Capacity check for "going"
    if (status === 'going') {
      const { data: ev } = await supabaseAdmin
        .from('community_events')
        .select('max_attendees')
        .eq('id', id)
        .single();

      if (ev?.max_attendees) {
        const { count } = await supabaseAdmin
          .from('community_event_rsvps')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', id)
          .eq('status', 'going');

        if (count && count >= ev.max_attendees) {
          return res.status(400).json({ success: false, error: 'Event is at full capacity' });
        }
      }
    }

    const { error } = await supabaseAdmin
      .from('community_event_rsvps')
      .upsert({ event_id: id, user_id: userId, status }, { onConflict: 'event_id,user_id' });

    if (error) throw error;

    const rsvp_counts = await getCountsForEvent(id);
    res.json({ success: true, data: { status, rsvp_counts } });
  } catch (err: any) {
    logger.error('POST /events/:id/rsvp', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/events/:id/rsvp
 */
router.delete('/:id/rsvp', authenticate, validateParams(idSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const { error } = await supabaseAdmin
      .from('community_event_rsvps')
      .delete()
      .eq('event_id', id)
      .eq('user_id', userId);

    if (error) throw error;

    const rsvp_counts = await getCountsForEvent(id);
    res.json({ success: true, data: { rsvp_counts } });
  } catch (err: any) {
    logger.error('DELETE /events/:id/rsvp', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/events/:id/reminder
 */
router.post('/:id/reminder', authenticate, validateParams(idSchema), validateBody(reminderSchema), async (req: AuthRequest, res) => {
  try {
    const { id }       = req.params;
    const userId       = req.user!.id;
    const { remind_at } = req.body as { remind_at: string };

    const { data, error } = await supabaseAdmin
      .from('event_reminders')
      .upsert({ event_id: id, user_id: userId, remind_at, sent: false }, { onConflict: 'event_id,user_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    logger.error('POST /events/:id/reminder', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
