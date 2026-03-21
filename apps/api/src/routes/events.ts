import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validation.js';
import { sendEmail } from '../services/email.js';
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

const updateEventSchema = z.object({
  title:         z.string().min(1).max(200).optional(),
  description:   z.string().max(2000).optional(),
  location:      z.string().max(300).optional(),
  meeting_url:   z.string().url().optional().or(z.literal('')),
  starts_at:     z.string().datetime().optional(),
  ends_at:       z.string().datetime().optional(),
  max_attendees: z.number().int().positive().nullable().optional(),
  is_online:     z.boolean().optional(),
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
 * Only admins and moderators may create events.
 */
router.post('/', authenticate, validateBody(createEventSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const role   = req.user!.role;

    if (role !== 'admin' && role !== 'moderator') {
      return res.status(403).json({ success: false, error: 'Only admins and moderators can create events' });
    }

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
 * PATCH /api/events/:id
 * Update an event's details. Only admins, moderators, or the event creator may do this.
 * If significant fields (title, starts_at, location) change, all "going" attendees
 * receive an email notification.
 */
router.patch('/:id', authenticate, validateParams(idSchema), validateBody(updateEventSchema), async (req: AuthRequest, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user!.id;
    const role     = req.user!.role;
    const isMod    = role === 'admin' || role === 'moderator';

    // Fetch existing event
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('community_events')
      .select('id, title, starts_at, location, created_by, is_cancelled')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    if (existing.is_cancelled) {
      return res.status(400).json({ success: false, error: 'Cannot update a cancelled event' });
    }

    if (!isMod && existing.created_by !== userId) {
      return res.status(403).json({ success: false, error: 'Only admins, moderators, or the event creator can edit this event' });
    }

    const updates = req.body as z.infer<typeof updateEventSchema>;
    const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('community_events')
      .update(payload)
      .eq('id', id)
      .select(`
        *,
        forum_categories!category_id (id, name),
        profiles!community_events_created_by_fkey_profiles (id, email, avatar_url, full_name)
      `)
      .single();

    if (updateError) {
      logger.error('Failed to update event', { id, updateError });
      return res.status(500).json({ success: false, error: 'Failed to update event' });
    }

    // Check if any "significant" fields changed to trigger attendee notifications
    const significantChange =
      (updates.title     !== undefined && updates.title     !== existing.title)     ||
      (updates.starts_at !== undefined && updates.starts_at !== existing.starts_at) ||
      (updates.location  !== undefined && updates.location  !== existing.location);

    if (significantChange) {
      setImmediate(async () => {
        try {
          // Get all "going" attendees (excluding the editor)
          const { data: rsvps } = await supabaseAdmin
            .from('community_event_rsvps')
            .select('user_id, profiles!community_event_rsvps_user_id_fkey_profiles (email, full_name)')
            .eq('event_id', id)
            .eq('status', 'going')
            .neq('user_id', userId);

          if (!rsvps?.length) return;

          const eventTitle = (updated as any).title ?? existing.title;
          const changesHtml = [
            updates.title     !== existing.title     ? `<li><strong>Title:</strong> ${updates.title}</li>`     : '',
            updates.starts_at !== existing.starts_at ? `<li><strong>Date/Time:</strong> ${new Date(updates.starts_at!).toLocaleString()}</li>` : '',
            updates.location  !== existing.location  ? `<li><strong>Location:</strong> ${updates.location ?? 'Not specified'}</li>` : '',
          ].filter(Boolean).join('');

          const html = `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9fafb; }
                .changes { background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 15px; border-radius: 6px; margin: 15px 0; }
                .button { display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
                .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header"><h2>Event Updated: ${eventTitle}</h2></div>
                <div class="content">
                  <p>An event you RSVP'd to has been updated. Here's what changed:</p>
                  <div class="changes"><ul>${changesHtml}</ul></div>
                  <p>Your RSVP is still active. Please review the changes and update your plans accordingly.</p>
                </div>
                <div class="footer">
                  <p>You're receiving this because you RSVP'd as "Going" on Kumii.</p>
                </div>
              </div>
            </body>
            </html>
          `;

          const emails = rsvps
            .map((r: any) => r.profiles?.email)
            .filter((e: string | undefined): e is string => Boolean(e));

          // Send in batches of 10 to avoid rate limits
          for (let i = 0; i < emails.length; i += 10) {
            const batch = emails.slice(i, i + 10);
            await Promise.allSettled(
              batch.map(email =>
                sendEmail({ to: email, subject: `Event updated: ${eventTitle}`, html })
              )
            );
          }

          logger.info('Event update notifications sent', { eventId: id, count: emails.length });
        } catch (err) {
          logger.warn('Failed to send event update notifications', { err });
        }
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

/**
 * DELETE /api/events/:id/reminder
 * Cancel an existing reminder for the calling user.
 */
router.delete('/:id/reminder', authenticate, validateParams(idSchema), async (req: AuthRequest, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user!.id;

    const { error } = await supabaseAdmin
      .from('event_reminders')
      .delete()
      .eq('event_id', id)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true, data: { message: 'Reminder cancelled' } });
  } catch (err: any) {
    logger.error('DELETE /events/:id/reminder', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/events/reminders/due
 * Returns all unsent reminders whose remind_at <= now, marks them as sent.
 * Intended to be called by a Vercel cron job (secured by CRON_SECRET header).
 *
 * Cron example (vercel.json):
 *   { "crons": [{ "path": "/api/events/reminders/due", "schedule": "* * * * *" }] }
 */
router.get('/reminders/due', async (req, res) => {
  try {
    // Lightweight secret check so only your cron caller can trigger sends
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const provided = req.headers['x-cron-secret'] ?? req.headers['authorization']?.replace('Bearer ', '');
      if (provided !== cronSecret) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
    }

    const now = new Date().toISOString();

    // Fetch due reminders (not yet sent)
    const { data: reminders, error: fetchErr } = await supabaseAdmin
      .from('event_reminders')
      .select(`
        id, remind_at, user_id, event_id,
        user:user_id (id, email, full_name),
        event:event_id (id, title, starts_at, location, meeting_url)
      `)
      .eq('sent', false)
      .lte('remind_at', now);

    if (fetchErr) throw fetchErr;

    if (!reminders || reminders.length === 0) {
      return res.json({ success: true, data: { processed: 0 } });
    }

    // Mark all as sent first (idempotent — prevents double-send on retry)
    const reminderIds = reminders.map((r: any) => r.id);
    await supabaseAdmin
      .from('event_reminders')
      .update({ sent: true })
      .in('id', reminderIds);

    // Send emails + in-app notifications (fire-and-forget each)
    let processed = 0;
    for (const reminder of reminders) {
      const r = reminder as any;
      const user  = r.user;
      const event = r.event;
      if (!user?.email || !event?.title) continue;

      processed++;

      setImmediate(async () => {
        try {
          // In-app notification
          await supabaseAdmin.from('notifications').insert({
            user_id: user.id,
            type:    'system',
            title:   `Reminder: ${event.title}`,
            content: `Your event "${event.title}" starts at ${new Date(event.starts_at).toLocaleString()}.`,
            link:    `/events/${event.id}`,
          });

          // Email
          await sendEmail({
            to:      user.email,
            subject: `Reminder: ${event.title}`,
            html: `
              <h2>Event Reminder</h2>
              <p>Hi ${user.full_name ?? 'there'},</p>
              <p>This is a reminder that <strong>${event.title}</strong> is coming up.</p>
              <p><strong>When:</strong> ${new Date(event.starts_at).toLocaleString()}</p>
              ${event.location ? `<p><strong>Where:</strong> ${event.location}</p>` : ''}
              ${event.meeting_url ? `<p><strong>Link:</strong> <a href="${event.meeting_url}">${event.meeting_url}</a></p>` : ''}
            `,
          });
        } catch { /* non-fatal — reminder already marked sent */ }
      });
    }

    res.json({ success: true, data: { processed } });
  } catch (err: any) {
    logger.error('GET /events/reminders/due', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
