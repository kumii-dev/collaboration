import OpenAI from 'openai';
import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';
import { sendEmail } from './email.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ModerationContentType = 'thread' | 'post' | 'message';

export interface ModerationTarget {
  /** Which kind of content is being moderated */
  type: ModerationContentType;
  /** The UUID of the content row (thread / forum_post / message) */
  id: string;
  /** Plain-text or HTML content to send to the moderation API */
  content: string;
  /** UUID of the user who authored the content */
  authorId: string;
}

/**
 * Run OpenAI content moderation on a piece of user content.
 * If flagged:
 *  1. Creates a row in the `reports` table (status = 'pending')
 *  2. Emails all moderators / admins
 *
 * This function never throws — all errors are logged and swallowed so callers
 * can fire-and-forget inside a setImmediate block.
 */
export async function runAIModeration(target: ModerationTarget): Promise<void> {
  try {
    const response = await openai.moderations.create({ input: target.content });
    const result = response.results[0];

    if (!result.flagged) return;

    // Build a human-readable summary of triggered categories
    const flaggedCategories = (
      Object.entries(result.categories) as [string, boolean][]
    )
      .filter(([, flagged]) => flagged)
      .map(([category]) => category)
      .join(', ');

    // Build category score summary (round to 4 dp for readability)
    const scoresSummary = Object.fromEntries(
      (Object.entries(result.category_scores) as [string, number][]).map(
        ([k, v]) => [k, Math.round(v * 10000) / 10000]
      )
    );

    const reason = `[AI] Flagged: ${flaggedCategories}. Scores: ${JSON.stringify(scoresSummary)}`;

    // Map content type to the valid report_type enum value
    // Note: the DB enum is ('message', 'post', 'user', 'group') — no 'thread'
    const reportType = target.type === 'message' ? 'message' : 'post';

    const insertPayload: Record<string, unknown> = {
      reporter_id: target.authorId,
      reported_user_id: target.authorId,
      report_type: reportType,
      reason,
      status: 'pending',
    };

    if (target.type === 'message') {
      insertPayload.message_id = target.id;
    } else if (target.type === 'post') {
      insertPayload.post_id = target.id;
    } else {
      // thread — store in thread_id column
      insertPayload.thread_id = target.id;
    }

    const { error: reportError } = await supabaseAdmin
      .from('reports')
      .insert(insertPayload);

    if (reportError) {
      logger.error('[AI moderation] failed to insert report', {
        err: reportError.message,
        target,
      });
    } else {
      logger.info('[AI moderation] report created', {
        type: target.type,
        id: target.id,
        categories: flaggedCategories,
      });
    }

    // Notify moderators / admins by email (best-effort)
    await notifyModerators(target, flaggedCategories);
  } catch (err) {
    logger.error('[AI moderation] unexpected error', {
      err: err instanceof Error ? err.message : String(err),
      target: { type: target.type, id: target.id },
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function notifyModerators(
  target: ModerationTarget,
  categories: string
): Promise<void> {
  try {
    const { data: mods } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .in('role', ['admin', 'moderator']);

    if (!mods?.length) return;

    const emails = mods
      .map((m) => m.email as string)
      .filter(Boolean);

    if (!emails.length) return;

    // Derive the production app URL from env — APP_URL wins, then CORS_ORIGIN
    // (if it isn't localhost), then fall back to the known production deployment.
    const origin =
      process.env.APP_URL ??
      (process.env.CORS_ORIGIN && !process.env.CORS_ORIGIN.includes('localhost')
        ? process.env.CORS_ORIGIN
        : null) ??
      'https://communities-ten.vercel.app';
    const dashUrl = `${origin}/moderation`;

    const preview = target.content.slice(0, 200);
    const truncated = target.content.length > 200 ? '…' : '';

    await sendEmail({
      to: emails,
      subject: `⚠️ AI flagged content — ${target.type}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto">
          <h2 style="color:#dc2626">⚠️ AI Moderation Alert</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:6px 0;font-weight:bold;width:120px">Content type</td>
              <td style="padding:6px 0">${target.type}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-weight:bold">Categories</td>
              <td style="padding:6px 0;color:#dc2626">${categories}</td>
            </tr>
          </table>
          <p style="margin:16px 0 4px;font-weight:bold">Content preview:</p>
          <blockquote style="margin:0;padding:12px;background:#f3f4f6;border-left:4px solid #dc2626;border-radius:4px;font-size:14px;color:#374151">
            ${preview}${truncated}
          </blockquote>
          <div style="margin-top:24px">
            <a href="${dashUrl}"
               style="background:#dc2626;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
              Review in Dashboard
            </a>
          </div>
          <p style="margin-top:24px;font-size:12px;color:#9ca3af">
            This alert was generated automatically. Do not reply to this email.
          </p>
        </div>
      `,
    });
  } catch (err) {
    logger.error('[AI moderation] failed to notify moderators', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
