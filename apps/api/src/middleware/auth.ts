import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Middleware to authenticate requests using Supabase JWT.
 * Also enforces active suspension/ban from moderation_actions.
 */
export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify JWT with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      logger.warn('Authentication failed', { error: error?.message });
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
      return;
    }

    // Fetch user profile with role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      logger.error('Failed to fetch user profile', { userId: user.id, error: profileError });
      res.status(403).json({
        success: false,
        error: 'User profile not found',
      });
      return;
    }

    // ── Suspension / ban enforcement ─────────────────────────────────────────
    // Check for any active suspend or ban that has not yet expired.
    // Admins and moderators are exempt from enforcement.
    if (profile.role !== 'admin' && profile.role !== 'moderator') {
      const now = new Date().toISOString();
      const { data: activeAction } = await supabaseAdmin
        .from('moderation_actions')
        .select('action_type, expires_at, reason')
        .eq('target_user_id', user.id)
        .in('action_type', ['suspend', 'ban'])
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeAction) {
        const isBan     = activeAction.action_type === 'ban';
        const expiresAt = activeAction.expires_at
          ? ` until ${new Date(activeAction.expires_at).toUTCString()}`
          : ' permanently';

        logger.warn('Blocked request from suspended/banned user', { userId: user.id, action: activeAction.action_type });
        res.status(403).json({
          success: false,
          error: isBan
            ? `Your account has been banned${expiresAt}. Reason: ${activeAction.reason}`
            : `Your account is suspended${expiresAt}. Reason: ${activeAction.reason}`,
          code: isBan ? 'account_banned' : 'account_suspended',
        });
        return;
      }
    }

    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
    };

    next();
  } catch (error) {
    logger.error('Authentication middleware error', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

/**
 * Middleware to check if user has required role
 */
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Access denied - insufficient role', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
      });
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to allow moderators and admins
 */
export const requireModerator = requireRole('moderator', 'admin');

/**
 * Middleware to allow only admins
 */
export const requireAdmin = requireRole('admin');
