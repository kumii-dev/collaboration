import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import { sendEmail } from '../services/email.js';
import logger from '../logger.js';

const router = Router();

// ── Schemas ───────────────────────────────────────────────────────────────────
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
  is_featured:   z.boolean().optional().default(false),
});

const updateEventSchema = z.object({
  title:         z.string().min(1).max(200).optional(),
  description:   z.string().max(2000).optional(),
  location:      z.string().max(300).optional(),
  meeting_url:   z.string().url().optional().or(z.literal('')),
  starts_at:     z.string().datetime().optional(),
  ends_at:       z.string().datetime().optional(),
  max_attendees: z.number().int().positive().nullable().optional(),
  is_online:     z.boolean().optional(),
  is_featured:   z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field is required' });

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

function mapEvent(e: any, userId: string) {
  const rsvps = e.community_event_rsvps ?? [];
  const cat   = e.forum_categories;
  return {
    ...e,
    forum_categories: cat ? { ...cat, slug: cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') } : null,
    rsvp_counts: {
      going:      rsvps.filter((r: any) => r.status === 'going').length,
      interested: rsvps.filter((r: any) => r.status === 'interested').length,
      not_going:  rsvps.filter((r: any) => r.status === 'not_going').length,
    },
    user_rsvp: rsvps.find((r: any) => r.user_id === userId)?.status ?? null,
    community_event_rsvps: undefined,
  };
}

const EVENT_SELECT = `
  *,
  forum_categories!category_id (id, name),
  profiles!community_events_created_by_fkey_profiles (id, email, avatar_url, full_name),
  community_event_rsvps (id, status, user_id)
`;

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/events/featured
 * Returns featured events (is_featured = true, not cancelled) across all communities.
 * Includes both upcoming and past so they persist on the forum page.
 * Limit defaults to 6, max 20. Ordered: upcoming first, then most-recent past.
 */
router.get('/featured', authenticate, async (req: AuthRequest, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 6), 20);
    const userId = req.user!.id;
    const now    = new Date().toISOString();

    // Fetch upcoming featured (ascending) + past featured (descending) separately, merge
    const [upcomingRes, pastRes] = await Promise.all([
      supabaseAdmin
        .from('community_events')
        .select(EVENT_SELECT)
        .eq('is_featured', true)
        .eq('is_cancelled', false)
        .gte('starts_at', now)
        .order('starts_at', { ascending: true })
        .limit(limit),
      supabaseAdmin
        .from('community_events')
        .select(EVENT_SELECT)
        .eq('is_featured', true)
        .eq('is_cancelled', false)
        .lt('starts_at', now)
        .order('starts_at', { ascending: false })
        .limit(limit),
    ]);

    if (upcomingRes.error) {
      if (upcomingRes.error.message?.includes('is_featured') || upcomingRes.error.code === '42703') {
        logger.warn('GET /events/featured: is_featured column missing — run migration 009_featured_events.sql');
        return res.json({ success: true, data: [] });
      }
      throw upcomingRes.error;
    }
    if (pastRes.error) throw pastRes.error;

    const merged = [...(upcomingRes.data ?? []), ...(pastRes.data ?? [])].slice(0, limit);
    res.json({ success: true, data: merged.map(e => mapEvent(e, userId)) });
  } catch (err: any) {
    logger.error('GET /events/featured', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/events/:id/feature
 * Toggle is_featured on an event. Admin only.
 * Body: { featured: boolean }
 */
router.patch(
  '/:id/feature',
  authenticate,
  validateParams(idSchema),
  validateBody(z.object({ featured: z.boolean() })),
  async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Only admins can feature events' });
      }
      const { id }       = req.params;
      const { featured } = req.body as { featured: boolean };
      const { data, error } = await supabaseAdmin
        .from('community_events')
        .update({ is_featured: featured, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, title, is_featured')
        .single();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Event not found' });
      logger.info(`Event ${featured ? 'featured' : 'unfeatured'} by admin`, { eventId: id, adminId: req.user!.id });
      res.json({ success: true, data });
    } catch (err: any) {
      logger.error('PATCH /events/:id/feature', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/events
 * List events. Optional ?category_id=<uuid>&view=upcoming|past|all (default: all)
 * - upcoming: starts_at >= now, ascending
 * - past:     starts_at <  now, descending (most recent first)
 * - all:      no time filter, descending by starts_at
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { category_id, view = 'all', limit = '50', offset = '0' } = req.query as Record<string, string>;
    const now = new Date().toISOString();

    let query = supabaseAdmin
      .from('community_events')
      .select(EVENT_SELECT)
      .eq('is_cancelled', false);

    if (view === 'upcoming') {
      query = query.gte('starts_at', now).order('starts_at', { ascending: true });
    } else if (view === 'past') {
      query = query.lt('starts_at', now).order('starts_at', { ascending: false });
    } else {
      // 'all' — show every event, most recent starts_at first
      query = query.order('starts_at', { ascending: false });
    }

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
    if (category_id) query = query.eq('category_id', category_id);

    const { data, error } = await query;
    if (error) throw error;
    const userId = req.user!.id;
    res.json({ success: true, data: (data ?? []).map(e => mapEvent(e, userId)) });
  } catch (err: any) {
    logger.error('GET /events', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/events/calendar?month=<1-12>&year=<yyyy>
 */
router.get(
  '/calendar',
  authenticate,
  validateQuery(z.object({
    month:       z.coerce.number().min(1).max(12).optional(),
    year:        z.coerce.number().min(2000).max(2100).optional(),
    category_id: z.string().uuid().optional(),
  })),
  async (req: AuthRequest, res) => {
    try {
      const now   = new Date();
      const month = Number(req.query.month ?? now.getMonth() + 1);
      const year  = Number(req.query.year  ?? now.getFullYear());
      const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
      const endOfMonth   = new Date(Date.UTC(year, month, 1));
      let query = supabaseAdmin
        .from('community_events')
        .select(`
          id, title, description, starts_at, ends_at, location, is_cancelled, category_id,
          forum_categories!category_id (id, name),
          community_event_rsvps (id, status, user_id)
        `)
        .eq('is_cancelled', false)
        .gte('starts_at', startOfMonth.toISOString())
        .lt('starts_at',  endOfMonth.toISOString())
        .order('starts_at', { ascending: true });
      if (req.query.category_id) query = query.eq('category_id', req.query.category_id as string);
      const { data, error } = await query;
      if (error) throw error;
      const userId = req.user!.id;
      const grouped: Record<string, unknown[]> = {};
      for (const e of (data ?? [])) {
        const dateKey = (e.starts_at as string).slice(0, 10);
        if (!grouped[dateKey]) grouped[dateKey] = [];
        const rsvps    = (e as any).community_event_rsvps ?? [];
        const userRsvp = rsvps.find((r: any) => r.user_id === userId)?.status ?? null;
        grouped[dateKey].push({
          id: e.id, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at,
          location: e.location, category: e.forum_categories,
          rsvp_counts: {
            going:      rsvps.filter((r: any) => r.status === 'going').length,
            interested: rsvps.filter((r: any) => r.status === 'interested').length,
            not_going:  rsvps.filter((r: any) => r.status === 'not_going').length,
          },
          user_rsvp: userRsvp,
        });
      }
      res.json({ success: true, data: { year, month, days: grouped } });
    } catch (err: any) {
      logger.error('GET /events/calendar error', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

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
    res.json({
      success: true,
      data: {
        ...data,
        forum_categories: cat ? { ...cat, slug: cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') } : null,
        rsvp_counts: {
          going:      rsvps.filter((r: any) => r.status === 'going').length,
          interested: rsvps.filter((r: any) => r.status === 'interested').length,
          not_going:  rsvps.filter((r: any) => r.status === 'not_going').length,
        },
        user_rsvp: rsvps.find((r: any) => r.user_id === userId)?.status ?? null,
        attendees: rsvps.filter((r: any) => r.status === 'going').map((r: any) => r.profiles),
        community_event_rsvps: undefined,
      },
    });
  } catch (err: any) {
    logger.error('GET /events/:id', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/events — admins and moderators only
 */
router.post('/', authenticate, validateBody(createEventSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const role   = req.user!.role;
    if (role !== 'admin' && role !== 'moderator') {
      return res.status(403).json({ success: false, error: 'Only admins and moderators can create events' });
    }
    const { data, error } = await supabaseAdmin
      .from('community_events')
      .insert({ ...req.body, created_by: userId })
      .select(`*, profiles!community_events_created_by_fkey_profiles (id, email, avatar_url, full_name)`)
      .single();
    if (error) throw error;
    await supabaseAdmin.from('community_event_rsvps').insert({ event_id: data.id, user_id: userId, status: 'going' });
    res.status(201).json({
      success: true,
      data: { ...data, rsvp_counts: { going: 1, interested: 0, not_going: 0 }, user_rsvp: 'going' },
    });
  } catch (err: any) {
    logger.error('POST /events', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/events/:id — significant changes trigger attendee email notifications
 */
router.patch('/:id', authenticate, validateParams(idSchema), validateBody(updateEventSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const role   = req.user!.role;
    const isMod  = role === 'admin' || role === 'moderator';

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('community_events')
      .select('id, title, starts_at, location, created_by, is_cancelled')
      .eq('id', id).single();

    if (fetchError || !existing) return res.status(404).json({ success: false, error: 'Event not found' });
    if (existing.is_cancelled)   return res.status(400).json({ success: false, error: 'Cannot update a cancelled event' });
    if (!isMod && existing.created_by !== userId) {
      return res.status(403).json({ success: false, error: 'Only admins, moderators, or the event creator can edit this event' });
    }

    const updates = req.body as z.infer<typeof updateEventSchema>;
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('community_events')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`*, forum_categories!category_id (id, name), profiles!community_events_created_by_fkey_profiles (id, email, avatar_url, full_name)`)
      .single();

    if (updateError) {
      logger.error('Failed to update event', { id, updateError });
      return res.status(500).json({ success: false, error: 'Failed to update event' });
    }

    const significantChange =
      (updates.title     !== undefined && updates.title     !== existing.title)     ||
      (updates.starts_at !== undefined && updates.starts_at !== existing.starts_at) ||
      (updates.location  !== undefined && updates.location  !== existing.location);

    if (significantChange) {
      setImmediate(async () => {
        try {
          const { data: rsvps } = await supabaseAdmin
            .from('community_event_rsvps')
            .select('user_id, profiles!community_event_rsvps_user_id_fkey_profiles (email, full_name)')
            .eq('event_id', id).eq('status', 'going').neq('user_id', userId);
          if (!rsvps?.length) return;

          const eventTitle  = (updated as any).title ?? existing.title;
          const changesHtml = [
            updates.title     !== existing.title     ? `<li><strong>Title:</strong> ${updates.title}</li>` : '',
            updates.starts_at !== existing.starts_at ? `<li><strong>Date/Time:</strong> ${new Date(updates.starts_at!).toLocaleString()}</li>` : '',
            updates.location  !== existing.location  ? `<li><strong>Location:</strong> ${updates.location ?? 'Not specified'}</li>` : '',
          ].filter(Boolean).join('');

          const html = `<!DOCTYPE html><html><head><style>
            body{font-family:Arial,sans-serif;line-height:1.6;color:#333}
            .container{max-width:600px;margin:0 auto;padding:20px}
            .header{background:#7a8567;color:white;padding:20px;text-align:center}
            .content{padding:20px;background:#f9fafb}
            .changes{background:#f0f4e8;border:1px solid #c5df96;padding:15px;border-radius:6px;margin:15px 0}
            .footer{text-align:center;padding:20px;color:#6b7280;font-size:12px}
          </style></head><body><div class="container">
            <div class="header"><h2>Event Updated: ${eventTitle}</h2></div>
            <div class="content">
              <p>An event you RSVP'd to has been updated. Here's what changed:</p>
              <div class="changes"><ul>${changesHtml}</ul></div>
              <p>Your RSVP is still active. Please review the changes and update your plans accordingly.</p>
            </div>
            <div class="footer"><p>You're receiving this because you RSVP'd as "Going" on Kumii.</p></div>
          </div></body></html>`;

          const emails = rsvps.map((r: any) => r.profiles?.email).filter((e: string | undefined): e is string => Boolean(e));
          for (let i = 0; i < emails.length; i += 10) {
            await Promise.allSettled(emails.slice(i, i + 10).map(email => sendEmail({ to: email, subject: `Event updated: ${eventTitle}`, html })));
          }
          logger.info('Event update notifications sent', { eventId: id, count: emails.length });
        } catch (err) { logger.warn('Failed to send event update notifications', { err }); }
      });
    }

    const rsvp_counts = await getCountsForEvent(id);
    res.json({ success: true, data: { ...updated, rsvp_counts } });
  } catch (err: any) {
    logger.error('PATCH /events/:id', err);
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
    const { id }     = req.params;
    const userId     = req.user!.id;
    const { status } = req.body as { status: 'going' | 'interested' | 'not_going' };
    if (status === 'going') {
      const { data: ev } = await supabaseAdmin.from('community_events').select('max_attendees').eq('id', id).single();
      if (ev?.max_attendees) {
        const { count } = await supabaseAdmin.from('community_event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', id).eq('status', 'going');
        if (count && count >= ev.max_attendees) return res.status(400).json({ success: false, error: 'Event is at full capacity' });
      }
    }
    const { error } = await supabaseAdmin.from('community_event_rsvps').upsert({ event_id: id, user_id: userId, status }, { onConflict: 'event_id,user_id' });
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
    const { error } = await supabaseAdmin.from('community_event_rsvps').delete().eq('event_id', id).eq('user_id', userId);
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
    const { id }        = req.params;
    const userId        = req.user!.id;
    const { remind_at } = req.body as { remind_at: string };
    const { data, error } = await supabaseAdmin.from('event_reminders')
      .upsert({ event_id: id, user_id: userId, remind_at, sent: false }, { onConflict: 'event_id,user_id' })
      .select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    logger.error('POST /events/:id/reminder', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/events/:id/reminder
 */
router.delete('/:id/reminder', authenticate, validateParams(idSchema), async (req: AuthRequest, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user!.id;
    const { error } = await supabaseAdmin.from('event_reminders').delete().eq('event_id', id).eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true, data: { message: 'Reminder cancelled' } });
  } catch (err: any) {
    logger.error('DELETE /events/:id/reminder', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/events/reminders/due
 * Processes unsent reminders. Called by Vercel cron (secured by CRON_SECRET).
 */
router.get('/reminders/due', async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const provided = req.headers['x-cron-secret'] ?? req.headers['authorization']?.replace('Bearer ', '');
      if (provided !== cronSecret) return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { data: reminders, error: fetchErr } = await supabaseAdmin
      .from('event_reminders')
      .select(`id, remind_at, user_id, event_id, user:user_id (id, email, full_name), event:event_id (id, title, starts_at, location, meeting_url)`)
      .eq('sent', false)
      .lte('remind_at', new Date().toISOString());

    if (fetchErr) throw fetchErr;
    if (!reminders || reminders.length === 0) return res.json({ success: true, data: { processed: 0 } });

    await supabaseAdmin.from('event_reminders').update({ sent: true }).in('id', reminders.map((r: any) => r.id));

    let processed = 0;
    for (const reminder of reminders) {
      const r = reminder as any;
      if (!r.user?.email || !r.event?.title) continue;
      processed++;
      setImmediate(async () => {
        try {
          await supabaseAdmin.from('notifications').insert({
            user_id: r.user.id, type: 'system',
            title:   `Reminder: ${r.event.title}`,
            content: `Your event "${r.event.title}" starts at ${new Date(r.event.starts_at).toLocaleString()}.`,
            link:    `/events/${r.event.id}`,
          });
          await sendEmail({
            to: r.user.email, subject: `Reminder: ${r.event.title}`,
            html: `<h2>Event Reminder</h2><p>Hi ${r.user.full_name ?? 'there'},</p>
              <p>Reminder: <strong>${r.event.title}</strong> is coming up.</p>
              <p><strong>When:</strong> ${new Date(r.event.starts_at).toLocaleString()}</p>
              ${r.event.location    ? `<p><strong>Where:</strong> ${r.event.location}</p>` : ''}
              ${r.event.meeting_url ? `<p><strong>Link:</strong> <a href="${r.event.meeting_url}">${r.event.meeting_url}</a></p>` : ''}`,
          });
        } catch { /* non-fatal */ }
      });
    }
    res.json({ success: true, data: { processed } });
  } catch (err: any) {
    logger.error('GET /events/reminders/due', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/events/:id/rsvps/attendees  (admin only) ────────────────────────
// Two-step query: fetch RSVPs, then join profiles manually.
// community_event_rsvps.user_id → auth.users (not profiles), so PostgREST
// cannot traverse the FK to profiles in a single select.
router.get('/:id/rsvps/attendees', authenticate, requireAdmin,
  async (req: AuthRequest, res) => {
    const { id } = req.params;

    // 1. Verify event exists
    const { data: event, error: eventErr } = await supabaseAdmin
      .from('community_events')
      .select('id, title')
      .eq('id', id)
      .single();

    if (eventErr || !event)
      return res.status(404).json({ success: false, error: 'Event not found.' });

    // 2. Fetch all RSVPs for this event
    const { data: rsvps, error: rsvpErr } = await supabaseAdmin
      .from('community_event_rsvps')
      .select('id, user_id, status, created_at')
      .eq('event_id', id)
      .order('created_at', { ascending: true });

    if (rsvpErr) {
      logger.error('GET /events/:id/rsvps/attendees - rsvps', rsvpErr);
      return res.status(500).json({ success: false, error: rsvpErr.message });
    }

    const rows = rsvps ?? [];

    // 3. Fetch profiles for those user IDs
    const userIds = [...new Set(rows.map(r => r.user_id))];
    let profileMap: Record<string, { id: string; full_name: string | null; email: string; sector: string | null; avatar_url: string | null }> = {};

    if (userIds.length > 0) {
      const { data: profiles, error: profErr } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, sector, avatar_url')
        .in('id', userIds);

      if (profErr) {
        logger.error('GET /events/:id/rsvps/attendees - profiles', profErr);
        return res.status(500).json({ success: false, error: profErr.message });
      }

      for (const p of profiles ?? []) {
        profileMap[p.id] = p;
      }
    }

    // 4. Merge
    const attendees = rows.map(r => ({
      id:         r.id,
      status:     r.status,
      created_at: r.created_at,
      user: profileMap[r.user_id] ?? {
        id:         r.user_id,
        full_name:  null,
        email:      '',
        sector:     null,
        avatar_url: null,
      },
    }));

    return res.json({
      success: true,
      data: {
        event_id:    id,
        event_title: event.title,
        total:       attendees.length,
        counts: {
          going:      attendees.filter(r => r.status === 'going').length,
          interested: attendees.filter(r => r.status === 'interested').length,
          not_going:  attendees.filter(r => r.status === 'not_going').length,
        },
        attendees,
      },
    });
  }
);

export default router;
