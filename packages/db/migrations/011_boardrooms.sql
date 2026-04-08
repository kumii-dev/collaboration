-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 011: Boardrooms
-- Adds boardrooms and bookings tables for the "22 On Sloane" community.
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
  created_by   UUID        NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Boardroom bookings table ─────────────────────────────────────────────────
-- slot_start: exact hour boundary (e.g. 2024-06-10T08:00:00+02:00)
-- slot_end  : always slot_start + 1 hour (enforced by CHECK)
-- Valid hours: 08:00 – 16:00 SAST → UTC 06:00 – 14:00 (UTC+2)
-- Valid days : Monday–Friday (DOW 1–5)
-- Status     : 'confirmed' | 'cancelled'
CREATE TABLE IF NOT EXISTS boardroom_bookings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boardroom_id    UUID        NOT NULL REFERENCES boardrooms(id)  ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  slot_start      TIMESTAMPTZ NOT NULL,
  slot_end        TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (slot_start + INTERVAL '1 hour') STORED,
  status          TEXT        NOT NULL DEFAULT 'confirmed'
                                CHECK (status IN ('confirmed', 'cancelled')),
  notes           TEXT,
  cancelled_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No two confirmed bookings for the same room at the same time
  CONSTRAINT unique_confirmed_slot UNIQUE NULLS NOT DISTINCT (boardroom_id, slot_start)
    DEFERRABLE INITIALLY DEFERRED
);

-- Partial unique index so cancelled bookings do not block re-booking
CREATE UNIQUE INDEX IF NOT EXISTS boardroom_bookings_confirmed_unique
  ON boardroom_bookings (boardroom_id, slot_start)
  WHERE status = 'confirmed';

-- Slot-time business-rule checks (SAST = UTC+2)
-- Hour check:  08:00–16:00 SAST → UTC hour 6–14
-- DOW  check:  Monday(1)–Friday(5) in UTC (good enough for SAST which is UTC+2)
ALTER TABLE boardroom_bookings
  ADD CONSTRAINT chk_slot_hour
    CHECK (EXTRACT(HOUR FROM slot_start AT TIME ZONE 'Africa/Johannesburg') BETWEEN 8 AND 16),
  ADD CONSTRAINT chk_slot_dow
    CHECK (EXTRACT(DOW FROM slot_start AT TIME ZONE 'Africa/Johannesburg') BETWEEN 1 AND 5),
  ADD CONSTRAINT chk_slot_minute
    CHECK (EXTRACT(MINUTE FROM slot_start) = 0 AND EXTRACT(SECOND FROM slot_start) = 0);

-- 4. Notification-dedup table (prevents re-sending reminders) ────────────────
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

CREATE OR REPLACE TRIGGER boardrooms_updated_at
  BEFORE UPDATE ON boardrooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER boardroom_bookings_updated_at
  BEFORE UPDATE ON boardroom_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Row-Level Security ───────────────────────────────────────────────────────
ALTER TABLE boardrooms                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE boardroom_bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE boardroom_booking_notifications ENABLE ROW LEVEL SECURITY;

-- boardrooms: anyone authenticated can read active rooms
CREATE POLICY "boardrooms_select" ON boardrooms
  FOR SELECT USING (is_active = true);

-- boardrooms: service role / admin only for insert/update/delete
-- (API enforces this via requireAdmin middleware — RLS just adds a safety net)
CREATE POLICY "boardrooms_insert" ON boardrooms
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "boardrooms_update" ON boardrooms
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "boardrooms_delete" ON boardrooms
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- boardroom_bookings: users can see their own bookings; admins see all
CREATE POLICY "bookings_select_own" ON boardroom_bookings
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

CREATE POLICY "bookings_insert" ON boardroom_bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookings_update" ON boardroom_bookings
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- notification dedup: service role only (API manages this)
CREATE POLICY "notif_dedup_select" ON boardroom_booking_notifications
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 7. pg_cron: reminder job ────────────────────────────────────────────────────
-- Runs every minute. Inserts notifications for bookings starting in ~60 or ~30 min.
-- The boardroom_booking_notifications dedup table prevents double-sends.

SELECT cron.schedule(
  'boardroom-reminders',          -- job name
  '* * * * *',                    -- every minute
  $$
  DO $$
  DECLARE
    r RECORD;
    alert TEXT;
  BEGIN
    FOR r IN
      SELECT
        b.id            AS booking_id,
        b.user_id,
        b.slot_start,
        br.name         AS room_name,
        CASE
          WHEN b.slot_start BETWEEN now() + INTERVAL '58 minutes'
                            AND     now() + INTERVAL '62 minutes' THEN '60min'
          WHEN b.slot_start BETWEEN now() + INTERVAL '28 minutes'
                            AND     now() + INTERVAL '32 minutes' THEN '30min'
        END             AS alert_type
      FROM boardroom_bookings b
      JOIN boardrooms         br ON br.id = b.boardroom_id
      WHERE b.status = 'confirmed'
        AND b.slot_start > now()
        AND b.slot_start < now() + INTERVAL '63 minutes'
    LOOP
      -- skip if already sent
      IF r.alert_type IS NULL THEN CONTINUE; END IF;
      IF EXISTS (
        SELECT 1 FROM boardroom_booking_notifications
         WHERE booking_id = r.booking_id AND alert_type = r.alert_type
      ) THEN CONTINUE; END IF;

      -- insert notification
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (
        r.user_id,
        'boardroom_reminder',
        CASE r.alert_type
          WHEN '60min' THEN 'Boardroom in 1 hour'
          ELSE              'Boardroom in 30 minutes'
        END,
        'Your booking for ' || r.room_name || ' starts at '
          || TO_CHAR(r.slot_start AT TIME ZONE 'Africa/Johannesburg', 'HH24:MI') || ' SAST.',
        jsonb_build_object('booking_id', r.booking_id, 'room_name', r.room_name, 'slot_start', r.slot_start)
      );

      -- mark as sent
      INSERT INTO boardroom_booking_notifications (booking_id, alert_type)
      VALUES (r.booking_id, r.alert_type)
      ON CONFLICT (booking_id, alert_type) DO NOTHING;
    END LOOP;
  END;
  $$ LANGUAGE plpgsql;
  $$
);
