-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012: Boardroom booking approval workflow
-- Adds payment-proof upload + admin approve/reject flow.
-- Run this in the Supabase SQL Editor AFTER 011_boardrooms.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extend notification_type enum ───────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'boardroom_payment_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'boardroom_booking_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'boardroom_booking_awaiting_approval';

-- 2. Extend boardroom_bookings with approval columns ─────────────────────────
ALTER TABLE boardroom_bookings
  ADD COLUMN IF NOT EXISTS payment_proof_url      TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference      TEXT,
  ADD COLUMN IF NOT EXISTS payment_submitted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason       TEXT;

-- 3. Widen the status CHECK to include new states ────────────────────────────
--    existing check: status IN ('confirmed','cancelled')
--    new states: 'pending' | 'awaiting_approval' | 'confirmed' | 'rejected' | 'cancelled'
ALTER TABLE boardroom_bookings DROP CONSTRAINT IF EXISTS boardroom_bookings_status_check;
ALTER TABLE boardroom_bookings
  ADD CONSTRAINT boardroom_bookings_status_check
    CHECK (status IN ('pending','awaiting_approval','confirmed','rejected','cancelled'));

-- 4. Update the slot-uniqueness index ────────────────────────────────────────
--    Only 'awaiting_approval' and 'confirmed' bookings hold a slot.
--    'pending' does NOT hold the slot (user hasn't paid yet).
DROP INDEX IF EXISTS boardroom_bookings_confirmed_unique;
CREATE UNIQUE INDEX IF NOT EXISTS boardroom_bookings_active_unique
  ON boardroom_bookings (boardroom_id, slot_start)
  WHERE status IN ('awaiting_approval', 'confirmed');

-- 5. Notify admins function ──────────────────────────────────────────────────
--    Called by the API after a booking request or payment submission.
CREATE OR REPLACE FUNCTION notify_admins_boardroom(
  p_type    TEXT,
  p_title   TEXT,
  p_message TEXT,
  p_data    JSONB
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, data)
  SELECT id, p_type, p_title, p_message, p_data
  FROM   profiles
  WHERE  role IN ('admin', 'moderator')
    AND  archived IS NOT TRUE;
END;
$$;

-- 6. Updated-at trigger already exists from 011 — no changes needed ──────────
