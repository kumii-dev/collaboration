/**
 * Dashboard routes
 *
 * GET /api/dashboard/stats    — per-user counts (conversations, threads, posts, reputation, unread)
 * GET /api/dashboard/activity — recent activity feed for the authenticated user
 */

import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../logger.js';

const router = Router();

// ── GET /api/dashboard/stats ─────────────────────────────────────────────────
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  try {
    // ── Step 1: get this user's conversation IDs first (needed for unread count).
    // Supabase JS client does not support passing a query builder into .in() —
    // we must resolve the IDs explicitly before using them as a filter.
    const { data: participantRows, error: partErr } = await supabaseAdmin
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId);

    if (partErr) logger.warn('dashboard/stats: conversation_participants error', { partErr });

    const conversationIds: string[] = (participantRows ?? []).map((r: any) => r.conversation_id);

    // ── Step 1b: get message IDs already read by this user (for unread count)
    const { data: readRows } = await supabaseAdmin
      .from('message_reads')
      .select('message_id')
      .eq('user_id', userId);

    const readMessageIds: string[] = (readRows ?? []).map((r: any) => r.message_id);

    // ── Step 2: run remaining counts in parallel
    const [threadResult, postResult, repResult, unreadResult, reportResult, groupResult, eventResult] =
      await Promise.all([
        // Forum threads created by user
        supabaseAdmin
          .from('forum_threads')
          .select('*', { count: 'exact', head: true })
          .eq('author_id', userId),

        // Forum posts (replies) by user
        supabaseAdmin
          .from('forum_posts')
          .select('*', { count: 'exact', head: true })
          .eq('author_id', userId),

        // Reputation score from profiles
        supabaseAdmin
          .from('profiles')
          .select('reputation_score')
          .eq('id', userId)
          .single(),

        // Unread messages: in user's conversations, not sent by user, not yet read
        conversationIds.length > 0
          ? (() => {
              let q = supabaseAdmin
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .in('conversation_id', conversationIds)
                .neq('sender_id', userId);
              if (readMessageIds.length > 0) {
                q = q.not('id', 'in', `(${readMessageIds.map(id => `"${id}"`).join(',')})`) as any;
              }
              return q;
            })()
          : Promise.resolve({ count: 0, error: null }),

        // Pending moderation reports
        supabaseAdmin
          .from('reports')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),

        // Groups the user is a member of
        supabaseAdmin
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),

        // Events the user has RSVP'd to (any status)
        supabaseAdmin
          .from('community_event_rsvps')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);

    // Log any Supabase errors so they appear in Vercel logs
    if (threadResult.error) logger.warn('dashboard/stats: threads error', { e: threadResult.error });
    if (postResult.error)   logger.warn('dashboard/stats: posts error',   { e: postResult.error });
    if (repResult.error)    logger.warn('dashboard/stats: profiles error', { e: repResult.error });
    if (unreadResult.error) logger.warn('dashboard/stats: messages error', { e: unreadResult.error });
    if (reportResult.error) logger.warn('dashboard/stats: reports error',  { e: reportResult.error });
    if (groupResult.error)  logger.warn('dashboard/stats: groups error',   { e: groupResult.error });
    if (eventResult.error)  logger.warn('dashboard/stats: events error',   { e: eventResult.error });

    const role    = req.user!.role;
    const isAdmin = role === 'admin' || role === 'moderator';

    return res.json({
      success: true,
      data: {
        total_conversations: conversationIds.length,
        total_threads:       threadResult.count ?? 0,
        total_posts:         postResult.count   ?? 0,
        reputation_score:    (repResult.data as any)?.reputation_score ?? 0,
        unread_messages:     unreadResult.count  ?? 0,
        groups_joined:       groupResult.count   ?? 0,
        events_rsvpd:        eventResult.count   ?? 0,
        pending_reports:     isAdmin ? (reportResult.count ?? 0) : undefined,
      },
    });
  } catch (err) {
    logger.error('dashboard/stats error', { message: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
  }
});

// ── GET /api/dashboard/activity ──────────────────────────────────────────────
router.get('/activity', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const limit  = Math.min(Number(req.query.limit) || 10, 50);

  try {
    // Gather recent actions across event types in parallel
    const [messagesRes, threadsRes, postsRes, eventsRes] = await Promise.all([
      // Recent chat messages sent by this user
      supabaseAdmin
        .from('messages')
        .select('id, content, created_at, conversation_id')
        .eq('sender_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit),

      // Recent forum threads created by user
      supabaseAdmin
        .from('forum_threads')
        .select('id, title, created_at, board_id')
        .eq('author_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit),

      // Recent forum posts (replies) by user
      supabaseAdmin
        .from('forum_posts')
        .select('id, content, created_at, thread_id')
        .eq('author_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit),

      // Recent event RSVPs by user
      supabaseAdmin
        .from('community_event_rsvps')
        .select('id, status, created_at, event:event_id (id, title)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    type ActivityItem = {
      id: string;
      type: 'message' | 'thread' | 'post' | 'event_rsvp';
      title: string;
      description: string;
      link: string;
      created_at: string;
    };

    const items: ActivityItem[] = [];

    for (const msg of (messagesRes.data ?? [])) {
      items.push({
        id:          `msg-${msg.id}`,
        type:        'message',
        title:       'Sent a message',
        description: (msg.content as string)?.slice(0, 80) ?? '',
        link:        `/chat/${msg.conversation_id}`,
        created_at:  msg.created_at,
      });
    }

    for (const thread of (threadsRes.data ?? [])) {
      items.push({
        id:          `thread-${thread.id}`,
        type:        'thread',
        title:       thread.title as string,
        description: 'Created a discussion thread',
        link:        `/forum/threads/${thread.id}`,
        created_at:  thread.created_at,
      });
    }

    for (const post of (postsRes.data ?? [])) {
      items.push({
        id:          `post-${post.id}`,
        type:        'post',
        title:       'Replied to a thread',
        description: (post.content as string)?.slice(0, 80) ?? '',
        link:        `/forum/threads/${post.thread_id}`,
        created_at:  post.created_at,
      });
    }

    for (const rsvp of (eventsRes.data ?? [])) {
      const evt = Array.isArray(rsvp.event) ? rsvp.event[0] : rsvp.event as any;
      items.push({
        id:          `rsvp-${rsvp.id}`,
        type:        'event_rsvp',
        title:       evt?.title ?? 'Event',
        description: `RSVP'd as ${rsvp.status}`,
        link:        `/events/${evt?.id ?? ''}`,
        created_at:  rsvp.created_at as string,
      });
    }

    // Sort all items by date descending and take the top N
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json({
      success: true,
      data: items.slice(0, limit),
    });
  } catch (err) {
    logger.error('dashboard/activity error', { err });
    return res.status(500).json({ success: false, error: 'Failed to fetch dashboard activity' });
  }
});

export default router;
