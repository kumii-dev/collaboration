-- =====================================================
-- FEATURED EVENTS
-- Adds is_featured flag to community_events so
-- admins can surface selected events on the
-- Communities (Forum) landing page.
-- =====================================================

ALTER TABLE community_events
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_community_events_featured
  ON community_events (is_featured)
  WHERE is_featured = TRUE;

COMMENT ON COLUMN community_events.is_featured IS
  'When TRUE the event is surfaced on the Communities landing page. Only admins may set this flag.';
