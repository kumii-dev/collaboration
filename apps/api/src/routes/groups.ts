import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, requireModerator, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import logger from '../logger.js';
import { sanitizeContent, containsProfanity, extractMentions } from '../utils/helpers.js';
import { runAIModeration } from '../services/moderation.js';
import { sendMentionEmail } from '../services/email.js';

const router = Router();

// ── Schemas ───────────────────────────────────────────────────────────────────

const createGroupSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  avatar_url:  z.string().url().optional().or(z.literal('')),
  max_members: z.number().int().min(2).max(500).optional().default(100),
});

const updateGroupSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  avatar_url:  z.string().url().optional().or(z.literal('')),
  max_members: z.number().int().min(2).max(500).optional(),
  is_locked:   z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

const idSchema       = z.object({ id: z.string().uuid() });
const memberIdSchema = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'moderator', 'member']),
});

const listQuerySchema = z.object({
  limit:  z.string().optional().transform(v => v ? parseInt(v) : 20),
  offset: z.string().optional().transform(v => v ? parseInt(v) : 0),
  q:      z.string().max(100).optional(),
});

const sendGroupMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

const groupMessagesQuerySchema = z.object({
  limit:  z.string().optional().transform(v => Math.min(Number(v) || 50, 100)),
  before: z.string().uuid().optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns the caller's role in a group, or null if not a member */
async function getCallerRole(groupId: string, userId: string): Promise<'owner' | 'moderator' | 'member' | null> {
  const { data } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();
  return (data?.role ?? null) as 'owner' | 'moderator' | 'member' | null;
}

/**
 * Lazily create (or retrieve) the group conversation.
 * Also ensures the requesting user is a conversation participant.
 */
async function getOrCreateGroupConversation(groupId: string, callerId: string): Promise<string> {
  // 1. Check for existing linked conversation
  const { data: grp } = await supabaseAdmin
    .from('groups')
    .select('id, name, conversation_id')
    .eq('id', groupId)
    .single();

  if (!grp) throw new Error('Group not found');

  if (grp.conversation_id) {
    // Ensure caller is a participant (upsert is idempotent)
    await supabaseAdmin
      .from('conversation_participants')
      .upsert({ conversation_id: grp.conversation_id, user_id: callerId }, { onConflict: 'conversation_id,user_id' });
    return grp.conversation_id;
  }

  // 2. Create a new group conversation
  const { data: conv, error: convErr } = await supabaseAdmin
    .from('conversations')
    .insert({ type: 'group', name: `group:${groupId}`, created_by: callerId })
    .select('id')
    .single();

  if (convErr || !conv) throw new Error('Failed to create group conversation');

  // 3. Link conversation back to the group
  await supabaseAdmin
    .from('groups')
    .update({ conversation_id: conv.id })
    .eq('id', groupId);

  // 4. Sync ALL current members as conversation participants
  const { data: members } = await supabaseAdmin
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId);

  if (members && members.length > 0) {
    await supabaseAdmin
      .from('conversation_participants')
      .upsert(
        members.map((m: any) => ({ conversation_id: conv.id, user_id: m.user_id })),
        { onConflict: 'conversation_id,user_id' }
      );
  }

  return conv.id;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/groups
 * List groups the caller belongs to, plus public groups they haven't joined.
 */
router.get('/', authenticate, validateQuery(listQuerySchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const limit  = Number(req.query.limit)  || 20;
    const offset = Number(req.query.offset) || 0;
    const q      = req.query.q as string | undefined;

    // Groups I'm a member of
    let query = supabaseAdmin
      .from('groups')
      .select(`
        id, name, description, avatar_url, is_locked, max_members, created_at, updated_at,
        created_by,
        creator:created_by (id, full_name, avatar_url),
        group_members (id, user_id, role)
      `)
      .eq('archived', false)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    const groups = (data ?? []).map((g: any) => {
      const members: any[] = g.group_members ?? [];
      const myMembership = members.find((m: any) => m.user_id === userId);
      return {
        ...g,
        member_count:    members.length,
        my_role:         myMembership?.role ?? null,
        is_member:       !!myMembership,
        group_members:   undefined,
      };
    });

    res.json({ success: true, data: groups });
  } catch (err: any) {
    logger.error('GET /groups', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/groups
 * Create a new group. Creator is automatically added as owner.
 */
router.post('/', authenticate, validateBody(createGroupSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const body   = req.body as z.infer<typeof createGroupSchema>;

    const { data: group, error: groupErr } = await supabaseAdmin
      .from('groups')
      .insert({ ...body, created_by: userId })
      .select('id, name, description, avatar_url, is_locked, max_members, created_at, created_by')
      .single();

    if (groupErr) throw groupErr;

    // Auto-add creator as owner
    await supabaseAdmin
      .from('group_members')
      .insert({ group_id: group.id, user_id: userId, role: 'owner' });

    res.status(201).json({
      success: true,
      data: { ...group, member_count: 1, my_role: 'owner', is_member: true },
    });
  } catch (err: any) {
    logger.error('POST /groups', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/groups/:id
 * Get a single group with members list.
 */
router.get('/:id', authenticate, validateParams(idSchema), async (req: AuthRequest, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('groups')
      .select(`
        id, name, description, avatar_url, is_locked, max_members, created_at, updated_at, created_by,
        creator:created_by (id, full_name, avatar_url),
        group_members (
          id, role, joined_at, muted,
          user:user_id (id, full_name, avatar_url, role, company)
        )
      `)
      .eq('id', id)
      .eq('archived', false)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const members: any[] = (data as any).group_members ?? [];
    const myMembership   = members.find((m: any) => m.user?.id === userId);

    res.json({
      success: true,
      data: {
        ...data,
        members:     members.map((m: any) => ({ ...m.user, member_role: m.role, joined_at: m.joined_at, muted: m.muted })),
        member_count: members.length,
        my_role:      myMembership?.role ?? null,
        is_member:    !!myMembership,
        group_members: undefined,
      },
    });
  } catch (err: any) {
    logger.error('GET /groups/:id', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/groups/:id
 * Update group settings. Only owners and group moderators (or site mods) may update.
 */
router.patch('/:id', authenticate, validateParams(idSchema), validateBody(updateGroupSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const role   = req.user!.role;

    const callerRole = await getCallerRole(id, userId);
    const isSiteMod  = role === 'moderator' || role === 'admin';

    if (!isSiteMod && callerRole !== 'owner' && callerRole !== 'moderator') {
      return res.status(403).json({ success: false, error: 'Only group owners or moderators can update this group' });
    }

    const { data, error } = await supabaseAdmin
      .from('groups')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name, description, avatar_url, is_locked, max_members, updated_at')
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err: any) {
    logger.error('PATCH /groups/:id', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/groups/:id
 * Soft-archive a group. Only owners or site admins may do this.
 */
router.delete('/:id', authenticate, validateParams(idSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const role   = req.user!.role;

    const callerRole = await getCallerRole(id, userId);
    const isSiteAdmin = role === 'admin';

    if (!isSiteAdmin && callerRole !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only the group owner can delete this group' });
    }

    const { error } = await supabaseAdmin
      .from('groups')
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err: any) {
    logger.error('DELETE /groups/:id', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/groups/:id/join
 * Join a group (adds caller as member role).
 */
router.post('/:id/join', authenticate, validateParams(idSchema), async (req: AuthRequest, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user!.id;

    const { data: group, error: groupErr } = await supabaseAdmin
      .from('groups')
      .select('id, is_locked, max_members')
      .eq('id', id)
      .eq('archived', false)
      .single();

    if (groupErr || !group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    if (group.is_locked) {
      return res.status(403).json({ success: false, error: 'This group is locked — you must be invited' });
    }

    // Check capacity
    const { count } = await supabaseAdmin
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', id);

    if (group.max_members && count !== null && count >= group.max_members) {
      return res.status(400).json({ success: false, error: 'Group is at full capacity' });
    }

    const { error } = await supabaseAdmin
      .from('group_members')
      .upsert({ group_id: id, user_id: userId, role: 'member' }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });

    if (error) throw error;

    // If the group already has a conversation, add the new member to it
    setImmediate(async () => {
      try {
        const { data: grp } = await supabaseAdmin
          .from('groups')
          .select('conversation_id')
          .eq('id', id)
          .single();
        if (grp?.conversation_id) {
          await supabaseAdmin
            .from('conversation_participants')
            .upsert({ conversation_id: grp.conversation_id, user_id: userId }, { onConflict: 'conversation_id,user_id' });
        }
      } catch { /* non-fatal */ }
    });

    res.json({ success: true, data: { group_id: id, role: 'member' } });
  } catch (err: any) {
    logger.error('POST /groups/:id/join', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/groups/:id/leave
 * Leave a group. Owners cannot leave — they must transfer ownership or delete the group.
 */
router.delete('/:id/leave', authenticate, validateParams(idSchema), async (req: AuthRequest, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user!.id;

    const callerRole = await getCallerRole(id, userId);
    if (!callerRole) {
      return res.status(400).json({ success: false, error: 'You are not a member of this group' });
    }
    if (callerRole === 'owner') {
      return res.status(400).json({ success: false, error: 'Group owners cannot leave. Transfer ownership or delete the group first.' });
    }

    const { error } = await supabaseAdmin
      .from('group_members')
      .delete()
      .eq('group_id', id)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err: any) {
    logger.error('DELETE /groups/:id/leave', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/groups/:id/members/:userId
 * Invite a user to a group. Only owners/group-moderators may invite.
 */
router.post(
  '/:id/members/:userId',
  authenticate,
  validateParams(memberIdSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id, userId: targetId } = req.params;
      const callerId   = req.user!.id;
      const callerRole = await getCallerRole(id, callerId);

      if (callerRole !== 'owner' && callerRole !== 'moderator' && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Only owners or moderators can invite members' });
      }

      // Check group capacity
      const { data: group } = await supabaseAdmin
        .from('groups')
        .select('max_members')
        .eq('id', id)
        .single();

      const { count } = await supabaseAdmin
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', id);

      if (group?.max_members && count !== null && count >= group.max_members) {
        return res.status(400).json({ success: false, error: 'Group is at full capacity' });
      }

      const { error } = await supabaseAdmin
        .from('group_members')
        .upsert({ group_id: id, user_id: targetId, role: 'member' }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });

      if (error) throw error;

      // In-app notification for the invited user
      setImmediate(async () => {
        try {
          const { data: grp } = await supabaseAdmin.from('groups').select('name, conversation_id').eq('id', id).single();
          await supabaseAdmin.from('notifications').insert({
            user_id: targetId,
            type:    'system',
            title:   'You were added to a group',
            content: `You have been added to the group "${(grp as any)?.name ?? 'a group'}"`,
            link:    `/groups/${id}`,
          });
          // Sync the invited user into the group conversation if it exists
          if ((grp as any)?.conversation_id) {
            await supabaseAdmin
              .from('conversation_participants')
              .upsert({ conversation_id: (grp as any).conversation_id, user_id: targetId }, { onConflict: 'conversation_id,user_id' });
          }
        } catch { /* non-fatal */ }
      });

      res.json({ success: true, data: { group_id: id, user_id: targetId, role: 'member' } });
    } catch (err: any) {
      logger.error('POST /groups/:id/members/:userId', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * DELETE /api/groups/:id/members/:userId
 * Remove a member from a group. Owners can remove anyone; group-mods can remove members.
 */
router.delete(
  '/:id/members/:userId',
  authenticate,
  validateParams(memberIdSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id, userId: targetId } = req.params;
      const callerId   = req.user!.id;
      const callerRole = await getCallerRole(id, callerId);
      const targetRole = await getCallerRole(id, targetId);

      const isSiteAdmin = req.user!.role === 'admin';

      if (!isSiteAdmin && callerRole !== 'owner' && !(callerRole === 'moderator' && targetRole === 'member')) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions to remove this member' });
      }

      if (targetRole === 'owner' && !isSiteAdmin) {
        return res.status(403).json({ success: false, error: 'Cannot remove the group owner' });
      }

      const { error } = await supabaseAdmin
        .from('group_members')
        .delete()
        .eq('group_id', id)
        .eq('user_id', targetId);

      if (error) throw error;

      res.json({ success: true });
    } catch (err: any) {
      logger.error('DELETE /groups/:id/members/:userId', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * PATCH /api/groups/:id/members/:userId
 * Update a member's role. Only owners can promote/demote.
 */
router.patch(
  '/:id/members/:userId',
  authenticate,
  validateParams(memberIdSchema),
  validateBody(updateMemberRoleSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id, userId: targetId } = req.params;
      const callerId   = req.user!.id;
      const callerRole = await getCallerRole(id, callerId);
      const { role: newRole } = req.body as { role: 'owner' | 'moderator' | 'member' };

      if (callerRole !== 'owner' && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Only the group owner can change member roles' });
      }

      // If promoting to owner, demote the current owner first
      if (newRole === 'owner') {
        await supabaseAdmin
          .from('group_members')
          .update({ role: 'member' })
          .eq('group_id', id)
          .eq('user_id', callerId);
      }

      const { error } = await supabaseAdmin
        .from('group_members')
        .update({ role: newRole })
        .eq('group_id', id)
        .eq('user_id', targetId);

      if (error) throw error;

      // Audit log for role changes
      setImmediate(async () => {
        try {
          await supabaseAdmin.rpc('create_audit_log', {
            p_user_id:       callerId,
            p_event_type:    'role_change',
            p_resource_type: 'group_members',
            p_resource_id:   targetId,
            p_details:       { group_id: id, new_role: newRole },
          });
        } catch { /* non-fatal */ }
      });

      res.json({ success: true, data: { group_id: id, user_id: targetId, role: newRole } });
    } catch (err: any) {
      logger.error('PATCH /groups/:id/members/:userId', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Group Messaging ────────────────────────────────────────────────────────────

/**
 * GET /api/groups/:id/messages
 * Fetch messages for the group's linked conversation.
 * Only group members may read.
 */
router.get(
  '/:id/messages',
  authenticate,
  validateParams(idSchema),
  validateQuery(groupMessagesQuerySchema),
  async (req: AuthRequest, res) => {
    try {
      const { id }   = req.params;
      const userId   = req.user!.id;
      const limit    = Math.min(Number(req.query.limit) || 50, 100);
      const before   = req.query.before as string | undefined;

      // Must be a group member
      const callerRole = await getCallerRole(id, userId);
      if (!callerRole) {
        return res.status(403).json({ success: false, error: 'You are not a member of this group' });
      }

      const conversationId = await getOrCreateGroupConversation(id, userId);

      let query = supabaseAdmin
        .from('messages')
        .select(`
          id,
          content,
          edited,
          edited_at,
          created_at,
          sender:sender_id (id, full_name, avatar_url, role),
          message_reactions (id, emoji, user_id),
          message_reads (user_id, read_at),
          attachments (id, file_name, file_type, file_size, url)
        `)
        .eq('conversation_id', conversationId)
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (before) {
        const { data: beforeMsg } = await supabaseAdmin
          .from('messages')
          .select('created_at')
          .eq('id', before)
          .single();
        if (beforeMsg) {
          query = query.lt('created_at', (beforeMsg as any).created_at);
        }
      }

      const { data: messages, error } = await query;
      if (error) throw error;

      res.json({
        success: true,
        data: {
          messages:        (messages ?? []).reverse(),
          conversation_id: conversationId,
        },
      });
    } catch (err: any) {
      logger.error('GET /groups/:id/messages', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * POST /api/groups/:id/messages
 * Send a message to the group.
 * Only group members may post.
 */
router.post(
  '/:id/messages',
  authenticate,
  validateParams(idSchema),
  validateBody(sendGroupMessageSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id }    = req.params;
      const userId    = req.user!.id;
      const { content } = req.body as { content: string };

      // Must be a group member
      const callerRole = await getCallerRole(id, userId);
      if (!callerRole) {
        return res.status(403).json({ success: false, error: 'You are not a member of this group' });
      }

      // Profanity gate
      if (containsProfanity(content)) {
        return res.status(400).json({
          success: false,
          error: 'Your message contains inappropriate language. Please revise and resend.',
        });
      }

      const sanitized      = sanitizeContent(content);
      const conversationId = await getOrCreateGroupConversation(id, userId);

      const { data: message, error: msgErr } = await supabaseAdmin
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: userId, content: sanitized })
        .select(`
          id, content, created_at,
          sender:sender_id (id, full_name, avatar_url)
        `)
        .single();

      if (msgErr || !message) throw msgErr ?? new Error('Failed to insert message');

      // Update conversation last_message_at
      void supabaseAdmin
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      res.status(201).json({ success: true, data: { message, conversation_id: conversationId } });

      // Fire-and-forget: @mention notifications + AI moderation
      setImmediate(async () => {
        try {
          const mentions = extractMentions(content);
          if (mentions.length > 0) {
            const { data: mentionedUsers } = await supabaseAdmin
              .from('profiles')
              .select('id, email, full_name')
              .in('id', mentions);

            for (const user of mentionedUsers ?? []) {
              await supabaseAdmin.from('notifications').insert({
                user_id: user.id,
                type:    'mention',
                title:   `${req.user!.email} mentioned you in a group`,
                content: sanitized.substring(0, 200),
                link:    `/groups/${id}`,
              });
              await sendMentionEmail(
                user.email,
                req.user!.email,
                sanitized.substring(0, 200),
                `${process.env.CORS_ORIGIN}/groups/${id}`
              );
            }
          }
        } catch { /* non-fatal */ }
      });

      setImmediate(() =>
        runAIModeration({
          type:     'message',
          id:       (message as any).id,
          content:  sanitized,
          authorId: userId,
        }).catch(() => {})
      );
    } catch (err: any) {
      logger.error('POST /groups/:id/messages', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/groups/:id/activity
 * Recent activity feed for a group — member joins + recent messages.
 * Only group members may view.
 * Query params: limit (default 20, max 50)
 */
router.get(
  '/:id/activity',
  authenticate,
  validateParams(idSchema),
  validateQuery(z.object({ limit: z.coerce.number().min(1).max(50).default(20) })),
  async (req: AuthRequest, res) => {
    try {
      const { id }   = req.params;
      const userId   = req.user!.id;
      const limit    = Math.min(Number(req.query.limit) || 20, 50);

      // Must be a group member
      const callerRole = await getCallerRole(id, userId);
      if (!callerRole) {
        return res.status(403).json({ success: false, error: 'You are not a member of this group' });
      }

      const conversationId = await getOrCreateGroupConversation(id, userId);

      // Fetch recent messages and member joins in parallel
      const [messagesRes, joinsRes] = await Promise.all([
        supabaseAdmin
          .from('messages')
          .select(`
            id,
            content,
            created_at,
            sender:sender_id (id, full_name, avatar_url)
          `)
          .eq('conversation_id', conversationId)
          .eq('deleted', false)
          .order('created_at', { ascending: false })
          .limit(limit),

        supabaseAdmin
          .from('group_members')
          .select(`
            user_id,
            role,
            joined_at,
            member:user_id (id, full_name, avatar_url)
          `)
          .eq('group_id', id)
          .order('joined_at', { ascending: false })
          .limit(limit),
      ]);

      type ActivityItem = {
        id: string;
        type: 'message' | 'member_join';
        actor: unknown;
        description: string;
        created_at: string;
      };

      const items: ActivityItem[] = [];

      for (const msg of (messagesRes.data ?? [])) {
        items.push({
          id:          `msg-${msg.id}`,
          type:        'message',
          actor:       msg.sender,
          description: (msg.content as string)?.slice(0, 100) ?? '',
          created_at:  msg.created_at as string,
        });
      }

      for (const join of (joinsRes.data ?? [])) {
        items.push({
          id:          `join-${join.user_id}`,
          type:        'member_join',
          actor:       join.member,
          description: 'Joined the group',
          created_at:  join.joined_at as string,
        });
      }

      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      res.json({
        success: true,
        data: { activity: items.slice(0, limit) },
      });
    } catch (err: any) {
      logger.error('GET /groups/:id/activity', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
