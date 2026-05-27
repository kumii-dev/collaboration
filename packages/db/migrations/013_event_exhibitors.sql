-- Migration: add exhibitors jsonb column to community_events
-- Each row is an array of: { id, company_name, logo_url, website_url, description }

ALTER TABLE community_events
  ADD COLUMN IF NOT EXISTS exhibitors jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN community_events.exhibitors IS
  'Array of exhibitor objects: { id, company_name, logo_url, website_url, description }';
