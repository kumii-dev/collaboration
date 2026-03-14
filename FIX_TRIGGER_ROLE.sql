-- FIX: The trigger handle_new_user() was inserting role='user' which is not
-- a valid user_role enum value. Valid values are:
-- 'entrepreneur', 'funder', 'advisor', 'moderator', 'admin'
-- This replaces it with 'entrepreneur' as the default for new Lovable signups.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    'entrepreneur'   -- default role for new users signing in via Lovable
  )
  ON CONFLICT (id) DO NOTHING;   -- safe to re-run; won't overwrite existing profiles
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
