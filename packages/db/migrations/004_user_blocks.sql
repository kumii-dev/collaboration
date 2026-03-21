-- =====================================================
-- USER BLOCKS TABLE
-- Allows users to block each other. A blocked user
-- cannot send DMs to the blocker and is hidden from
-- search results for the blocker.
-- =====================================================

CREATE TABLE IF NOT EXISTS user_blocks (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id),
    UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_id);

-- Enable RLS
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Users can view their own block list
CREATE POLICY "user_blocks_select_own"
    ON user_blocks FOR SELECT
    USING (blocker_id = auth.uid());

-- Users can block others
CREATE POLICY "user_blocks_insert_own"
    ON user_blocks FOR INSERT
    WITH CHECK (blocker_id = auth.uid());

-- Users can unblock (delete their own blocks)
CREATE POLICY "user_blocks_delete_own"
    ON user_blocks FOR DELETE
    USING (blocker_id = auth.uid());
