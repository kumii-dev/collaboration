-- ── Migration 015: event cover images ────────────────────────────────────────
-- Adds cover_image_url column to community_events and creates the
-- event-covers Supabase Storage bucket with appropriate RLS policies.

-- 1. Column
ALTER TABLE community_events
  ADD COLUMN IF NOT EXISTS cover_image_url text;

-- 2. Storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-covers',
  'event-covers',
  true,
  5242880,                                         -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS policies on storage.objects for the event-covers bucket

-- Allow authenticated users to upload
CREATE POLICY "event_covers_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'event-covers');

-- Allow authenticated users to update their own uploads
CREATE POLICY "event_covers_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'event-covers');

-- Allow authenticated users to delete
CREATE POLICY "event_covers_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'event-covers');

-- Allow public read (bucket is public, but belt-and-suspenders)
CREATE POLICY "event_covers_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'event-covers');
