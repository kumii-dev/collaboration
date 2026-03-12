-- ============================================================
-- Events FK + Schema Fix
-- Run this in Supabase SQL Editor
-- Fixes: "Could not find relationship between community_events and profiles"
-- ============================================================

-- 1. Add FK from community_events.created_by → profiles(id)
--    (profiles.id mirrors auth.users.id via the auto-create trigger)
ALTER TABLE community_events
  ADD CONSTRAINT community_events_created_by_fkey_profiles
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

-- 2. Add FK from community_event_rsvps.user_id → profiles(id)
--    (needed for the attendee avatars join in GET /events/:id)
ALTER TABLE community_event_rsvps
  ADD CONSTRAINT community_event_rsvps_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 3. Add FK from event_reminders.user_id → profiles(id)
ALTER TABLE event_reminders
  ADD CONSTRAINT event_reminders_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 4. Refresh PostgREST schema cache (run separately if needed)
-- NOTIFY pgrst, 'reload schema';
