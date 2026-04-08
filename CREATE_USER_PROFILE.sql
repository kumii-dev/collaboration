-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 of 2: Create missing admin profile
-- Run this FIRST in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO profiles (id, email, role)
SELECT
  id,
  email,
  'admin'
FROM auth.users
WHERE id = '849f6bba-9224-45d7-a889-a94d2e1d5d64'
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Verify:
SELECT id, email, role FROM profiles WHERE id = '849f6bba-9224-45d7-a889-a94d2e1d5d64';
