import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validation.js';
import logger from '../logger.js';

const router = Router();

/**
 * GET /api/notifications/unread-count
 * Get the count of unread notifications for the authenticated user (for badge indicators)
 */
router.get('/unread-count', authenticate, async (req: AuthRequest, res) => {
  try {
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user!.id)
      .eq('read', false);

    if (error) {
      logger.error('Failed to fetch unread count', { error });
      return res.status(500).json({ success: false, error: 'Failed to fetch unread count' });
    }

    res.json({ success: true, data: { unread_count: count ?? 0 } });
  } catch (error) {
    logger.error('Unread count error', { error });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/notifications
 * Get user's notifications. Optional query params:
 *   ?type=mention|reply|message|moderation|system  — filter by type
 *   ?unread=true                                    — only unread
 *   ?limit=50&offset=0                              — pagination
 */
router.get(
  '/',
  authenticate,
  validateQuery(z.object({
    type:   z.enum(['mention', 'reply', 'message', 'moderation', 'system']).optional(),
    unread: z.enum(['true', 'false']).optional(),
    limit:  z.string().optional().transform(v => Math.min(Number(v) || 50, 100)),
    offset: z.string().optional().transform(v => Number(v) || 0),
  })),
  async (req: AuthRequest, res) => {
  try {
    const type   = req.query.type   as string | undefined;
    const unread = req.query.unread as string | undefined;
    const limit  = Math.min(Number(req.query.limit)  || 50, 100);
    const offset = Number(req.query.offset) || 0;

    let query = supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user!.id)
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type)             query = query.eq('type', type);
    if (unread === 'true') query = query.eq('read', false);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch notifications', { error });
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch notifications',
      });
    }

    res.json({
      success: true,
      data: { notifications: data ?? [], total: count ?? 0, limit, offset },
    });
  } catch (error) {
    logger.error('Get notifications error', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark notification as read
 */
router.patch('/:id/read', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', req.user!.id);

    if (error) {
      logger.error('Failed to mark notification as read', { error });
      return res.status(500).json({
        success: false,
        error: 'Failed to update notification',
      });
    }

    res.json({
      success: true,
      data: { message: 'Notification marked as read' },
    });
  } catch (error) {
    logger.error('Mark read error', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read
 */
router.post('/mark-all-read', authenticate, async (req: AuthRequest, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .eq('user_id', req.user!.id)
      .eq('read', false);

    if (error) {
      logger.error('Failed to mark all notifications as read', { error });
      return res.status(500).json({
        success: false,
        error: 'Failed to update notifications',
      });
    }

    res.json({
      success: true,
      data: { message: 'All notifications marked as read' },
    });
  } catch (error) {
    logger.error('Mark all read error', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Archive (soft-delete) a notification.
 * Sets archived = true so it no longer appears in the default list.
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ archived: true })
      .eq('id', id)
      .eq('user_id', req.user!.id);

    if (error) {
      logger.error('Failed to archive notification', { error });
      return res.status(500).json({ success: false, error: 'Failed to archive notification' });
    }

    res.json({ success: true, data: { message: 'Notification archived' } });
  } catch (error) {
    logger.error('Archive notification error', { error });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
