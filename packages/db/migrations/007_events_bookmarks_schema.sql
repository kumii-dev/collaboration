-- =====================================================
-- Migration 007: Community Events, Forum Bookmarks,
--               and missing column additions
--
-- Adds tables/columns that the API routes already
-- reference but were never in a versioned migration.
-- Safe to run multiple times (IF NOT EXISTS / DO blocks).
-- =====================================================

-- ── 1. community_events ──────────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_events_category   ON community_events(category_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at  ON community_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON community_events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_active     ON community_events(starts_at) WHERE is_cancelled = false;

-- ── 2. community_event_rsvps ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_event_rsvps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  status     TEXT        NOT NULL CHECK (status IN ('going', 'interested', 'not_going')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rsvps_event  ON community_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user   ON community_event_rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_status ON community_event_rsvps(event_id, status);

-- ── 3. event_reminders ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_reminders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  remind_at  TIMESTAMPTZ NOT NULL,
  sent       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reminders_due  ON event_reminders(remind_at) WHERE sent = false;
CREATE INDEX IF NOT EXISTS idx_reminders_user ON event_reminders(user_id);

-- ── 4. forum_bookmarks ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forum_bookmarks (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID        NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user   ON forum_bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_thread ON forum_bookmarks(thread_id);

-- ── 5. forum_posts.is_solution (missing column) ───────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'forum_posts' AND column_name = 'is_solution'
  ) THEN
    ALTER TABLE forum_posts ADD COLUMN is_solution BOOLEAN NOT NULL DEFAULT false;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_forum_posts_solution ON forum_posts(thread_id) WHERE is_solution = true;

-- ── 6. moderation_actions.metadata (missing column) ──────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'moderation_actions' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE moderation_actions ADD COLUMN metadata JSONB;
  END IF;
END;
$$;

-- ── 7. profiles.location (missing column) ─────────────────────────────────────
-- profiles.phone was added in 005; location was not.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'location'
  ) THEN
    ALTER TABLE profiles ADD COLUMN location TEXT;
  END IF;
END;
$$;

-- ── 8. updated_at triggers for new tables ────────────────────────────────────

-- Reuse the existing update_updated_at_column() function from migration 001.

DROP TRIGGER IF EXISTS community_events_updated_at     ON community_events;
DROP TRIGGER IF EXISTS community_event_rsvps_updated_at ON community_event_rsvps;

CREATE TRIGGER community_events_updated_at
  BEFORE UPDATE ON community_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER community_event_rsvps_updated_at
  BEFORE UPDATE ON community_event_rsvps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 9. RLS policies ───────────────────────────────────────────────────────────

ALTER TABLE community_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_reminders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_bookmarks       ENABLE ROW LEVEL SECURITY;

-- community_events: anyone authenticated can read; only creator can insert/update/delete
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='community_events' AND policyname='events_read') THEN
    CREATE POLICY "events_read"   ON community_events FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='community_events' AND policyname='events_insert') THEN
    CREATE POLICY "events_insert" ON community_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='community_events' AND policyname='events_update') THEN
    CREATE POLICY "events_update" ON community_events FOR UPDATE TO authenticated USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='community_events' AND policyname='events_delete') THEN
    CREATE POLICY "events_delete" ON community_events FOR DELETE TO authenticated USING (auth.uid() = created_by);
  END IF;
END; $$;

-- community_event_rsvps: users manage their own RSVPs; all authenticated users can read
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='community_event_rsvps' AND policyname='rsvps_read') THEN
    CREATE POLICY "rsvps_read"   ON community_event_rsvps FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='community_event_rsvps' AND policyname='rsvps_insert') THEN
    CREATE POLICY "rsvps_insert" ON community_event_rsvps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='community_event_rsvps' AND policyname='rsvps_update') THEN
    CREATE POLICY "rsvps_update" ON community_event_rsvps FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='community_event_rsvps' AND policyname='rsvps_delete') THEN
    CREATE POLICY "rsvps_delete" ON community_event_rsvps FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END; $$;

-- event_reminders: users manage their own reminders only
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_reminders' AND policyname='reminders_own') THEN
    CREATE POLICY "reminders_own" ON event_reminders FOR ALL TO authenticated USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END; $$;

-- forum_bookmarks: users manage their own bookmarks only
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='forum_bookmarks' AND policyname='bookmarks_own') THEN
    CREATE POLICY "bookmarks_own" ON forum_bookmarks FOR ALL TO authenticated USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END; $$;
