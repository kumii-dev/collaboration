/**
 * Admin routes — restricted to role = 'admin'
 *
 * GET  /api/admin/users                 — paginated user list with optional role filter
 * PATCH /api/admin/users/:id/role       — change a user's role (with audit log)
 * GET  /api/admin/audit-logs            — paginated audit log with optional filters
 * GET  /api/admin/stats                 — platform-wide aggregate stats
 */

import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import logger from '../logger.js';

const router = Router();

// All admin routes require admin role
router.use(authenticate, requireAdmin);

// ── Schemas ───────────────────────────────────────────────────────────────────

const userListQuerySchema = z.object({
  role:    z.enum(['entrepreneur', 'funder', 'advisor', 'moderator', 'admin']).optional(),
  search:  z.string().max(100).optional(),
  limit:   z.string().optional().transform(v => Math.min(Number(v) || 20, 100)),
  offset:  z.string().optional().transform(v => Number(v) || 0),
});

const roleUpdateSchema = z.object({
  role: z.enum(['entrepreneur', 'funder', 'advisor', 'moderator', 'admin']),
});

const auditLogQuerySchema = z.object({
  user_id:    z.string().uuid().optional(),
  event_type: z.enum(['login', 'logout', 'role_change', 'data_access', 'moderation_action', 'profile_update', 'content_delete']).optional(),
  limit:      z.string().optional().transform(v => Math.min(Number(v) || 50, 200)),
  offset:     z.string().optional().transform(v => Number(v) || 0),
});

const userIdParamSchema = z.object({ id: z.string().uuid() });

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * List all users with optional role filter and text search.
 */
router.get(
  '/users',
  validateQuery(userListQuerySchema),
  async (req: AuthRequest, res) => {
    try {
      const limit  = Math.min(Number(req.query.limit)  || 20, 100);
      const offset = Number(req.query.offset) || 0;
      const role   = req.query.role   as string | undefined;
      const search = req.query.search as string | undefined;

      let query = supabaseAdmin
        .from('profiles')
        .select(
          'id, email, full_name, role, verified, sector, company, bio, avatar_url, phone, reputation_score, last_seen_at, created_at, archived',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (role) query = query.eq('role', role);
      if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      res.json({
        success: true,
        data: { users: data ?? [], total: count ?? 0, limit, offset },
      });
    } catch (err: any) {
      logger.error('GET /admin/users', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/admin/users/:id
 * Full profile detail for a single user, including moderation history and recent audit events.
 */
router.get(
  '/users/:id',
  validateParams(userIdParamSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const [profileRes, moderationRes, auditRes] = await Promise.all([
        // Full profile
        supabaseAdmin
          .from('profiles')
          .select(
            'id, email, full_name, role, verified, sector, company, bio, avatar_url, ' +
            'phone, reputation_score, location, last_seen_at, created_at, updated_at, archived, ' +
            'consent_marketing, consent_data_processing'
          )
          .eq('id', id)
          .single(),

        // Moderation history (actions taken against this user)
        supabaseAdmin
          .from('moderation_actions')
          .select(`
            id, action_type, reason, metadata, created_at, expires_at,
            moderator:moderator_id (id, email, full_name)
          `)
          .eq('target_user_id', id)
          .order('created_at', { ascending: false })
          .limit(20),

        // Recent audit events (actions the user performed)
        supabaseAdmin
          .from('audit_logs')
          .select('id, event_type, resource_type, resource_id, details, created_at')
          .eq('user_id', id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (profileRes.error || !profileRes.data) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Determine active moderation status
      const now = new Date().toISOString();
      const activeAction = (moderationRes.data ?? []).find(
        (a: any) => ['suspend', 'ban'].includes(a.action_type) &&
          (!a.expires_at || a.expires_at > now)
      );

      res.json({
        success: true,
        data: {
          profile:           profileRes.data,
          is_suspended:      activeAction?.action_type === 'suspend',
          is_banned:         activeAction?.action_type === 'ban',
          active_action:     activeAction ?? null,
          moderation_history: moderationRes.data ?? [],
          recent_activity:   auditRes.data ?? [],
        },
      });
    } catch (err: any) {
      logger.error('GET /admin/users/:id', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * PATCH /api/admin/users/:id/role
 * Change a user's role. Records a role_change audit event.
 */
router.patch(
  '/users/:id/role',
  validateParams(userIdParamSchema),
  validateBody(roleUpdateSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id }       = req.params;
      const { role }     = req.body as { role: string };
      const adminId      = req.user!.id;

      // Fetch previous role for audit context
      const { data: profile, error: fetchErr } = await supabaseAdmin
        .from('profiles')
        .select('role, full_name, email')
        .eq('id', id)
        .single();

      if (fetchErr || !profile) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, email, full_name, role')
        .single();

      if (updateErr) throw updateErr;

      // Audit log (fire-and-forget)
      setImmediate(async () => {
        try {
          await supabaseAdmin.rpc('create_audit_log', {
            p_user_id:       adminId,
            p_event_type:    'role_change',
            p_resource_type: 'profiles',
            p_resource_id:   id,
            p_details:       {
              previous_role: (profile as any).role,
              new_role:      role,
              target_email:  (profile as any).email,
            },
          });
        } catch { /* non-fatal */ }
      });

      res.json({ success: true, data: updated });
    } catch (err: any) {
      logger.error('PATCH /admin/users/:id/role', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/admin/audit-logs
 * Paginated audit log. Can filter by user_id and/or event_type.
 */
router.get(
  '/audit-logs',
  validateQuery(auditLogQuerySchema),
  async (req: AuthRequest, res) => {
    try {
      const limit      = Math.min(Number(req.query.limit)  || 50, 200);
      const offset     = Number(req.query.offset) || 0;
      const userId     = req.query.user_id    as string | undefined;
      const eventType  = req.query.event_type as string | undefined;

      let query = supabaseAdmin
        .from('audit_logs')
        .select(
          `id, event_type, resource_type, resource_id, details, created_at,
           user:user_id (id, email, full_name, role)`,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (userId)    query = query.eq('user_id',    userId);
      if (eventType) query = query.eq('event_type', eventType);

      const { data, error, count } = await query;

      if (error) throw error;

      res.json({
        success: true,
        data: { logs: data ?? [], total: count ?? 0, limit, offset },
      });
    } catch (err: any) {
      logger.error('GET /admin/audit-logs', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/admin/stats
 * Platform-wide aggregate counts: users, groups, threads, posts, messages, reports.
 */
router.get('/stats', async (_req: AuthRequest, res) => {
  try {
    const [
      usersResult,
      groupsResult,
      threadsResult,
      postsResult,
      messagesResult,
      openReportsResult,
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('groups').select('*', { count: 'exact', head: true }).eq('archived', false),
      supabaseAdmin.from('forum_threads').select('*', { count: 'exact', head: true }).eq('deleted', false),
      supabaseAdmin.from('forum_posts').select('*', { count: 'exact', head: true }).eq('deleted', false),
      supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('deleted', false),
      supabaseAdmin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    ]);

    res.json({
      success: true,
      data: {
        users:        usersResult.count  ?? 0,
        groups:       groupsResult.count ?? 0,
        threads:      threadsResult.count ?? 0,
        posts:        postsResult.count  ?? 0,
        messages:     messagesResult.count ?? 0,
        open_reports: openReportsResult.count ?? 0,
      },
    });
  } catch (err: any) {
    logger.error('GET /admin/stats', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
