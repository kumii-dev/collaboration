import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, requireModerator, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validation.js';
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
 * Get pending reports (moderators only)
 */
router.get('/queue', authenticate, requireModerator, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('reports')
      .select(`
        id,
        report_type,
        reason,
        status,
        created_at,
        reporter:reporter_id (id, full_name, email),
        reported_user:reported_user_id (id, full_name, email)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch reports', { error });
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch reports',
      });
    }

    res.json({
      success: true,
      data: { reports: data },
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
          report_id: reportId,
          reason,
          duration_days: durationDays,
          expires_at: expiresAt,
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

export default router;
