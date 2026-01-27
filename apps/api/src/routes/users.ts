import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validation.js';
import logger from '../logger.js';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
});

/**
 * GET /api/users/search
 * Search for users by name or email
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

      // Search for users by name or email
      const { data: users, error } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, avatar_url, role, company')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .neq('id', currentUserId) // Exclude current user
        .limit(limit);

      if (error) {
        logger.error('Failed to search users', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to search users',
        });
      }

      res.json({
        success: true,
        data: users || [],
      });
    } catch (error) {
      logger.error('Error searching users', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/users/:id
 * Get user profile by ID
 */
router.get(
  '/:id',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const { data: user, error } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, avatar_url, role, company, bio, sector, location, reputation_score')
        .eq('id', id)
        .single();

      if (error || !user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      logger.error('Error fetching user', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

export default router;
