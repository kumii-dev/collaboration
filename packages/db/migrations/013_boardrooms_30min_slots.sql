-- Migration 013: Update boardroom booking constraints for 30-minute time slots
-- Previously constraints enforced 1-hour slots starting on the hour only.
-- Now slots are 30 minutes and can start on the hour OR half-hour.

-- 1. Drop old constraints FIRST (before any UPDATE, so DML isn't blocked)
ALTER TABLE boardroom_bookings DROP CONSTRAINT IF EXISTS chk_slot_end;
ALTER TABLE boardroom_bookings DROP CONSTRAINT IF EXISTS chk_slot_minute;
ALTER TABLE boardroom_bookings DROP CONSTRAINT IF EXISTS chk_slot_hour;

-- 2. Recompute slot_end for ALL rows from slot_start (now unconstrained)
--    Eliminates 1-hour rows and any sub-second precision mismatch.
UPDATE boardroom_bookings
SET slot_end = slot_start + INTERVAL '30 minutes';

-- 3. Add new constraints for 30-min slots
ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_end
    CHECK (slot_end = slot_start + INTERVAL '30 minutes');

ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_minute
    CHECK (
      EXTRACT(MINUTE FROM slot_start) IN (0, 30)
      AND EXTRACT(SECOND FROM slot_start) = 0
    );

ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_hour
    CHECK (
      EXTRACT(HOUR FROM slot_start AT TIME ZONE 'Africa/Johannesburg') BETWEEN 8 AND 16
    );
