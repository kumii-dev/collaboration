import { createContext, useContext } from 'react';

// Profile shape as sent by Lovable via KUMII_PROFILE postMessage
export interface KumiiProfile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  organization: string | null;
  persona_type: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  industry_sectors: string[] | null;
  skills: string[] | null;
  interests: string[] | null;
  profile_picture_url: string | null;
  profile_completion_percentage: number | null;
}

export interface KumiiStartup {
  company_name: string | null;
  industry: string | null;
  stage: string | null;
  description: string | null;
  location: string | null;
  website: string | null;
  team_size: number | null;
  founded_year: number | null;
  key_products_services: string | null;
  market_access_needs: string | null;
  challenges: string | null;
}

// Role as stored in this platform's profiles table (matches user_role DB enum)
export type UserRole = 'entrepreneur' | 'funder' | 'advisor' | 'moderator' | 'admin';

export interface KumiiContextValue {
  profile: KumiiProfile | null;
  startup: KumiiStartup | null;
  /** Authoritative platform role from /api/auth/me — used for server-side checks. */
  role: UserRole | null;
  /**
   * Display-only tags forwarded by the host via KUMII_IDENTITY
   * (e.g. "joburg_sloane_connect", "gec_africa_verified", "deal_book").
   * null = message not yet received. [] = received but user has no tags.
   * Never use for access control — server-side only.
   */
  tags: string[] | null;
  /**
   * Display-only roles forwarded by the host via KUMII_IDENTITY
   * (all rows from user_roles, including "admin" / "staff").
   * null = message not yet received. [] = received but user has no extra roles.
   * Never use for access control — server-side only.
   */
  roles: string[] | null;
}

export const KumiiContext = createContext<KumiiContextValue>({
  profile: null,
  startup: null,
  role:    null,
  tags:    null,
  roles:   null,
});

export function useKumii() {
  return useContext(KumiiContext);
}

// Helpers to persist/restore across page navigations within the iframe
const PROFILE_KEY  = 'kumii_profile';
const STARTUP_KEY  = 'kumii_startup';
const IDENTITY_KEY = 'kumii_identity';

export function saveKumiiProfile(profile: KumiiProfile | null, startup: KumiiStartup | null) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
    if (startup) localStorage.setItem(STARTUP_KEY, JSON.stringify(startup));
    else localStorage.removeItem(STARTUP_KEY);
  } catch { /* storage blocked in some browsers */ }
}

export function loadKumiiProfile(): { profile: KumiiProfile | null; startup: KumiiStartup | null } {
  try {
    const p = localStorage.getItem(PROFILE_KEY);
    const s = localStorage.getItem(STARTUP_KEY);
    return {
      profile: p ? JSON.parse(p) : null,
      startup: s ? JSON.parse(s) : null,
    };
  } catch {
    return { profile: null, startup: null };
  }
}

export function saveKumiiIdentity(tags: string[], roles: string[]) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ tags, roles }));
  } catch { /* storage blocked in some browsers */ }
}

export function loadKumiiIdentity(): { tags: string[] | null; roles: string[] | null } {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return { tags: null, roles: null };
    const { tags, roles } = JSON.parse(raw);
    return {
      tags:  Array.isArray(tags)  ? tags  : null,
      roles: Array.isArray(roles) ? roles : null,
    };
  } catch {
    return { tags: null, roles: null };
  }
}

