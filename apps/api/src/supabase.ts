import { createClient } from '@supabase/supabase-js';
import config from './config.js';

// Client for user-authenticated requests (uses anon key + user JWT)
export const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_ANON_KEY
);

// Admin client for service operations (uses service role key - bypass RLS)
export const supabaseAdmin = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export default supabase;
