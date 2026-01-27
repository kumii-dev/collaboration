import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../logger.js';

const router = Router();

/**
 * GET /api/notifications
 * Get user's notifications
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('Failed to fetch notifications', { error });
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch notifications',
      });
    }

    res.json({
      success: true,
      data: { notifications: data },
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

export default router;
