import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
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
  avatar_url: z.string().url().optional().or(z.literal('')),
  consent_marketing: z.boolean().optional(),
});

/**
 * GET /api/users/me
 * Get the authenticated user's own full profile
 */
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, avatar_url, role, company, bio, sector, location, reputation_score, consent_marketing, consent_data_processing, last_seen_at, created_at')
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
      if (updates.avatar_url !== undefined)        payload.avatar_url        = updates.avatar_url || null;
      if (updates.consent_marketing !== undefined) payload.consent_marketing = updates.consent_marketing;

      const { data: updated, error } = await supabaseAdmin
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select('id, email, full_name, avatar_url, role, company, bio, sector, location, reputation_score, consent_marketing, updated_at')
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
