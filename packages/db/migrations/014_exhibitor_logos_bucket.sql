-- Migration: create public storage bucket for exhibitor logos
-- Run this in the Supabase SQL editor (requires service-role / admin privileges)

-- 1. Create the bucket (public = true means files are readable without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exhibitor-logos',
  'exhibitor-logos',
  true,
  5242880,   -- 5 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Public read — anyone can view exhibitor logos
CREATE POLICY "exhibitor_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exhibitor-logos');

-- 3. Authenticated upload — any logged-in user can upload
CREATE POLICY "exhibitor_logos_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'exhibitor-logos');

-- 4. Owner or admin can update their own uploads
CREATE POLICY "exhibitor_logos_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'exhibitor-logos' AND owner = auth.uid());

-- 5. Owner or admin can delete
CREATE POLICY "exhibitor_logos_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'exhibitor-logos' AND owner = auth.uid());
