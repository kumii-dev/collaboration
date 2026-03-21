-- Migration 005: Add phone column to profiles table
-- Sprint 5 code already syncs/stores phone from Lovable and PATCH /me accepts it;
-- this migration adds the actual column so writes no longer fail silently.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Useful for fast lookup by phone if needed (e.g. deduplication checks)
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles (phone)
  WHERE phone IS NOT NULL;
