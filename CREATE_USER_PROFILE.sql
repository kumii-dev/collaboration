-- Create missing user profile
-- Run this in Supabase SQL Editor

INSERT INTO profiles (id, email, role)
VALUES (
  '849f6bba-9224-45d7-a889-a94d2e1d5d64',  -- Your user ID from the logs
  (SELECT email FROM auth.users WHERE id = '849f6bba-9224-45d7-a889-a94d2e1d5d64'),  -- Get email from auth.users
  'admin'  -- Use 'admin' for full access, or 'user' for regular access
)
ON CONFLICT (id) DO NOTHING;

-- Verify the profile was created
SELECT * FROM profiles WHERE id = '849f6bba-9224-45d7-a889-a94d2e1d5d64';
