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
 * GET /api/forum/threads
 * Get threads with sorting and filtering
 * Query params: sort (trending/recent), limit, offset, boardId (optional)
 */
router.get(
  '/threads',
  authenticate,
  validateQuery(z.object({
    sort: z.enum(['trending', 'recent']).optional().default('recent'),
    limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
    offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
    boardId: z.string().uuid().optional(),
    search: z.string().optional(),
  })),
  async (req: AuthRequest, res) => {
    try {
      const { sort, limit, offset, boardId, search } = req.query as any;
      console.log('🔵 GET /api/forum/threads - Query params:', { sort, limit, offset, boardId, search });

      let query = supabaseAdmin
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
          board_id,
          board:board_id (
            id,
            name
          ),
          author:author_id (
            id,
            full_name,
            avatar_url,
            role,
            verified
          ),
          posts:forum_posts(count),
          votes:forum_votes(vote_value)
        `, { count: 'exact' })
        .eq('deleted', false);

      // Filter by board if provided
      if (boardId) {
        query = query.eq('board_id', boardId);
      }

      // Add search filter (case-insensitive search in title and content)
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      // Apply sorting
      if (sort === 'trending') {
        // Trending: combination of recent activity and votes
        // Order by vote score and recent activity
        query = query
          .order('is_pinned', { ascending: false })
          .order('views_count', { ascending: false })
          .order('last_post_at', { ascending: false });
      } else {
        // Recent: newest first
        query = query
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false });
      }

      const { data, error, count } = await query.range(offset, offset + limit - 1);

      if (error) {
        console.error('❌ Failed to fetch threads:', error);
        logger.error('Failed to fetch threads', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch threads',
        });
      }

      // Calculate reply count and vote score for each thread
      const threadsWithStats = data?.map(thread => {
        const author = Array.isArray(thread.author) ? thread.author[0] : thread.author;
        const board = Array.isArray(thread.board) ? thread.board[0] : thread.board;
        
        return {
          id: thread.id,
          title: thread.title,
          content_preview: thread.content?.substring(0, 200) || '',
          author_id: author?.id,
          author_name: author?.full_name,
          author_avatar: author?.avatar_url,
          board_id: thread.board_id,
          board_name: board?.name,
          created_at: thread.created_at,
          updated_at: thread.updated_at,
          last_post_at: thread.last_post_at,
          is_pinned: thread.is_pinned,
          is_locked: thread.is_locked,
          view_count: thread.views_count || 0,
          reply_count: Array.isArray(thread.posts) ? thread.posts.length : (thread.posts as any)?.count || 0,
          vote_score: Array.isArray(thread.votes) 
            ? thread.votes.reduce((sum: number, vote: any) => sum + (vote.vote_value || 0), 0)
            : 0,
        };
      }) || [];

      console.log('✅ Fetched threads:', threadsWithStats.length);
      res.json({
        success: true,
        data: threadsWithStats,
        pagination: {
          total: count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error('❌ Get threads error:', error);
      logger.error('Get threads error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/forum/threads/:threadId
 * Get a single thread by ID with full details
 */
router.get(
  '/threads/:threadId',
  authenticate,
  validateParams(z.object({ threadId: z.string().uuid() })),
  async (req: AuthRequest, res) => {
    try {
      const { threadId } = req.params;
      console.log('🔵 GET /api/forum/threads/:threadId - Thread ID:', threadId);

      // Fetch thread with author and board info
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
          last_post_at,
          board_id,
          author_id,
          board:board_id (
            id,
            name,
            category_id
          ),
          author:author_id (
            id,
            full_name,
            avatar_url,
            role,
            verified
          )
        `)
        .eq('id', threadId)
        .eq('deleted', false)
        .single();

      if (error || !thread) {
        console.error('❌ Thread not found:', threadId, error);
        return res.status(404).json({
          success: false,
          error: 'Thread not found',
        });
      }

      // Get reply count
      const { count: replyCount } = await supabaseAdmin
        .from('forum_posts')
        .select('*', { count: 'exact', head: true })
        .eq('thread_id', threadId)
        .eq('deleted', false);

      // Get vote score
      const { data: votes } = await supabaseAdmin
        .from('forum_votes')
        .select('vote_value')
        .eq('thread_id', threadId)
        .is('post_id', null);

      const voteScore = votes?.reduce((sum, vote) => sum + (vote.vote_value || 0), 0) || 0;

      // Increment view count (fire and forget - don't wait for it)
      void supabaseAdmin
        .from('forum_threads')
        .update({ views_count: (thread.views_count || 0) + 1 })
        .eq('id', threadId);

      const author = Array.isArray(thread.author) ? thread.author[0] : thread.author;
      const board = Array.isArray(thread.board) ? thread.board[0] : thread.board;

      const threadData = {
        id: thread.id,
        title: thread.title,
        content: thread.content,
        author_id: thread.author_id,
        author_name: author?.full_name || 'Unknown',
        author_avatar: author?.avatar_url,
        author_role: author?.role || 'user',
        board_id: thread.board_id,
        board_name: board?.name || 'Unknown',
        category_id: board?.category_id,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        last_post_at: thread.last_post_at,
        is_pinned: thread.is_pinned,
        is_locked: thread.is_locked,
        view_count: (thread.views_count || 0) + 1, // Return incremented value
        reply_count: replyCount || 0,
        vote_score: voteScore,
      };

      console.log('✅ Fetched thread details:', { id: threadData.id, title: threadData.title });
      res.json({
        success: true,
        data: threadData,
      });
    } catch (error) {
      console.error('❌ Get thread error:', error);
      logger.error('Get thread error', { error });
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
      console.log('🔵 POST /api/forum/threads - Request data:', { boardId, title, contentLength: content?.length });
      console.log('🔵 User:', req.user?.id);

      const sanitizedContent = sanitizeContent(content);
      console.log('🔵 Content sanitized, length:', sanitizedContent.length);

      const insertData = {
        board_id: boardId,
        author_id: req.user!.id,
        title,
        content: sanitizedContent,
      };
      console.log('🔵 Inserting thread with data:', insertData);

      const { data: thread, error } = await supabaseAdmin
        .from('forum_threads')
        .insert(insertData)
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
        console.error('❌ Database error creating thread:', {
          error,
          errorMessage: error?.message,
          errorDetails: error?.details,
          errorHint: error?.hint,
          errorCode: error?.code
        });
        logger.error('Failed to create thread', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to create thread',
          message: error?.message,
        });
      }

      console.log('✅ Thread created successfully:', thread);
      res.status(201).json({
        success: true,
        data: { thread },
      });
    } catch (error) {
      console.error('❌ Unexpected error in thread creation:', error);
      logger.error('Create thread error', { error });
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
      console.log('🔵 POST /api/forum/boards - Request data:', { name, description, category_id });
      console.log('🔵 User:', req.user?.id);

      // Verify category exists
      console.log('🔵 Checking if category exists:', category_id);
      const { data: category, error: categoryError } = await supabaseAdmin
        .from('forum_categories')
        .select('id')
        .eq('id', category_id)
        .single();

      if (categoryError || !category) {
        console.error('❌ Category not found:', { category_id, categoryError });
        return res.status(404).json({
          success: false,
          error: 'Category not found',
          message: categoryError?.message || 'Category does not exist',
        });
      }

      console.log('✅ Category found:', category);

      // Get the max sort_order for this category (maybeSingle returns null instead of error when no rows)
      console.log('🔵 Getting max sort_order for category:', category_id);
      const { data: maxSort } = await supabaseAdmin
        .from('forum_boards')
        .select('sort_order')
        .eq('category_id', category_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const sortOrder = (maxSort?.sort_order || 0) + 1;
      console.log('🔵 Max sort_order:', maxSort?.sort_order, 'New sort_order:', sortOrder);

      const insertData = {
        name,
        description,
        category_id,
        sort_order: sortOrder,
        is_private: false,
        required_role: null,
      };
      console.log('🔵 Inserting board with data:', insertData);

      const { data: board, error } = await supabaseAdmin
        .from('forum_boards')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('❌ Database error creating board:', {
          error,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
          errorCode: error.code
        });
        logger.error('Failed to create board', { error });
        return res.status(500).json({
          success: false,
          error: 'Failed to create board',
          message: error.message,
        });
      }

      console.log('✅ Board created successfully:', board);
      res.status(201).json({
        success: true,
        data: board,
      });
    } catch (error) {
      console.error('❌ Unexpected error in board creation:', error);
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

/**
 * POST /api/forum/posts/:postId/mark-solution
 * Mark a post as the solution to a thread (thread author only)
 */
router.post(
  '/posts/:postId/mark-solution',
  authenticate,
  validateParams(z.object({ postId: z.string().uuid() })),
  async (req: AuthRequest, res) => {
    try {
      const { postId } = req.params;
      const userId = req.user!.id;

      console.log('🔵 POST /posts/:postId/mark-solution - Post ID:', postId, 'User:', userId);

      // Get the post to find its thread
      const { data: post, error: postError } = await supabaseAdmin
        .from('forum_posts')
        .select('id, thread_id, is_solution')
        .eq('id', postId)
        .eq('deleted', false)
        .single();

      if (postError || !post) {
        console.error('❌ Post not found:', postId);
        return res.status(404).json({
          success: false,
          error: 'Post not found',
        });
      }

      // Get the thread to verify the user is the author
      const { data: thread, error: threadError } = await supabaseAdmin
        .from('forum_threads')
        .select('id, author_id')
        .eq('id', post.thread_id)
        .single();

      if (threadError || !thread) {
        console.error('❌ Thread not found:', post.thread_id);
        return res.status(404).json({
          success: false,
          error: 'Thread not found',
        });
      }

      // Verify the user is the thread author
      if (thread.author_id !== userId) {
        console.error('❌ Unauthorized: User is not thread author');
        return res.status(403).json({
          success: false,
          error: 'Only the thread author can mark solutions',
        });
      }

      // If this post is already marked as solution, unmark it
      if (post.is_solution) {
        const { error: unmarkError } = await supabaseAdmin
          .from('forum_posts')
          .update({ is_solution: false })
          .eq('id', postId);

        if (unmarkError) {
          console.error('❌ Failed to unmark solution:', unmarkError);
          return res.status(500).json({
            success: false,
            error: 'Failed to unmark solution',
          });
        }

        console.log('✅ Unmarked post as solution:', postId);
        return res.json({
          success: true,
          data: { marked: false, message: 'Solution removed' },
        });
      }

      // Unmark any existing solutions in this thread
      const { error: clearError } = await supabaseAdmin
        .from('forum_posts')
        .update({ is_solution: false })
        .eq('thread_id', post.thread_id);

      if (clearError) {
        console.error('❌ Failed to clear existing solutions:', clearError);
      }

      // Mark this post as the solution
      const { error: markError } = await supabaseAdmin
        .from('forum_posts')
        .update({ is_solution: true })
        .eq('id', postId);

      if (markError) {
        console.error('❌ Failed to mark solution:', markError);
        logger.error('Failed to mark solution', { error: markError });
        return res.status(500).json({
          success: false,
          error: 'Failed to mark solution',
        });
      }

      console.log('✅ Marked post as solution:', postId);
      res.json({
        success: true,
        data: { marked: true, message: 'Solution marked' },
      });
    } catch (error) {
      console.error('❌ Mark solution error:', error);
      logger.error('Mark solution error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/forum/posts/:postId
 * Edit a post (author only)
 */
router.put(
  '/posts/:postId',
  authenticate,
  validateParams(z.object({ postId: z.string().uuid() })),
  validateBody(z.object({ content: z.string().min(1).max(50000) })),
  async (req: AuthRequest, res) => {
    try {
      const { postId } = req.params;
      const { content } = req.body;
      const userId = req.user!.id;

      console.log('🔵 PUT /posts/:postId - Post ID:', postId, 'User:', userId);

      // Get the post to verify ownership
      const { data: post, error: fetchError } = await supabaseAdmin
        .from('forum_posts')
        .select('id, author_id, deleted')
        .eq('id', postId)
        .single();

      if (fetchError || !post) {
        console.error('❌ Post not found:', postId);
        return res.status(404).json({
          success: false,
          error: 'Post not found',
        });
      }

      if (post.deleted) {
        return res.status(404).json({
          success: false,
          error: 'Post has been deleted',
        });
      }

      // Verify the user is the author
      if (post.author_id !== userId) {
        console.error('❌ Unauthorized: User is not post author');
        return res.status(403).json({
          success: false,
          error: 'You can only edit your own posts',
        });
      }

      // Update the post
      const { data: updatedPost, error: updateError } = await supabaseAdmin
        .from('forum_posts')
        .update({ 
          content,
          updated_at: new Date().toISOString()
        })
        .eq('id', postId)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Failed to update post:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Failed to update post',
        });
      }

      console.log('✅ Updated post:', postId);
      res.json({
        success: true,
        data: updatedPost,
      });
    } catch (error) {
      console.error('❌ Update post error:', error);
      logger.error('Update post error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/forum/posts/:postId
 * Soft delete a post (author only)
 */
router.delete(
  '/posts/:postId',
  authenticate,
  validateParams(z.object({ postId: z.string().uuid() })),
  async (req: AuthRequest, res) => {
    try {
      const { postId } = req.params;
      const userId = req.user!.id;

      console.log('🔵 DELETE /posts/:postId - Post ID:', postId, 'User:', userId);

      // Get the post to verify ownership
      const { data: post, error: fetchError } = await supabaseAdmin
        .from('forum_posts')
        .select('id, author_id, deleted')
        .eq('id', postId)
        .single();

      if (fetchError || !post) {
        console.error('❌ Post not found:', postId);
        return res.status(404).json({
          success: false,
          error: 'Post not found',
        });
      }

      if (post.deleted) {
        return res.status(400).json({
          success: false,
          error: 'Post is already deleted',
        });
      }

      // Verify the user is the author
      if (post.author_id !== userId) {
        console.error('❌ Unauthorized: User is not post author');
        return res.status(403).json({
          success: false,
          error: 'You can only delete your own posts',
        });
      }

      // Soft delete the post
      const { error: deleteError } = await supabaseAdmin
        .from('forum_posts')
        .update({ 
          deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', postId);

      if (deleteError) {
        console.error('❌ Failed to delete post:', deleteError);
        return res.status(500).json({
          success: false,
          error: 'Failed to delete post',
        });
      }

      console.log('✅ Deleted post:', postId);
      res.json({
        success: true,
        data: { message: 'Post deleted successfully' },
      });
    } catch (error) {
      console.error('❌ Delete post error:', error);
      logger.error('Delete post error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/forum/threads/:threadId/bookmark
 * Bookmark a thread
 */
router.post(
  '/threads/:threadId/bookmark',
  authenticate,
  validateParams(z.object({ threadId: z.string().uuid() })),
  async (req: AuthRequest, res) => {
    try {
      const { threadId } = req.params;
      const userId = req.user!.id;

      console.log('🔵 POST /threads/:threadId/bookmark - Thread ID:', threadId, 'User:', userId);

      // Check if bookmark already exists
      const { data: existing } = await supabaseAdmin
        .from('forum_bookmarks')
        .select('id')
        .eq('thread_id', threadId)
        .eq('user_id', userId)
        .single();

      if (existing) {
        // Remove bookmark
        const { error: deleteError } = await supabaseAdmin
          .from('forum_bookmarks')
          .delete()
          .eq('thread_id', threadId)
          .eq('user_id', userId);

        if (deleteError) {
          console.error('❌ Failed to remove bookmark:', deleteError);
          return res.status(500).json({
            success: false,
            error: 'Failed to remove bookmark',
          });
        }

        console.log('✅ Removed bookmark:', threadId);
        return res.json({
          success: true,
          data: { bookmarked: false, message: 'Bookmark removed' },
        });
      }

      // Add bookmark
      const { error: insertError } = await supabaseAdmin
        .from('forum_bookmarks')
        .insert({
          thread_id: threadId,
          user_id: userId,
        });

      if (insertError) {
        console.error('❌ Failed to add bookmark:', insertError);
        return res.status(500).json({
          success: false,
          error: 'Failed to add bookmark',
        });
      }

      console.log('✅ Added bookmark:', threadId);
      res.json({
        success: true,
        data: { bookmarked: true, message: 'Thread bookmarked' },
      });
    } catch (error) {
      console.error('❌ Bookmark error:', error);
      logger.error('Bookmark error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/forum/bookmarks
 * Get user's bookmarked threads
 */
router.get(
  '/bookmarks',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;

      console.log('🔵 GET /bookmarks - User:', userId);

      const { data: bookmarks, error } = await supabaseAdmin
        .from('forum_bookmarks')
        .select(`
          id,
          created_at,
          thread:thread_id (
            id,
            title,
            content,
            created_at,
            updated_at,
            is_pinned,
            is_locked,
            views_count,
            board:board_id (
              id,
              name
            ),
            author:author_id (
              id,
              full_name,
              avatar_url
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Failed to fetch bookmarks:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch bookmarks',
        });
      }

      console.log('✅ Fetched bookmarks:', bookmarks?.length || 0);
      res.json({
        success: true,
        data: bookmarks || [],
      });
    } catch (error) {
      console.error('❌ Get bookmarks error:', error);
      logger.error('Get bookmarks error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

export default router;
