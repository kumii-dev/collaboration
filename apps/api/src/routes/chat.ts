import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.js';
import logger from '../logger.js';
import { sanitizeContent, extractMentions, containsProfanity } from '../utils/helpers.js';
import { sendMentionEmail } from '../services/email.js';
import { runAIModeration } from '../services/moderation.js';

const router = Router();

// Validation schemas
const createConversationSchema = z.object({
  participantIds: z.array(z.string().uuid()).min(1),
  type: z.enum(['direct', 'group']).default('direct'),
  name: z.string().optional(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

const updateMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

const conversationQuerySchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
});

const messagesQuerySchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val) : 50),
  before: z.string().uuid().optional(),
});

const uuidParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * GET /api/chat/conversations
 * Get user's conversations
 */
router.get(
  '/conversations',
  authenticate,
  validateQuery(conversationQuerySchema),
  async (req: AuthRequest, res) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const offset = Number(req.query.offset) || 0;
      
      const { data, error, count } = await supabaseAdmin
        .from('conversation_participants')
        .select(`
          conversation_id,
          conversations (
            id,
            type,
            name,
            created_at,
            updated_at,
            last_message_at,
            conversation_participants!inner (
              user_id,
              profiles (
                id,
                full_name,
                avatar_url
              )
            )
          )
        `, { count: 'exact' })
        .eq('user_id', req.user!.id)
        .is('left_at', null)
        .order('last_message_at', { foreignTable: 'conversations', ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Failed to fetch conversations', { error, userId: req.user!.id });
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch conversations',
        });
      }

      res.json({
        success: true,
        data: {
          conversations: data,
          total: count,
          limit,
          offset,
        },
      });
    } catch (error) {
      logger.error('Get conversations error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/chat/conversations/community/:categoryId
 * Find or create the shared group conversation for a forum community.
 * Any authenticated user can join by calling this endpoint.
 */
router.get(
  '/conversations/community/:categoryId',
  authenticate,
  validateParams(z.object({ categoryId: z.string().uuid() })),
  async (req: AuthRequest, res) => {
    try {
      const { categoryId } = req.params;
      const userId = req.user!.id;
      const communityName = `community:${categoryId}`;

      // Look for existing community conversation by name
      const { data: existing } = await supabaseAdmin
        .from('conversations')
        .select('id, name, type, created_at, last_message_at')
        .eq('name', communityName)
        .eq('type', 'group')
        .maybeSingle();

      let conversationId: string;

      if (existing) {
        conversationId = existing.id;
      } else {
        // Create a new group conversation for this community
        const { data: created, error: createError } = await supabaseAdmin
          .from('conversations')
          .insert({ type: 'group', name: communityName, created_by: userId })
          .select()
          .single();

        if (createError || !created) {
          logger.error('Failed to create community conversation', { createError });
          return res.status(500).json({ success: false, error: 'Failed to create community chat' });
        }
        conversationId = created.id;
      }

      // Ensure the requesting user is a participant (upsert — safe if already in)
      await supabaseAdmin
        .from('conversation_participants')
        .upsert({ conversation_id: conversationId, user_id: userId }, { onConflict: 'conversation_id,user_id' });

      res.json({ success: true, data: { conversationId } });
    } catch (error) {
      logger.error('Community chat error', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/chat/conversations
 * Create a new conversation
 */
router.post(
  '/conversations',
  authenticate,
  validateBody(createConversationSchema),
  async (req: AuthRequest, res) => {
    try {
      const { participantIds, type, name } = req.body;
      
      // Add current user to participants if not included
      const allParticipants = [...new Set([req.user!.id, ...participantIds])];
      
      // For direct conversations, block check: prevent creating a DM with a blocked user
      if (type === 'direct' && allParticipants.length === 2) {
        const otherId = allParticipants.find(uid => uid !== req.user!.id)!;
        const { data: blockRows } = await supabaseAdmin
          .from('user_blocks')
          .select('id')
          .or(
            `and(blocker_id.eq.${req.user!.id},blocked_id.eq.${otherId}),` +
            `and(blocked_id.eq.${req.user!.id},blocker_id.eq.${otherId})`
          );
        if (blockRows && blockRows.length > 0) {
          return res.status(403).json({ success: false, error: 'You cannot start a conversation with this user' });
        }
      }

      // For direct conversations, check if one already exists
      if (type === 'direct' && allParticipants.length === 2) {
        const { data: existing } = await supabaseAdmin.rpc('find_direct_conversation', {
          user1_id: allParticipants[0],
          user2_id: allParticipants[1],
        });
        
        if (existing) {
          return res.json({
            success: true,
            data: { conversation: existing },
          });
        }
      }
      
      // Create conversation
      const { data: conversation, error: convError } = await supabaseAdmin
        .from('conversations')
        .insert({
          type,
          name,
          created_by: req.user!.id,
        })
        .select()
        .single();

      if (convError || !conversation) {
        logger.error('Failed to create conversation', { error: convError });
        return res.status(500).json({
          success: false,
          error: 'Failed to create conversation',
        });
      }

      // Add participants
      const participantRecords = allParticipants.map(userId => ({
        conversation_id: conversation.id,
        user_id: userId,
      }));

      const { error: participantsError } = await supabaseAdmin
        .from('conversation_participants')
        .insert(participantRecords);

      if (participantsError) {
        logger.error('Failed to add participants', { error: participantsError });
        // Rollback: delete conversation
        await supabaseAdmin.from('conversations').delete().eq('id', conversation.id);
        return res.status(500).json({
          success: false,
          error: 'Failed to add participants',
        });
      }

      res.status(201).json({
        success: true,
        data: { conversation },
      });
    } catch (error) {
      logger.error('Create conversation error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PATCH /api/chat/conversations/:id/participant
 * Mute or archive a conversation for the calling user only.
 * Body: { muted?: boolean, archived?: boolean }
 * Updates `conversation_participants` row for the caller — does not affect other members.
 */
router.patch(
  '/conversations/:id/participant',
  authenticate,
  validateParams(uuidParamsSchema),
  validateBody(
    z.object({
      muted:    z.boolean().optional(),
      archived: z.boolean().optional(),
    }).refine(d => d.muted !== undefined || d.archived !== undefined, {
      message: 'At least one of muted or archived is required',
    })
  ),
  async (req: AuthRequest, res) => {
    try {
      const { id }   = req.params;
      const userId   = req.user!.id;
      const { muted, archived } = req.body as { muted?: boolean; archived?: boolean };

      // Verify caller is a participant
      const { data: participant } = await supabaseAdmin
        .from('conversation_participants')
        .select('id')
        .eq('conversation_id', id)
        .eq('user_id', userId)
        .is('left_at', null)
        .maybeSingle();

      if (!participant) {
        return res.status(403).json({ success: false, error: 'You are not a participant in this conversation' });
      }

      const updates: Record<string, unknown> = {};
      if (muted    !== undefined) updates.muted    = muted;
      if (archived !== undefined) updates.archived = archived;

      const { error: updateErr } = await supabaseAdmin
        .from('conversation_participants')
        .update(updates)
        .eq('conversation_id', id)
        .eq('user_id', userId);

      if (updateErr) {
        logger.error('Failed to update conversation participant', { updateErr });
        return res.status(500).json({ success: false, error: 'Failed to update conversation settings' });
      }

      res.json({ success: true, data: { conversation_id: id, ...updates } });
    } catch (error) {
      logger.error('PATCH /chat/conversations/:id/participant error', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/chat/conversations/:id/messages
 * Get messages in a conversation
 */
router.get(
  '/conversations/:id/messages',
  authenticate,
  validateParams(uuidParamsSchema),
  validateQuery(messagesQuerySchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const limit = Number(req.query.limit) || 50;
      const before = req.query.before as string | undefined;
      
      // Verify user is participant
      const { data: participant } = await supabaseAdmin
        .from('conversation_participants')
        .select('id')
        .eq('conversation_id', id)
        .eq('user_id', req.user!.id)
        .is('left_at', null)
        .single();

      if (!participant) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      let query = supabaseAdmin
        .from('messages')
        .select(`
          id,
          content,
          edited,
          edited_at,
          created_at,
          sender:sender_id (
            id,
            full_name,
            avatar_url,
            role
          ),
          message_reactions (
            id,
            emoji,
            user_id
          ),
          message_reads (
            user_id,
            read_at
          ),
          attachments (
            id,
            file_name,
            file_type,
            file_size,
            url
          )
        `)
        .eq('conversation_id', id)
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (before) {
        // Get messages before a specific message (for pagination)
        const { data: beforeMessage } = await supabaseAdmin
          .from('messages')
          .select('created_at')
          .eq('id', before)
          .single();
        
        if (beforeMessage) {
          query = query.lt('created_at', beforeMessage.created_at);
        }
      }

      const { data: messages, error } = await query;

      if (error) {
        logger.error('Failed to fetch messages', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch messages',
        });
      }

      res.json({
        success: true,
        data: { messages: messages?.reverse() || [] },
      });
    } catch (error) {
      logger.error('Get messages error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/chat/conversations/:id/messages
 * Send a message in a conversation
 */
router.post(
  '/conversations/:id/messages',
  authenticate,
  validateParams(uuidParamsSchema),
  validateBody(sendMessageSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      
      // Verify user is participant
      const { data: participant } = await supabaseAdmin
        .from('conversation_participants')
        .select('id')
        .eq('conversation_id', id)
        .eq('user_id', req.user!.id)
        .is('left_at', null)
        .single();

      if (!participant) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      // Block check: prevent sending to a conversation where any other participant
      // has blocked the sender or has been blocked by the sender.
      const { data: otherParticipants } = await supabaseAdmin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', id)
        .is('left_at', null)
        .neq('user_id', req.user!.id);

      if (otherParticipants?.length) {
        const otherIds = otherParticipants.map((p: any) => p.user_id);
        const { data: blockRows } = await supabaseAdmin
          .from('user_blocks')
          .select('id')
          .or(
            `and(blocker_id.eq.${req.user!.id},blocked_id.in.(${otherIds.join(',')})),` +
            `and(blocked_id.eq.${req.user!.id},blocker_id.in.(${otherIds.join(',')}))`
          );
        if (blockRows && blockRows.length > 0) {
          return res.status(403).json({ success: false, error: 'You cannot send messages in this conversation' });
        }
      }
      const sanitizedContent = sanitizeContent(content);

      // Profanity gate
      if (containsProfanity(content)) {
        return res.status(400).json({
          success: false,
          error: 'Your message contains inappropriate language. Please revise and resend.',
        });
      }

      // Create message
      const { data: message, error: messageError } = await supabaseAdmin
        .from('messages')
        .insert({
          conversation_id: id,
          sender_id: req.user!.id,
          content: sanitizedContent,
        })
        .select(`
          id,
          content,
          created_at,
          sender:sender_id (
            id,
            full_name,
            avatar_url
          )
        `)
        .single();

      if (messageError || !message) {
        logger.error('Failed to create message', { error: messageError });
        return res.status(500).json({
          success: false,
          error: 'Failed to send message',
        });
      }

      // Handle mentions
      const mentions = extractMentions(content);
      if (mentions.length > 0) {
        // Find mentioned users and send notifications (async, don't wait)
        setImmediate(async () => {
          try {
            const { data: mentionedUsers } = await supabaseAdmin
              .from('profiles')
              .select('id, email, full_name')
              .in('id', mentions);

            if (mentionedUsers) {
              for (const user of mentionedUsers) {
                // Create in-app notification
                await supabaseAdmin.from('notifications').insert({
                  user_id: user.id,
                  type: 'mention',
                  title: `${req.user!.email} mentioned you`,
                  content: sanitizedContent.substring(0, 200),
                  link: `/chat/${id}`,
                });

                // Send email
                await sendMentionEmail(
                  user.email,
                  req.user!.email,
                  sanitizedContent.substring(0, 200),
                  `${process.env.CORS_ORIGIN}/chat/${id}`
                );
              }
            }
          } catch (error) {
            logger.error('Failed to send mention notifications', { error });
          }
        });
      }

      res.status(201).json({
        success: true,
        data: { message },
      });

      // Fire-and-forget AI content moderation
      setImmediate(() =>
        runAIModeration({
          type: 'message',
          id: message.id,
          content: sanitizedContent,
          authorId: req.user!.id,
        }).catch(() => {})
      );
    } catch (error) {
      logger.error('Send message error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PATCH /api/chat/messages/:id
 * Edit a message
 */
router.patch(
  '/messages/:id',
  authenticate,
  validateParams(uuidParamsSchema),
  validateBody(updateMessageSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      
      const sanitizedContent = sanitizeContent(content);

      const { data: message, error } = await supabaseAdmin
        .from('messages')
        .update({
          content: sanitizedContent,
          edited: true,
          edited_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('sender_id', req.user!.id)
        .select()
        .single();

      if (error || !message) {
        logger.error('Failed to update message', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to update message',
        });
      }

      res.json({
        success: true,
        data: { message },
      });
    } catch (error) {
      logger.error('Update message error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/chat/messages/:id
 * Soft delete a message
 */
router.delete(
  '/messages/:id',
  authenticate,
  validateParams(uuidParamsSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const { error } = await supabaseAdmin
        .from('messages')
        .update({
          deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('sender_id', req.user!.id);

      if (error) {
        logger.error('Failed to delete message', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to delete message',
        });
      }

      res.json({
        success: true,
        data: { message: 'Message deleted' },
      });
    } catch (error) {
      logger.error('Delete message error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/chat/messages/:id/read
 * Mark message as read
 */
router.post(
  '/messages/:id/read',
  authenticate,
  validateParams(uuidParamsSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const { error } = await supabaseAdmin
        .from('message_reads')
        .upsert({
          message_id: id,
          user_id: req.user!.id,
        }, {
          onConflict: 'message_id,user_id',
        });

      if (error) {
        logger.error('Failed to mark message as read', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to mark message as read',
        });
      }

      res.json({
        success: true,
        data: { message: 'Message marked as read' },
      });
    } catch (error) {
      logger.error('Mark read error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/chat/messages/:id/reactions
 * Add reaction to message
 */
router.post(
  '/messages/:id/reactions',
  authenticate,
  validateParams(uuidParamsSchema),
  validateBody(z.object({ emoji: z.string().min(1).max(10) })),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { emoji } = req.body;

      const { data: reaction, error } = await supabaseAdmin
        .from('message_reactions')
        .upsert({
          message_id: id,
          user_id: req.user!.id,
          emoji,
        }, {
          onConflict: 'message_id,user_id,emoji',
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to add reaction', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to add reaction',
        });
      }

      res.json({
        success: true,
        data: { reaction },
      });
    } catch (error) {
      logger.error('Add reaction error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/chat/conversations/:id/typing
 * Update typing indicator
 */
router.post(
  '/conversations/:id/typing',
  authenticate,
  validateParams(uuidParamsSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      // Upsert typing indicator (will be cleaned up by cron job)
      await supabaseAdmin
        .from('typing_indicators')
        .upsert({
          conversation_id: id,
          user_id: req.user!.id,
          started_at: new Date().toISOString(),
        }, {
          onConflict: 'conversation_id,user_id',
        });

      res.json({
        success: true,
        data: { message: 'Typing indicator updated' },
      });
    } catch (error) {
      logger.error('Typing indicator error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/chat/search?q=<query>&limit=&offset=
 * Search messages the authenticated user can see (i.e. in their conversations).
 * Only returns messages from conversations the user participates in.
 */
router.get(
  '/search',
  authenticate,
  validateQuery(
    z.object({
      q:      z.string().min(2).max(200),
      limit:  z.string().optional().transform(v => Math.min(Number(v) || 20, 50)),
      offset: z.string().optional().transform(v => Number(v) || 0),
    })
  ),
  async (req: AuthRequest, res) => {
    try {
      const q      = String(req.query.q ?? '');
      const limit  = Math.min(Number(req.query.limit)  || 20, 50);
      const offset = Number(req.query.offset) || 0;

      // Resolve the user's conversation IDs first (RLS-safe approach)
      const { data: participantRows } = await supabaseAdmin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', req.user!.id)
        .is('left_at', null);

      const conversationIds = (participantRows ?? []).map((r: any) => r.conversation_id as string);

      if (conversationIds.length === 0) {
        return res.json({ success: true, data: { results: [], query: q, total: 0 } });
      }

      const { data, error } = await supabaseAdmin
        .from('messages')
        .select(`
          id, content, created_at, conversation_id,
          sender:sender_id (id, full_name, avatar_url)
        `)
        .in('conversation_id', conversationIds)
        .ilike('content', `%${q}%`)
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Chat search error', { error });
        return res.status(500).json({ success: false, error: 'Search failed' });
      }

      const results = (data ?? []).map((m: any) => ({
        id:              m.id,
        excerpt:         (m.content as string)?.slice(0, 200) ?? '',
        created_at:      m.created_at,
        sender:          m.sender,
        conversation_id: m.conversation_id,
        link:            `/chat/${m.conversation_id}`,
      }));

      res.json({
        success: true,
        data: { results, query: q, total: results.length },
      });
    } catch (error) {
      logger.error('Chat search error', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
