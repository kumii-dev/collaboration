-- ============================================================
-- Community Events & RSVP Migration
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. community_events
CREATE TABLE IF NOT EXISTS community_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id    UUID        NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT,
  location       TEXT,
  meeting_url    TEXT,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ,
  max_attendees  INT,
  is_online      BOOLEAN     NOT NULL DEFAULT false,
  is_cancelled   BOOLEAN     NOT NULL DEFAULT false,
  created_by     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. community_event_rsvps
CREATE TABLE IF NOT EXISTS community_event_rsvps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  status     TEXT        NOT NULL CHECK (status IN ('going','interested','not_going')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

-- 3. event_reminders
CREATE TABLE IF NOT EXISTS event_reminders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  remind_at  TIMESTAMPTZ NOT NULL,
  sent       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_events_category   ON community_events(category_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at  ON community_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON community_events(created_by);
CREATE INDEX IF NOT EXISTS idx_rsvps_event       ON community_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user        ON community_event_rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due     ON event_reminders(remind_at) WHERE sent = false;

-- 5. updated_at auto-trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS community_events_updated_at    ON community_events;
DROP TRIGGER IF EXISTS community_event_rsvps_updated_at ON community_event_rsvps;

CREATE TRIGGER community_events_updated_at
  BEFORE UPDATE ON community_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER community_event_rsvps_updated_at
  BEFORE UPDATE ON community_event_rsvps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. RLS
ALTER TABLE community_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_reminders       ENABLE ROW LEVEL SECURITY;

-- community_events policies
CREATE POLICY "events_read"   ON community_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "events_insert" ON community_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "events_update" ON community_events FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "events_delete" ON community_events FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- community_event_rsvps policies
CREATE POLICY "rsvps_read"   ON community_event_rsvps FOR SELECT TO authenticated USING (true);
CREATE POLICY "rsvps_insert" ON community_event_rsvps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rsvps_update" ON community_event_rsvps FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "rsvps_delete" ON community_event_rsvps FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- event_reminders policies
CREATE POLICY "reminders_read"   ON event_reminders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "reminders_insert" ON event_reminders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reminders_delete" ON event_reminders FOR DELETE TO authenticated USING (auth.uid() = user_id);
