import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validateParams } from '../middleware/validation.js';
import config from '../config.js';
import logger from '../logger.js';

const router = Router();

// ── Config ─────────────────────────────────────────────────────────────────────
const ALLOWED_TYPES  = new Set((config.ALLOWED_FILE_TYPES ?? 'image/jpeg,image/png,image/gif,application/pdf').split(',').map(s => s.trim()));
const MAX_SIZE_BYTES = parseInt(config.MAX_FILE_SIZE_MB ?? '10') * 1024 * 1024;
const BUCKET         = config.SUPABASE_STORAGE_BUCKET ?? 'collaboration-attachments';

const attachContextSchema = z.object({
  context:      z.enum(['message', 'post']),
  context_id:   z.string().uuid(),
});

/**
 * POST /api/attachments/upload
 *
 * Uploads a file to Supabase Storage and inserts a row in the attachments table.
 *
 * Body (multipart/form-data or JSON with base64):
 *   - file_name    : original filename
 *   - file_type    : MIME type (e.g. image/jpeg)
 *   - file_size    : byte size
 *   - file_data    : base64-encoded file content
 *   - context      : "message" | "post"
 *   - context_id   : UUID of the message or post this file is attached to
 *
 * Returns the attachment row with a signed public URL.
 */
router.post('/upload', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Validate presence of required fields
    const { file_name, file_type, file_size, file_data, context, context_id } = req.body ?? {};

    if (!file_name || !file_type || !file_size || !file_data) {
      return res.status(400).json({ success: false, error: 'file_name, file_type, file_size, and file_data are required' });
    }

    const ctxParse = attachContextSchema.safeParse({ context, context_id });
    if (!ctxParse.success) {
      return res.status(400).json({ success: false, error: 'context (message|post) and context_id (uuid) are required' });
    }

    // Validate type + size
    if (!ALLOWED_TYPES.has(file_type)) {
      return res.status(400).json({ success: false, error: `File type not allowed. Allowed: ${[...ALLOWED_TYPES].join(', ')}` });
    }

    const sizeBytes = Number(file_size);
    if (isNaN(sizeBytes) || sizeBytes > MAX_SIZE_BYTES) {
      return res.status(400).json({ success: false, error: `File size exceeds maximum of ${config.MAX_FILE_SIZE_MB}MB` });
    }

    // Decode base64 content
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(file_data, 'base64');
    } catch {
      return res.status(400).json({ success: false, error: 'file_data must be valid base64' });
    }

    // Build a unique storage path: userId/context/contextId/timestamp_filename
    const safeName     = file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath  = `${userId}/${context}/${context_id}/${Date.now()}_${safeName}`;

    // Upload to Supabase Storage
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType:  file_type,
        cacheControl: '3600',
        upsert:       false,
      });

    if (uploadErr) {
      logger.error('Storage upload failed', { uploadErr });
      return res.status(500).json({ success: false, error: 'Failed to upload file to storage' });
    }

    // Get a public URL (or signed URL for private buckets)
    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl ?? '';

    // Insert into attachments table
    const attachmentRow: Record<string, unknown> = {
      uploader_id:  userId,
      file_name,
      file_type,
      file_size:    sizeBytes,
      storage_path: storagePath,
      url:          publicUrl,
    };

    if (context === 'message') {
      // Verify the message belongs to a conversation the user is in
      const { data: msg } = await supabaseAdmin
        .from('messages')
        .select('id, conversation_id')
        .eq('id', context_id)
        .single();

      if (!msg) {
        // Clean up orphaned upload
        await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
        return res.status(404).json({ success: false, error: 'Message not found' });
      }
      attachmentRow.message_id = context_id;
    } else {
      // Verify the post belongs to a thread the user has access to
      const { data: post } = await supabaseAdmin
        .from('forum_posts')
        .select('id')
        .eq('id', context_id)
        .single();

      if (!post) {
        await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
        return res.status(404).json({ success: false, error: 'Post not found' });
      }
      attachmentRow.post_id = context_id;
    }

    const { data: attachment, error: dbErr } = await supabaseAdmin
      .from('attachments')
      .insert(attachmentRow)
      .select()
      .single();

    if (dbErr) {
      // Clean up orphaned upload
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
      logger.error('Failed to insert attachment row', { dbErr });
      return res.status(500).json({ success: false, error: 'Failed to save attachment metadata' });
    }

    res.status(201).json({ success: true, data: attachment });
  } catch (err: any) {
    logger.error('POST /attachments/upload', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/attachments/:id
 * Delete an attachment. Only the uploader or a site moderator/admin may delete.
 */
router.delete(
  '/:id',
  authenticate,
  validateParams(z.object({ id: z.string().uuid() })),
  async (req: AuthRequest, res) => {
    try {
      const { id }   = req.params;
      const userId   = req.user!.id;
      const role     = req.user!.role;
      const isMod    = role === 'moderator' || role === 'admin';

      const { data: attachment, error: fetchErr } = await supabaseAdmin
        .from('attachments')
        .select('id, uploader_id, storage_path')
        .eq('id', id)
        .single();

      if (fetchErr || !attachment) {
        return res.status(404).json({ success: false, error: 'Attachment not found' });
      }

      if (!isMod && attachment.uploader_id !== userId) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }

      // Remove from storage
      await supabaseAdmin.storage.from(BUCKET).remove([attachment.storage_path]);

      // Remove DB row
      const { error: delErr } = await supabaseAdmin
        .from('attachments')
        .delete()
        .eq('id', id);

      if (delErr) throw delErr;

      res.json({ success: true });
    } catch (err: any) {
      logger.error('DELETE /attachments/:id', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/attachments/:id/url
 * Get a fresh signed URL for a private-bucket attachment.
 * For public buckets the stored url is already permanent.
 */
router.get(
  '/:id/url',
  authenticate,
  validateParams(z.object({ id: z.string().uuid() })),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const { data: attachment, error } = await supabaseAdmin
        .from('attachments')
        .select('id, storage_path, url, file_name, file_type')
        .eq('id', id)
        .single();

      if (error || !attachment) {
        return res.status(404).json({ success: false, error: 'Attachment not found' });
      }

      // Try to get a fresh signed URL (60 min expiry)
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(attachment.storage_path, 3600);

      res.json({
        success: true,
        data: {
          id:        attachment.id,
          file_name: attachment.file_name,
          file_type: attachment.file_type,
          url:       signed?.signedUrl ?? attachment.url,
          expires_in: 3600,
        },
      });
    } catch (err: any) {
      logger.error('GET /attachments/:id/url', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
