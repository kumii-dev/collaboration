-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 011: Boardrooms
-- Adds boardrooms and bookings tables for the "22 On Sloane" community.
-- Run this in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extend notification_type enum ───────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'boardroom_booking_confirmed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'boardroom_booking_cancelled';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'boardroom_reminder';

-- 2. Boardrooms table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boardrooms (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  capacity     INT         NOT NULL DEFAULT 10,
  amenities    TEXT[]      NOT NULL DEFAULT '{}',
  image_url    TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Boardroom bookings table ─────────────────────────────────────────────────
-- slot_start : exact hour boundary in UTC (e.g. 2024-06-10T06:00:00Z = 08:00 SAST)
-- slot_end   : computed column = slot_start + 1 hour
-- status     : 'confirmed' | 'cancelled'
CREATE TABLE IF NOT EXISTS boardroom_bookings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boardroom_id    UUID        NOT NULL REFERENCES boardrooms(id)  ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  slot_start      TIMESTAMPTZ NOT NULL,
  slot_end        TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'confirmed'
                                CHECK (status IN ('confirmed', 'cancelled')),
  notes           TEXT,
  cancelled_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- slot_end must equal slot_start + 1 hour
ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_end
    CHECK (slot_end = slot_start + INTERVAL '1 hour');

-- Slot must be on the hour (no minutes/seconds)
ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_minute
    CHECK (EXTRACT(MINUTE FROM slot_start) = 0 AND EXTRACT(SECOND FROM slot_start) = 0);

-- Slot must be Mon–Fri 08:00–16:00 SAST (last slot starts 16:00, ends 17:00)
ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_hour
    CHECK (EXTRACT(HOUR FROM slot_start AT TIME ZONE 'Africa/Johannesburg') BETWEEN 8 AND 16);

ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_dow
    CHECK (EXTRACT(DOW FROM (slot_start AT TIME ZONE 'Africa/Johannesburg')) BETWEEN 1 AND 5);

-- Partial unique index: only one confirmed booking per room per slot
CREATE UNIQUE INDEX IF NOT EXISTS boardroom_bookings_confirmed_unique
  ON boardroom_bookings (boardroom_id, slot_start)
  WHERE status = 'confirmed';

-- 4. Notification-dedup table (prevents duplicate reminders) ─────────────────
CREATE TABLE IF NOT EXISTS boardroom_booking_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID        NOT NULL REFERENCES boardroom_bookings(id) ON DELETE CASCADE,
  alert_type  TEXT        NOT NULL CHECK (alert_type IN ('60min', '30min')),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, alert_type)
);

-- 5. Updated-at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boardrooms_updated_at      ON boardrooms;
DROP TRIGGER IF EXISTS boardroom_bookings_updated_at ON boardroom_bookings;

CREATE TRIGGER boardrooms_updated_at
  BEFORE UPDATE ON boardrooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER boardroom_bookings_updated_at
  BEFORE UPDATE ON boardroom_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Row-Level Security ───────────────────────────────────────────────────────
ALTER TABLE boardrooms                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE boardroom_bookings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE boardroom_booking_notifications ENABLE ROW LEVEL SECURITY;

-- The API uses the service-role key (bypasses RLS entirely).
-- These policies cover direct client access only.

DROP POLICY IF EXISTS "boardrooms_select"      ON boardrooms;
DROP POLICY IF EXISTS "boardrooms_insert"      ON boardrooms;
DROP POLICY IF EXISTS "boardrooms_update"      ON boardrooms;
DROP POLICY IF EXISTS "boardrooms_delete"      ON boardrooms;
DROP POLICY IF EXISTS "bookings_select_own"    ON boardroom_bookings;
DROP POLICY IF EXISTS "bookings_insert"        ON boardroom_bookings;
DROP POLICY IF EXISTS "bookings_update"        ON boardroom_bookings;
DROP POLICY IF EXISTS "notif_dedup_select"     ON boardroom_booking_notifications;

-- Anyone authenticated can read active rooms
CREATE POLICY "boardrooms_select" ON boardrooms
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Admin/moderator can write
CREATE POLICY "boardrooms_insert" ON boardrooms
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
  );

CREATE POLICY "boardrooms_update" ON boardrooms
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
  );

CREATE POLICY "boardrooms_delete" ON boardrooms
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
  );

-- Users see own bookings; admins/mods see all
CREATE POLICY "bookings_select_own" ON boardroom_bookings
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
  );

CREATE POLICY "bookings_insert" ON boardroom_bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookings_update" ON boardroom_bookings
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
  );

CREATE POLICY "notif_dedup_select" ON boardroom_booking_notifications
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 7. Reminder function (called by the API on a Node.js interval) ─────────────
-- pg_cron is not available on all Supabase plans.
-- Instead, the Express API calls this function every minute via setInterval.
CREATE OR REPLACE FUNCTION send_boardroom_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r          RECORD;
  alert_type TEXT;
BEGIN
  FOR r IN
    SELECT
      b.id         AS booking_id,
      b.user_id,
      b.slot_start,
      br.name      AS room_name,
      CASE
        WHEN b.slot_start BETWEEN now() + INTERVAL '58 minutes'
                          AND     now() + INTERVAL '62 minutes' THEN '60min'
        WHEN b.slot_start BETWEEN now() + INTERVAL '28 minutes'
                          AND     now() + INTERVAL '32 minutes' THEN '30min'
        ELSE NULL
      END          AS alert_type
    FROM  boardroom_bookings b
    JOIN  boardrooms         br ON br.id = b.boardroom_id
    WHERE b.status = 'confirmed'
      AND b.slot_start > now()
      AND b.slot_start < now() + INTERVAL '63 minutes'
  LOOP
    CONTINUE WHEN r.alert_type IS NULL;

    -- Skip if already sent
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM boardroom_booking_notifications
       WHERE booking_id = r.booking_id AND alert_type = r.alert_type
    );

    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      r.user_id,
      'boardroom_reminder',
      CASE r.alert_type
        WHEN '60min' THEN 'Boardroom in 1 hour'
        ELSE              'Boardroom in 30 minutes'
      END,
      'Your booking for ' || r.room_name || ' starts at '
        || to_char(r.slot_start AT TIME ZONE 'Africa/Johannesburg', 'HH24:MI') || ' SAST.',
      jsonb_build_object(
        'booking_id', r.booking_id,
        'room_name',  r.room_name,
        'slot_start', r.slot_start
      )
    );

    INSERT INTO boardroom_booking_notifications (booking_id, alert_type)
    VALUES (r.booking_id, r.alert_type)
    ON CONFLICT (booking_id, alert_type) DO NOTHING;
  END LOOP;
END;
$$;
