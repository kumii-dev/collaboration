import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, requireModerator, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.js';
import logger from '../logger.js';
import { sanitizeContent, extractMentions } from '../utils/helpers.js';
import { sendReplyEmail } from '../services/email.js';

const router = Router();

// Validation schemas
const createThreadSchema = z.object({
  boardId: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
});

const createPostSchema = z.object({
  threadId: z.string().uuid(),
  content: z.string().min(1).max(50000),
  parentPostId: z.string().uuid().optional(),
});

const voteSchema = z.object({
  voteValue: z.enum(['1', '-1']).transform(val => parseInt(val)),
});

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  icon: z.string().max(10).optional(),
});

const createBoardSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  category_id: z.string().uuid(),
});

const querySchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
});

/**
 * GET /api/forum/categories
 * Get all forum categories with boards
 */
router.get('/categories', authenticate, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('forum_categories')
      .select(`
        id,
        name,
        description,
        icon,
        sort_order,
        forum_boards (
          id,
          name,
          description,
          is_private,
          required_role,
          sort_order
        )
      `)
      .eq('archived', false)
      .order('sort_order', { ascending: true })
      .order('sort_order', { foreignTable: 'forum_boards', ascending: true });

    if (error) {
      logger.error('Failed to fetch categories', { error });
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch categories',
      });
    }

    // Add board_count to each category
    const categoriesWithCount = data.map(category => ({
      ...category,
      board_count: category.forum_boards?.length || 0,
      slug: category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    }));

    res.json({
      success: true,
      data: categoriesWithCount,
    });
  } catch (error) {
    logger.error('Get categories error', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/forum/categories/:id/boards
 * Get boards in a category
 */
router.get(
  '/categories/:id/boards',
  authenticate,
  validateParams(z.object({ id: z.string().uuid() })),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabaseAdmin
        .from('forum_boards')
        .select(`
          id,
          name,
          description,
          category_id,
          sort_order,
          is_private,
          required_role
        `)
        .eq('category_id', id)
        .order('sort_order', { ascending: true });

      if (error) {
        logger.error('Failed to fetch boards', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch boards',
        });
      }

      // Add slug dynamically since it's not in the database
      const boardsWithSlug = data.map(board => ({
        ...board,
        slug: board.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      }));

      res.json({
        success: true,
        data: boardsWithSlug,
      });
    } catch (error) {
      logger.error('Get boards error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/forum/boards/:id/threads
 * Get threads in a board
 */
router.get(
  '/boards/:id/threads',
  authenticate,
  validateParams(z.object({ id: z.string().uuid() })),
  validateQuery(querySchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { limit, offset } = req.query as any;

      const { data, error, count } = await supabaseAdmin
        .from('forum_threads')
        .select(`
          id,
          title,
          content,
          is_pinned,
          is_locked,
          views_count,
          created_at,
          updated_at,
          last_post_at,
          author:author_id (
            id,
            full_name,
            avatar_url,
            role,
            verified
          )
        `, { count: 'exact' })
        .eq('board_id', id)
        .eq('deleted', false)
        .order('is_pinned', { ascending: false })
        .order('last_post_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Failed to fetch threads', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch threads',
        });
      }

      res.json({
        success: true,
        data: {
          threads: data,
          total: count,
          limit,
          offset,
        },
      });
    } catch (error) {
      logger.error('Get threads error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/forum/threads
 * Create a new thread
 */
router.post(
  '/threads',
  authenticate,
  validateBody(createThreadSchema),
  async (req: AuthRequest, res) => {
    try {
      const { boardId, title, content } = req.body;

      const sanitizedContent = sanitizeContent(content);

      const { data: thread, error } = await supabaseAdmin
        .from('forum_threads')
        .insert({
          board_id: boardId,
          author_id: req.user!.id,
          title,
          content: sanitizedContent,
        })
        .select(`
          id,
          title,
          content,
          created_at,
          author:author_id (
            id,
            full_name,
            avatar_url
          )
        `)
        .single();

      if (error || !thread) {
        logger.error('Failed to create thread', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to create thread',
        });
      }

      res.status(201).json({
        success: true,
        data: { thread },
      });
    } catch (error) {
      logger.error('Create thread error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/forum/threads/:id
 * Get thread with posts
 */
router.get(
  '/threads/:id',
  authenticate,
  validateParams(z.object({ id: z.string().uuid() })),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      // Increment view count
      await supabaseAdmin.rpc('increment_thread_views', { thread_id: id });

      const { data: thread, error } = await supabaseAdmin
        .from('forum_threads')
        .select(`
          id,
          title,
          content,
          is_pinned,
          is_locked,
          views_count,
          created_at,
          updated_at,
          author:author_id (
            id,
            full_name,
            avatar_url,
            role,
            verified,
            reputation_score
          ),
          forum_posts (
            id,
            content,
            edited,
            edited_at,
            created_at,
            parent_post_id,
            author:author_id (
              id,
              full_name,
              avatar_url,
              role,
              verified
            )
          )
        `)
        .eq('id', id)
        .eq('deleted', false)
        .single();

      if (error || !thread) {
        logger.error('Failed to fetch thread', { error });
        return res.status(404).json({
          success: false,
          error: 'Thread not found',
        });
      }

      res.json({
        success: true,
        data: { thread },
      });
    } catch (error) {
      logger.error('Get thread error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/forum/posts
 * Create a new post (reply)
 */
router.post(
  '/posts',
  authenticate,
  validateBody(createPostSchema),
  async (req: AuthRequest, res) => {
    try {
      const { threadId, content, parentPostId } = req.body;

      const sanitizedContent = sanitizeContent(content);

      const { data: post, error } = await supabaseAdmin
        .from('forum_posts')
        .insert({
          thread_id: threadId,
          author_id: req.user!.id,
          content: sanitizedContent,
          parent_post_id: parentPostId,
        })
        .select(`
          id,
          content,
          created_at,
          author:author_id (
            id,
            full_name,
            avatar_url
          )
        `)
        .single();

      if (error || !post) {
        logger.error('Failed to create post', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to create post',
        });
      }

      res.status(201).json({
        success: true,
        data: { post },
      });
    } catch (error) {
      logger.error('Create post error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/forum/threads/:id/vote
 * Vote on a thread
 */
router.post(
  '/threads/:id/vote',
  authenticate,
  validateParams(z.object({ id: z.string().uuid() })),
  validateBody(voteSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { voteValue } = req.body;

      const { error } = await supabaseAdmin
        .from('forum_votes')
        .upsert({
          thread_id: id,
          user_id: req.user!.id,
          vote_value: voteValue,
        }, {
          onConflict: 'thread_id,user_id',
        });

      if (error) {
        logger.error('Failed to vote', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to vote',
        });
      }

      res.json({
        success: true,
        data: { message: 'Vote recorded' },
      });
    } catch (error) {
      logger.error('Vote error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/forum/posts/:id/vote
 * Vote on a post
 */
router.post(
  '/posts/:id/vote',
  authenticate,
  validateParams(z.object({ id: z.string().uuid() })),
  validateBody(voteSchema),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { voteValue } = req.body;

      const { error } = await supabaseAdmin
        .from('forum_votes')
        .upsert({
          post_id: id,
          user_id: req.user!.id,
          vote_value: voteValue,
        }, {
          onConflict: 'post_id,user_id',
        });

      if (error) {
        logger.error('Failed to vote', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to vote',
        });
      }

      res.json({
        success: true,
        data: { message: 'Vote recorded' },
      });
    } catch (error) {
      logger.error('Vote error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/forum/categories
 * Create a new category
 */
router.post(
  '/categories',
  authenticate,
  validateBody(createCategorySchema),
  async (req: AuthRequest, res) => {
    try {
      const { name, description, icon } = req.body;
      console.log('🔵 [POST /categories] Request body:', { name, description, icon });
      console.log('🔵 [POST /categories] User:', req.user?.id);

      // Get the max sort_order (maybeSingle returns null instead of error when no rows)
      const { data: maxSort, error: maxSortError } = await supabaseAdmin
        .from('forum_categories')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('🔵 [POST /categories] Max sort order:', maxSort, 'Error:', maxSortError);

      const sortOrder = (maxSort?.sort_order || 0) + 1;
      console.log('🔵 [POST /categories] New sort order:', sortOrder);

      const insertData = {
        name,
        description,
        icon: icon || null,
        sort_order: sortOrder,
        archived: false,
      };
      console.log('🔵 [POST /categories] Inserting data:', insertData);

      const { data: category, error } = await supabaseAdmin
        .from('forum_categories')
        .insert(insertData)
        .select()
        .single();

      console.log('🔵 [POST /categories] Insert result - data:', category, 'error:', error);

      if (error) {
        console.error('❌ [POST /categories] Database error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fullError: error
        });
        logger.error('Failed to create category', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to create category',
          message: error.message,
        });
      }

      // Add board_count to match the format from GET /categories
      const categoryWithCount = {
        ...category,
        board_count: 0,
        slug: category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      };

      console.log('✅ [POST /categories] Success! Created category:', categoryWithCount);

      res.status(201).json({
        success: true,
        data: categoryWithCount,
      });
    } catch (error) {
      console.error('❌ [POST /categories] Catch block error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      logger.error('Create category error', { error });
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: errorMessage,
      });
    }
  }
);

/**
 * POST /api/forum/boards
 * Create a new board
 */
router.post(
  '/boards',
  authenticate,
  validateBody(createBoardSchema),
  async (req: AuthRequest, res) => {
    try {
      const { name, description, category_id } = req.body;

      // Verify category exists
      const { data: category, error: categoryError } = await supabaseAdmin
        .from('forum_categories')
        .select('id')
        .eq('id', category_id)
        .single();

      if (categoryError || !category) {
        return res.status(404).json({
          success: false,
          error: 'Category not found',
        });
      }

      // Get the max sort_order for this category (maybeSingle returns null instead of error when no rows)
      const { data: maxSort } = await supabaseAdmin
        .from('forum_boards')
        .select('sort_order')
        .eq('category_id', category_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const sortOrder = (maxSort?.sort_order || 0) + 1;

      const { data: board, error } = await supabaseAdmin
        .from('forum_boards')
        .insert({
          name,
          description,
          category_id,
          sort_order: sortOrder,
          is_private: false,
          required_role: null,
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create board', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to create board',
          message: error.message,
        });
      }

      res.status(201).json({
        success: true,
        data: board,
      });
    } catch (error) {
      logger.error('Create board error', { error });
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: errorMessage,
      });
    }
  }
);

export default router;
