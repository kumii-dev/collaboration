-- Migration 013: Update boardroom booking constraints for 30-minute time slots
-- Previously constraints enforced 1-hour slots starting on the hour only.
-- Now slots are 30 minutes and can start on the hour OR half-hour.

-- 0. Recompute slot_end for ALL rows from slot_start to eliminate any
--    sub-second precision mismatch introduced by JavaScript Date.toISOString().
--    This covers rows already at 30 min, rows at 1 hour, and any other duration.
UPDATE boardroom_bookings
SET slot_end = slot_start + INTERVAL '30 minutes';

-- 1. Drop old constraints
ALTER TABLE boardroom_bookings DROP CONSTRAINT IF EXISTS chk_slot_end;
ALTER TABLE boardroom_bookings DROP CONSTRAINT IF EXISTS chk_slot_minute;
ALTER TABLE boardroom_bookings DROP CONSTRAINT IF EXISTS chk_slot_hour;

-- 2. slot_end must equal slot_start + 30 minutes
ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_end
    CHECK (slot_end = slot_start + INTERVAL '30 minutes');

-- 3. Slot must start on the hour or half-hour (0 or 30 minutes, 0 seconds)
ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_minute
    CHECK (
      EXTRACT(MINUTE FROM slot_start) IN (0, 30)
      AND EXTRACT(SECOND FROM slot_start) = 0
    );

-- 4. Slot must be Mon–Fri 08:00–16:30 SAST
--    Last valid start is 16:30, so hour ≤ 16, and if hour = 16 then minute ≤ 30
ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_hour
    CHECK (
      EXTRACT(HOUR FROM slot_start AT TIME ZONE 'Africa/Johannesburg') BETWEEN 8 AND 16
    );
