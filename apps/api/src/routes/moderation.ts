import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, requireModerator, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import logger from '../logger.js';

const router = Router();

const createReportSchema = z.object({
  reportType: z.enum(['message', 'post', 'user', 'group']),
  reportedUserId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  postId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  reason: z.string().min(10).max(1000),
});

const moderationActionSchema = z.object({
  reportId: z.string().uuid().optional(),
  targetUserId: z.string().uuid(),
  actionType: z.enum(['warn', 'remove_content', 'suspend', 'ban', 'restore']),
  reason: z.string().min(10).max(1000),
  durationDays: z.number().min(1).max(365).optional(),
});

/**
 * POST /api/moderation/reports
 * Create a report
 */
router.post(
  '/reports',
  authenticate,
  validateBody(createReportSchema),
  async (req: AuthRequest, res) => {
    try {
      const reportData = {
        ...req.body,
        reporter_id: req.user!.id,
        status: 'pending',
      };

      const { data: report, error } = await supabaseAdmin
        .from('reports')
        .insert(reportData)
        .select()
        .single();

      if (error) {
        logger.error('Failed to create report', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to create report',
        });
      }

      res.status(201).json({
        success: true,
        data: { report },
      });
    } catch (error) {
      logger.error('Create report error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/moderation/queue
 * Get pending reports (moderators only) — includes the actual flagged content
 * Query params: limit (default 20, max 100), offset (default 0)
 */
router.get(
  '/queue',
  authenticate,
  requireModerator,
  validateQuery(z.object({
    limit:  z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  })),
  async (req: AuthRequest, res) => {
  try {
    const limit  = Number(req.query.limit)  || 20;
    const offset = Number(req.query.offset) || 0;

    const { data, error, count } = await supabaseAdmin
      .from('reports')
      .select(`
        id,
        report_type,
        reason,
        status,
        created_at,
        thread_id,
        post_id,
        message_id,
        reporter:reporter_id (id, full_name, email),
        reported_user:reported_user_id (id, full_name, email)
      `, { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('Failed to fetch reports', { error });
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch reports',
      });
    }

    // Enrich each report with a content preview so reviewers can read
    // the flagged text without leaving the moderation queue
    const enriched = await Promise.all(
      (data ?? []).map(async (report) => {
        let contentPreview: string | null = null;
        let contentTitle: string | null = null;

        try {
          if (report.thread_id) {
            const { data: thread } = await supabaseAdmin
              .from('forum_threads')
              .select('title, content')
              .eq('id', report.thread_id)
              .single();
            if (thread) {
              contentTitle = thread.title as string;
              contentPreview = (thread.content as string)?.substring(0, 500) ?? null;
            }
          } else if (report.post_id) {
            const { data: post } = await supabaseAdmin
              .from('forum_posts')
              .select('content')
              .eq('id', report.post_id)
              .single();
            contentPreview = (post?.content as string)?.substring(0, 500) ?? null;
          } else if (report.message_id) {
            const { data: msg } = await supabaseAdmin
              .from('messages')
              .select('content')
              .eq('id', report.message_id)
              .single();
            contentPreview = (msg?.content as string)?.substring(0, 500) ?? null;
          }
        } catch {
          // Non-fatal — leave content_preview null
        }

        return { ...report, content_title: contentTitle, content_preview: contentPreview };
      })
    );

    res.json({
      success: true,
      data: { reports: enriched, total: count ?? 0, limit, offset },
    });
  } catch (error) {
    logger.error('Get queue error', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/moderation/actions
 * Take moderation action (moderators only)
 */
router.post(
  '/actions',
  authenticate,
  requireModerator,
  validateBody(moderationActionSchema),
  async (req: AuthRequest, res) => {
    try {
      const { reportId, targetUserId, actionType, reason, durationDays } = req.body;

      const expiresAt = durationDays
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data: action, error } = await supabaseAdmin
        .from('moderation_actions')
        .insert({
          moderator_id: req.user!.id,
          target_user_id: targetUserId,
          action_type: actionType,
          report_id: reportId ?? null,
          reason,
          duration_days: durationDays ?? null,
          expires_at: expiresAt,
          metadata: {
            source: 'moderator_action',
            report_id: reportId ?? null,
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create moderation action', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to create moderation action',
        });
      }

      // Update report status if provided
      if (reportId) {
        await supabaseAdmin
          .from('reports')
          .update({
            status: 'resolved',
            reviewed_by: req.user!.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', reportId);
      }

      // Create audit log
      await supabaseAdmin.rpc('create_audit_log', {
        p_user_id: req.user!.id,
        p_event_type: 'moderation_action',
        p_resource_type: 'moderation_actions',
        p_resource_id: action.id,
        p_details: { actionType, targetUserId, reason },
      });

      res.status(201).json({
        success: true,
        data: { action },
      });
    } catch (error) {
      logger.error('Moderation action error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PATCH /api/moderation/reports/:id/resolve
 * Dismiss / resolve a report without a formal moderation action (moderators only)
 */
router.patch(
  '/reports/:id/resolve',
  authenticate,
  requireModerator,
  validateParams(z.object({ id: z.string().uuid() })),
  validateBody(z.object({ notes: z.string().max(1000).optional() })),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const { data: report, error } = await supabaseAdmin
        .from('reports')
        .update({
          status: 'resolved',
          reviewed_by: req.user!.id,
          reviewed_at: new Date().toISOString(),
          ...(notes ? { notes } : {}),
        })
        .eq('id', id)
        .select('id, status, reviewed_at')
        .single();

      if (error || !report) {
        logger.error('Failed to resolve report', { error });
        return res.status(404).json({
          success: false,
          error: 'Report not found or could not be updated',
        });
      }

      // Audit log (best-effort)
      try {
        await supabaseAdmin.rpc('create_audit_log', {
          p_user_id: req.user!.id,
          p_event_type: 'moderation_action',
          p_resource_type: 'reports',
          p_resource_id: id,
          p_details: { action: 'resolve', notes: notes ?? null },
        });
      } catch {
        // Non-fatal
      }

      res.json({
        success: true,
        data: { report },
      });
    } catch (error) {
      logger.error('Resolve report error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PATCH /api/moderation/reports/:id/dismiss
 * Dismiss a report (no action taken) — moderators only
 */
router.patch(
  '/reports/:id/dismiss',
  authenticate,
  requireModerator,
  validateParams(z.object({ id: z.string().uuid() })),
  validateBody(z.object({ notes: z.string().max(1000).optional() })),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const { data: report, error } = await supabaseAdmin
        .from('reports')
        .update({
          status: 'dismissed',
          reviewed_by: req.user!.id,
          reviewed_at: new Date().toISOString(),
          ...(notes ? { notes } : {}),
        })
        .eq('id', id)
        .select('id, status, reviewed_at')
        .single();

      if (error || !report) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }

      setImmediate(async () => {
        try {
          await supabaseAdmin.rpc('create_audit_log', {
            p_user_id: req.user!.id,
            p_event_type: 'moderation_action',
            p_resource_type: 'reports',
            p_resource_id: id,
            p_details: { action: 'dismiss', notes: notes ?? null },
          });
        } catch { /* non-fatal */ }
      });

      res.json({ success: true, data: { report } });
    } catch (error) {
      logger.error('Dismiss report error', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/moderation/reports
 * List all reports with optional status filter (moderators only)
 * Query params:
 *   status  = pending | resolved | dismissed (default: all)
 *   limit   = 1-100 (default 20)
 *   offset  = 0+ (default 0)
 */
router.get(
  '/reports',
  authenticate,
  requireModerator,
  validateQuery(z.object({
    status: z.enum(['pending', 'resolved', 'dismissed']).optional(),
    limit:  z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  })),
  async (req: AuthRequest, res) => {
    try {
      const limit  = Number(req.query.limit)  || 20;
      const offset = Number(req.query.offset) || 0;

      let query = supabaseAdmin
        .from('reports')
        .select(`
          id,
          report_type,
          reason,
          status,
          notes,
          created_at,
          reviewed_at,
          thread_id,
          post_id,
          message_id,
          reporter:reporter_id (id, full_name, email),
          reported_user:reported_user_id (id, full_name, email),
          reviewer:reviewed_by (id, full_name)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (req.query.status) {
        query = query.eq('status', req.query.status as string);
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error('Failed to fetch reports', { error });
        return res.status(500).json({ success: false, error: 'Failed to fetch reports' });
      }

      res.json({ success: true, data: { reports: data ?? [], total: count ?? 0, limit, offset } });
    } catch (error) {
      logger.error('Get reports error', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
