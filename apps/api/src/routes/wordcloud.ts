import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import { containsProfanity, stripHtml } from '../utils/helpers.js';
import logger from '../logger.js';
import config from '../config.js';

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_WORD_LENGTH = 40;
const MAX_PHRASE_WORDS = 4;
const TOP_WORDS_LIMIT = 100;

/** Common English stopwords — single-word submissions only */
const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'it','its','this','that','these','those','i','we','you','he','she','they',
  'me','us','him','her','them','my','our','your','his','their','what','which',
  'who','whom','when','where','why','how','all','each','every','both','few',
  'more','most','other','some','such','no','nor','not','only','own','same',
  'so','than','too','very','just','can','now','then','here','there',
]);

// ── Validation schemas ────────────────────────────────────────────────────────

const contextIdSchema = z.object({
  contextId: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i, 'Invalid context ID'),
});

const submitSchema = z.object({
  word: z.string().min(1).max(100).trim(),
});

const listQuerySchema = z.object({
  limit: z.string().optional().transform(v => Math.min(Number(v) || TOP_WORDS_LIMIT, 200)),
});

// ── Per-user write rate limiter: 5 submissions / minute ──────────────────────

const keyByUser = (req: AuthRequest) =>
  req.user?.id ?? req.ip ?? 'unknown';

const submitLimiter = rateLimit({
  windowMs: 60 * 1_000,
  max: config.NODE_ENV === 'development' ? 500 : 5,
  keyGenerator: keyByUser as any,
  message: {
    success: false,
    error: 'Too many submissions. Please wait a moment before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── In-memory aggregation cache ───────────────────────────────────────────────
// Structure: Map<contextId, Map<word, count>>
// Hydrated lazily from DB on first access per context.
// Fire-and-forget DB upserts keep it persisted across restarts.

const aggregationCache = new Map<string, Map<string, number>>();

async function getCache(contextId: string): Promise<Map<string, number>> {
  if (aggregationCache.has(contextId)) {
    return aggregationCache.get(contextId)!;
  }

  // Hydrate from DB
  const { data, error } = await supabaseAdmin
    .from('word_cloud_aggregates')
    .select('word, count')
    .eq('context_id', contextId)
    .order('count', { ascending: false })
    .limit(TOP_WORDS_LIMIT);

  if (error) {
    logger.warn('wordcloud: failed to hydrate cache from DB', { contextId, error });
  }

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.word, row.count);
  }
  aggregationCache.set(contextId, map);
  return map;
}

async function incrementWord(contextId: string, word: string): Promise<number> {
  const cache = await getCache(contextId);
  const newCount = (cache.get(word) ?? 0) + 1;
  cache.set(word, newCount);

  // Upsert to DB — fire-and-forget, never blocks the response
  supabaseAdmin
    .from('word_cloud_aggregates')
    .upsert(
      { context_id: contextId, word, count: newCount, updated_at: new Date().toISOString() },
      { onConflict: 'context_id,word' }
    )
    .then(({ error }) => {
      if (error) {
        // On conflict the row may exist; fall back to raw increment
        if (error.code === '23505') {
          void supabaseAdmin
            .from('word_cloud_aggregates')
            .update({ count: newCount, updated_at: new Date().toISOString() })
            .eq('context_id', contextId)
            .eq('word', word);
        } else {
          logger.warn('wordcloud: upsert failed', { contextId, word, error });
        }
      }
    });

  return newCount;
}

function getTopWords(
  cache: Map<string, number>,
  limit: number
): { word: string; count: number }[] {
  return Array.from(cache.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ── Word normalisation ────────────────────────────────────────────────────────

/**
 * Normalise raw input:
 *   1. Strip all HTML tags (XSS protection)
 *   2. Lowercase + trim
 *   3. Remove punctuation except hyphens & apostrophes inside words
 *   4. Collapse whitespace
 *   5. Enforce max word length + phrase word count
 *   6. Filter single-word stopwords (multi-word phrases pass through)
 *   7. Profanity check via existing bad-words filter
 *
 * Returns null if the word should be rejected.
 */
function normaliseWord(raw: string): string | null {
  // 1. Strip HTML
  const stripped = stripHtml(raw).trim();
  if (!stripped) return null;

  // 2. Lowercase
  const lower = stripped.toLowerCase();

  // 3. Remove punctuation except internal hyphens/apostrophes
  const cleaned = lower
    .replace(/[^\w\s'-]/g, '')   // keep word-chars, spaces, hyphens, apostrophes
    .replace(/^['-]+|['-]+$/g, '') // strip leading/trailing hyphens & apostrophes
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  // 4. Length guard
  if (cleaned.length > MAX_WORD_LENGTH) return null;

  // 5. Phrase word count
  const parts = cleaned.split(' ');
  if (parts.length > MAX_PHRASE_WORDS) return null;

  // 6. Stopword filter (single words only — multi-word phrases are always allowed)
  if (parts.length === 1 && STOPWORDS.has(cleaned)) return null;

  // 7. Profanity
  if (containsProfanity(cleaned)) return null;

  return cleaned;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/wordcloud/:contextId
 * Returns aggregated word cloud for a context.
 * contextId = forum category slug (e.g. "sloane-connect") or an event id.
 */
router.get(
  '/:contextId',
  authenticate,
  validateParams(contextIdSchema),
  validateQuery(listQuerySchema),
  async (req: AuthRequest, res) => {
    try {
      const { contextId } = req.params;
      const limit = Number(req.query.limit) || TOP_WORDS_LIMIT;

      const cache = await getCache(contextId);
      const words = getTopWords(cache, limit);

      res.json({
        success: true,
        data: words,
        total: cache.size,
      });
    } catch (error) {
      logger.error('GET /wordcloud/:contextId error', { error });
      res.status(500).json({ success: false, error: 'Failed to fetch word cloud' });
    }
  }
);

/**
 * POST /api/wordcloud/:contextId/submit
 * Submit a word or short phrase.
 * Rate-limited: 5 per minute per authenticated user.
 */
router.post(
  '/:contextId/submit',
  authenticate,
  submitLimiter as any,
  validateParams(contextIdSchema),
  validateBody(submitSchema),
  async (req: AuthRequest, res) => {
    try {
      const { contextId } = req.params;
      const raw: string = req.body.word;

      const normalised = normaliseWord(raw);
      if (!normalised) {
        return res.status(400).json({
          success: false,
          error:
            'Word was filtered out. It may be too long, contain only stopwords, ' +
            'include invalid characters, or violate community guidelines.',
        });
      }

      const newCount = await incrementWord(contextId, normalised);

      // Broadcast real-time update via Supabase Realtime (broadcast channel)
      // Clients subscribe to channel `wordcloud:<contextId>` and listen for event `update`
      void supabaseAdmin.channel(`wordcloud:${contextId}`).send({
        type: 'broadcast',
        event: 'update',
        payload: { word: normalised, count: newCount },
      });

      return res.json({
        success: true,
        data: { word: normalised, count: newCount },
      });
    } catch (error) {
      logger.error('POST /wordcloud/:contextId/submit error', { error });
      res.status(500).json({ success: false, error: 'Submission failed. Please try again.' });
    }
  }
);

/**
 * DELETE /api/wordcloud/:contextId
 * Clear a context's word cloud. Admins only.
 */
router.delete(
  '/:contextId',
  authenticate,
  validateParams(contextIdSchema),
  async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin' && req.user?.role !== 'moderator') {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }

      const { contextId } = req.params;

      // Evict from memory cache
      aggregationCache.delete(contextId);

      // Delete from DB
      const { error } = await supabaseAdmin
        .from('word_cloud_aggregates')
        .delete()
        .eq('context_id', contextId);

      if (error) {
        logger.error('DELETE /wordcloud/:contextId DB error', { contextId, error });
        return res.status(500).json({ success: false, error: 'Failed to clear word cloud' });
      }

      // Broadcast reset
      void supabaseAdmin.channel(`wordcloud:${contextId}`).send({
        type: 'broadcast',
        event: 'reset',
        payload: {},
      });

      res.json({ success: true, data: { message: 'Word cloud cleared' } });
    } catch (error) {
      logger.error('DELETE /wordcloud/:contextId error', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
