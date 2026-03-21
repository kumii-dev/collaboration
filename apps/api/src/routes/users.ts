import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.js';
import logger from '../logger.js';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
});

const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  bio: z.string().max(2000).optional(),
  company: z.string().max(200).optional(),
  sector: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  phone: z.string().max(30).optional().or(z.literal('')),
  avatar_url: z.string().url().optional().or(z.literal('')),
  consent_marketing: z.boolean().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const leaderboardQuerySchema = z.object({
  limit: z.string().optional().transform(v => Math.min(Number(v) || 20, 100)),
});

/**
 * GET /api/users/me
 * Get the authenticated user's own full profile
 */
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, avatar_url, role, company, bio, sector, location, phone, reputation_score, consent_marketing, consent_data_processing, last_seen_at, created_at')
      .eq('id', req.user!.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    logger.error('Error fetching own profile', { error });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PATCH /api/users/me
 * Update the authenticated user's own profile
 * Role and email cannot be changed here.
 */
router.patch(
  '/me',
  authenticate,
  validateBody(updateProfileSchema),
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const updates = req.body as z.infer<typeof updateProfileSchema>;

      // Build the update payload — only include fields that were sent
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.full_name !== undefined)         payload.full_name         = updates.full_name.trim();
      if (updates.bio !== undefined)               payload.bio               = updates.bio.trim();
      if (updates.company !== undefined)           payload.company           = updates.company.trim();
      if (updates.sector !== undefined)            payload.sector            = updates.sector.trim();
      if (updates.location !== undefined)          payload.location          = updates.location.trim();
      if (updates.phone !== undefined)             payload.phone             = updates.phone?.trim() || null;
      if (updates.avatar_url !== undefined)        payload.avatar_url        = updates.avatar_url || null;
      if (updates.consent_marketing !== undefined) payload.consent_marketing = updates.consent_marketing;

      const { data: updated, error } = await supabaseAdmin
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select('id, email, full_name, avatar_url, role, company, bio, sector, location, phone, reputation_score, consent_marketing, updated_at')
        .single();

      if (error) {
        logger.error('Failed to update profile', { userId, error });
        return res.status(500).json({ success: false, error: 'Failed to update profile' });
      }

      // Audit log (best-effort, non-blocking)
      setImmediate(async () => {
        try {
          await supabaseAdmin.rpc('create_audit_log', {
            p_user_id: userId,
            p_event_type: 'profile_update',
            p_resource_type: 'profiles',
            p_resource_id: userId,
            p_details: { updated_fields: Object.keys(payload).filter(k => k !== 'updated_at') },
          });
        } catch (err) {
          logger.warn('Audit log failed for profile_update', { err });
        }
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Error updating profile', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/users/search
 * Search for users by name or email. Excludes users the caller has blocked
 * and users who have blocked the caller.
 */
router.get(
  '/search',
  authenticate,
  validateQuery(searchQuerySchema),
  async (req: AuthRequest, res) => {
    try {
      const query = String(req.query.q || '');
      const limit = Number(req.query.limit) || 10;
      const currentUserId = req.user!.id;

      // Collect IDs to exclude: users I blocked + users who blocked me
      const [{ data: iBlocked }, { data: blockedMe }] = await Promise.all([
        supabaseAdmin.from('user_blocks').select('blocked_id').eq('blocker_id', currentUserId),
        supabaseAdmin.from('user_blocks').select('blocker_id').eq('blocked_id', currentUserId),
      ]);
      const excludeIds = [
        currentUserId,
        ...(iBlocked  ?? []).map((r: any) => r.blocked_id),
        ...(blockedMe ?? []).map((r: any) => r.blocker_id),
      ];

      let dbQuery = supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, avatar_url, role, company, sector')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .not('id', 'in', `(${excludeIds.join(',')})`)
        .eq('archived', false)
        .limit(limit);

      const { data: users, error } = await dbQuery;

      if (error) {
        logger.error('Failed to search users', { error });
        return res.status(500).json({ success: false, error: 'Failed to search users' });
      }

      res.json({ success: true, data: users || [] });
    } catch (error) {
      logger.error('Error searching users', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/users/leaderboard
 * Top N users ranked by reputation_score.
 * Must appear BEFORE /:id to avoid route-param capture.
 */
router.get(
  '/leaderboard',
  authenticate,
  validateQuery(leaderboardQuerySchema),
  async (req: AuthRequest, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url, role, company, sector, reputation_score, verified')
        .eq('archived', false)
        .order('reputation_score', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to fetch leaderboard', { error });
        return res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
      }

      const ranked = (data ?? []).map((user, index) => ({ rank: index + 1, ...user }));
      res.json({ success: true, data: ranked });
    } catch (error) {
      logger.error('Leaderboard error', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/users/blocked
 * List all users the caller has blocked.
 * Must appear BEFORE /:id to avoid being caught by the param route.
 */
router.get('/blocked', authenticate, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_blocks')
      .select(`
        id,
        created_at,
        blocked:blocked_id (id, email, full_name, avatar_url, role, company)
      `)
      .eq('blocker_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch blocked users', { error });
      return res.status(500).json({ success: false, error: 'Failed to fetch blocked users' });
    }

    res.json({ success: true, data: (data ?? []).map((r: any) => ({ ...r.blocked, blocked_at: r.created_at })) });
  } catch (error) {
    logger.error('Error fetching blocked users', { error });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/users/:id
 * Get a user's public profile. Returns is_blocked=true if the caller has blocked them.
 */
router.get(
  '/:id',
  authenticate,
  validateParams(idParamSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user!.id;

      const [{ data: user, error }, { data: blockRow }] = await Promise.all([
        supabaseAdmin
          .from('profiles')
          .select('id, email, full_name, avatar_url, role, company, bio, sector, location, phone, reputation_score, verified, created_at')
          .eq('id', id)
          .eq('archived', false)
          .single(),
        supabaseAdmin
          .from('user_blocks')
          .select('id')
          .eq('blocker_id', currentUserId)
          .eq('blocked_id', id)
          .maybeSingle(),
      ]);

      if (error || !user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      res.json({ success: true, data: { ...user, is_blocked: !!blockRow } });
    } catch (error) {
      logger.error('Error fetching user', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/users/:id/reputation
 * Public reputation history — forum votes cast on this user's content.
 * Shows a chronological record of upvotes/downvotes with context.
 * Must appear BEFORE /:id/block to be matched correctly.
 */
router.get(
  '/:id/reputation',
  authenticate,
  validateParams(idParamSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      // Confirm user exists
      const { data: profile, error: profErr } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url, reputation_score')
        .eq('id', id)
        .eq('archived', false)
        .single();

      if (profErr || !profile) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Fetch votes on their forum posts (most recent first)
      const { data: postVotes } = await supabaseAdmin
        .from('forum_votes')
        .select(`
          id, vote_value, created_at,
          post:post_id (id, content, thread_id),
          voter:user_id (id, full_name, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(50)
        .not('post_id', 'is', null);

      // Fetch votes on their forum threads (most recent first)
      const { data: threadVotes } = await supabaseAdmin
        .from('forum_votes')
        .select(`
          id, vote_value, created_at,
          thread:thread_id (id, title),
          voter:user_id (id, full_name, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(50)
        .not('thread_id', 'is', null);

      // Filter to only votes on content authored by this user
      const authoredPostIds = new Set<string>();
      const authoredThreadIds = new Set<string>();

      const { data: authoredPosts } = await supabaseAdmin
        .from('forum_posts')
        .select('id')
        .eq('author_id', id);
      (authoredPosts ?? []).forEach((p: any) => authoredPostIds.add(p.id));

      const { data: authoredThreads } = await supabaseAdmin
        .from('forum_threads')
        .select('id')
        .eq('author_id', id);
      (authoredThreads ?? []).forEach((t: any) => authoredThreadIds.add(t.id));

      const history = [
        ...(postVotes ?? [])
          .filter((v: any) => v.post_id && authoredPostIds.has(v.post_id))
          .map((v: any) => ({
            id:         v.id,
            type:       'post' as const,
            vote_value: v.vote_value,
            delta:      v.vote_value === 1 ? +5 : -2,
            content_id: v.post_id,
            excerpt:    (v.post as any)?.content?.slice(0, 100) ?? null,
            link:       `/forum/threads/${(v.post as any)?.thread_id}`,
            voter:      v.voter,
            created_at: v.created_at,
          })),
        ...(threadVotes ?? [])
          .filter((v: any) => v.thread_id && authoredThreadIds.has(v.thread_id))
          .map((v: any) => ({
            id:         v.id,
            type:       'thread' as const,
            vote_value: v.vote_value,
            delta:      v.vote_value === 1 ? +5 : -2,
            content_id: v.thread_id,
            excerpt:    (v.thread as any)?.title ?? null,
            link:       `/forum/threads/${v.thread_id}`,
            voter:      v.voter,
            created_at: v.created_at,
          })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
       .slice(0, 50);

      res.json({
        success: true,
        data: {
          user: profile,
          reputation_score: (profile as any).reputation_score,
          history,
        },
      });
    } catch (error) {
      logger.error('Reputation history error', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/users/:id/block
 * Block a user. Prevents them from messaging the caller and hides them in search.
 */
router.post(
  '/:id/block',
  authenticate,
  validateParams(idParamSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id: targetId } = req.params;
      const blockerId = req.user!.id;

      if (targetId === blockerId) {
        return res.status(400).json({ success: false, error: 'You cannot block yourself' });
      }

      // Confirm target user exists
      const { data: target, error: targetErr } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', targetId)
        .single();

      if (targetErr || !target) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const { error } = await supabaseAdmin
        .from('user_blocks')
        .upsert({ blocker_id: blockerId, blocked_id: targetId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });

      if (error) {
        logger.error('Failed to block user', { error });
        return res.status(500).json({ success: false, error: 'Failed to block user' });
      }

      // Also remove any existing conversation participants so they can't send DMs
      // (best-effort — the RLS check in chat routes is the enforcement layer)
      setImmediate(async () => {
        try {
          // Find direct conversations between the two users
          const { data: convs } = await supabaseAdmin
            .from('conversations')
            .select('id')
            .eq('type', 'direct')
            .or(`created_by.eq.${blockerId},created_by.eq.${targetId}`);

          if (convs?.length) {
            const convIds = convs.map((c: any) => c.id);
            // Soft-leave: set left_at for the blocked user in those convs
            await supabaseAdmin
              .from('conversation_participants')
              .update({ left_at: new Date().toISOString() })
              .in('conversation_id', convIds)
              .eq('user_id', targetId)
              .is('left_at', null);
          }
        } catch { /* non-fatal */ }
      });

      res.json({ success: true, data: { blocked: true } });
    } catch (error) {
      logger.error('Error blocking user', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/users/:id/block
 * Unblock a user.
 */
router.delete(
  '/:id/block',
  authenticate,
  validateParams(idParamSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id: targetId } = req.params;
      const blockerId = req.user!.id;

      const { error } = await supabaseAdmin
        .from('user_blocks')
        .delete()
        .eq('blocker_id', blockerId)
        .eq('blocked_id', targetId);

      if (error) {
        logger.error('Failed to unblock user', { error });
        return res.status(500).json({ success: false, error: 'Failed to unblock user' });
      }

      res.json({ success: true, data: { blocked: false } });
    } catch (error) {
      logger.error('Error unblocking user', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
