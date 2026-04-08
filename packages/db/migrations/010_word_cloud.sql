-- =====================================================
-- WORD CLOUD AGGREGATES
-- Stores per-context cumulative word frequency counts.
-- context_id = forum category slug (e.g. 'sloane-connect')
--              or community_event UUID for event-based clouds.
-- =====================================================

CREATE TABLE IF NOT EXISTS word_cloud_aggregates (
  id          BIGSERIAL PRIMARY KEY,
  context_id  TEXT        NOT NULL,           -- category slug or event id
  word        TEXT        NOT NULL,
  count       INTEGER     NOT NULL DEFAULT 1  CHECK (count > 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (context_id, word)
);

CREATE INDEX IF NOT EXISTS idx_wca_context_id
  ON word_cloud_aggregates (context_id);

-- RLS: readable by any authenticated user; never writable directly
ALTER TABLE word_cloud_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wca_select_authenticated"
  ON word_cloud_aggregates
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — all writes go through the API
-- (service role key bypasses RLS anyway, but this documents intent)

COMMENT ON TABLE word_cloud_aggregates IS
  'Cumulative word frequency counts per community / event context.
   Writes are handled exclusively by the API using the service-role key.';
