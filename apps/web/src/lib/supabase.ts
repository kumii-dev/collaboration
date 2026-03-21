import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// ── One-time migration: copy any session stored under the old default key ──
// Users who visited before the storageKey change have a valid token stored
// under 'sb-<ref>-auth-token'. Move it to 'kumii-collab-auth' so they don't
// hit the 20 s timeout on their next visit.
try {
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] ?? '';
  const oldKey = `sb-${projectRef}-auth-token`;
  const newKey = 'kumii-collab-auth';
  if (projectRef && !localStorage.getItem(newKey)) {
    const legacy = localStorage.getItem(oldKey);
    if (legacy) {
      localStorage.setItem(newKey, legacy);
      localStorage.removeItem(oldKey);
    }
  }
} catch {
  // localStorage may be unavailable (private browsing, cross-origin) — safe to ignore
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Unique storage key isolates our session from Lovable's own Supabase client
    // which runs in the same browser context (same-origin iframe). Without this
    // both clients share 'sb-<ref>-auth-token' and trigger the
    // "Multiple GoTrueClient instances" warning with unpredictable auth state.
    storageKey: 'kumii-collab-auth',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export default supabase;
