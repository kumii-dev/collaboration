-- Migration 006: Add conversation_id to groups for group messaging
-- Each group lazily creates a linked group conversation.
-- Sprint 6 adds POST/GET /api/groups/:id/messages which use this link.

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_groups_conversation_id ON groups (conversation_id)
  WHERE conversation_id IS NOT NULL;
