-- Migration 008: find_direct_conversation RPC + reports dismissed status guard
-- Idempotent — safe to run multiple times.

-- ── 1. Create the find_direct_conversation RPC ──────────────────────────────
-- Returns the conversation row when a direct conversation already exists
-- between two users (both active, i.e. neither has left_at set).
-- Called by POST /api/chat/conversations before creating a new one.

CREATE OR REPLACE FUNCTION find_direct_conversation(
  user1_id uuid,
  user2_id uuid
)
RETURNS TABLE (
  id               uuid,
  type             text,
  name             text,
  created_at       timestamptz,
  updated_at       timestamptz,
  last_message_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.type,
    c.name,
    c.created_at,
    c.updated_at,
    c.last_message_at
  FROM conversations c
  -- Both users must be active (non-left) participants
  JOIN conversation_participants cp1
    ON cp1.conversation_id = c.id
   AND cp1.user_id = user1_id
   AND cp1.left_at IS NULL
  JOIN conversation_participants cp2
    ON cp2.conversation_id = c.id
   AND cp2.user_id = user2_id
   AND cp2.left_at IS NULL
  WHERE c.type = 'direct'
  -- Ensure it is truly a 1-to-1 conversation (exactly 2 active participants)
  AND (
    SELECT COUNT(*)
    FROM conversation_participants cp3
    WHERE cp3.conversation_id = c.id
      AND cp3.left_at IS NULL
  ) = 2
  LIMIT 1;
$$;

-- Grant execute to the service role (used by the API via supabaseAdmin)
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION find_direct_conversation(uuid, uuid)
    TO service_role;
EXCEPTION WHEN others THEN
  -- GRANT may already exist; ignore
  NULL;
END;
$$;

-- ── 2. Ensure reports.status allows 'dismissed' ─────────────────────────────
-- The application sets status = 'dismissed' via PATCH /reports/:id/dismiss.
-- If reports.status is an enum type, add the value; if it's a plain varchar
-- then this is a no-op guard.
DO $$
BEGIN
  -- Only relevant when status is an enum column
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'report_status'
  ) THEN
    -- Add 'dismissed' if not already present
    BEGIN
      ALTER TYPE report_status ADD VALUE IF NOT EXISTS 'dismissed';
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END;
$$;

-- ── 3. Add reviewed_by / reviewed_at columns to reports if missing ───────────
-- These columns are referenced in PATCH /resolve and PATCH /dismiss.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS reviewed_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS notes         text;
