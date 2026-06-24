# Joburg Sloane Connect — Tag-Driven Community Integration
## Functional Requirements Document · Application Architecture · Technology Architecture · API Reference

**Version:** 1.0  
**Date:** June 2026  
**Classification:** Internal Technical Reference  
**Scope:** End-to-end flow from `https://kumii.africa/community` iframe embedding through user tag delivery, session bridging, role resolution, and community auto-routing.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Functional Requirements](#2-functional-requirements)
3. [System Actors & Boundaries](#3-system-actors--boundaries)
4. [Application Architecture](#4-application-architecture)
5. [Technology Architecture](#5-technology-architecture)
6. [End-to-End Flow Narrative](#6-end-to-end-flow-narrative)
7. [Authentication Architecture](#7-authentication-architecture)
8. [Authorization Architecture](#8-authorization-architecture)
9. [postMessage Protocol](#9-postmessage-protocol)
10. [API Reference & Payloads](#10-api-reference--payloads)
11. [State Management & Persistence](#11-state-management--persistence)
12. [Security Controls](#12-security-controls)
13. [Environment Variables](#13-environment-variables)
14. [Failure Modes & Recovery](#14-failure-modes--recovery)
15. [Sequence Diagrams](#15-sequence-diagrams)

---

## 1. Executive Summary

The Kumii platform (`kumii.africa`) embeds the Collaboration Community application in an HTML `<iframe>` at the path `/community`. The two applications live on **separate domains**, separate **Supabase projects**, and communicate exclusively via the browser's `window.postMessage` API.

The `joburg_sloane_connect` tag is a **display-only identity signal** sent from the Kumii host to the embedded community app. When a user authenticated in Kumii carries this tag, the community app automatically redirects them to the **Joburg Sloane Connect** community category rather than displaying the generic forum landing page.

The tag **never controls access**. All access control is enforced server-side in the community API using the user's `role` field stored in the collaboration Supabase project's `profiles` table.

---

## 2. Functional Requirements

### FR-01 — Iframe Embedding
The community application MUST render correctly when embedded as an `<iframe>` in `https://kumii.africa/community`. It MUST NOT show a login page to a user who is already authenticated in Kumii.

### FR-02 — Cross-Origin Session Bridge
Because the two applications are on different Supabase projects with different JWT signing secrets, the community app MUST provision a valid local session for any user authenticated in Kumii via a server-side token exchange endpoint.

### FR-03 — Tag Delivery
The Kumii host MUST be able to send user tags to the embedded app at any time via `postMessage`. The embedded app MUST accept and store tags from trusted origins only.

### FR-04 — Community Auto-Routing
A user whose tag array includes `joburg_sloane_connect` MUST be automatically redirected from the generic forum page (`/forum`) to the Joburg Sloane Connect category page (`/forum/categories/joburg-sloane-connect`) without any manual navigation.

### FR-05 — Tag Persistence Across Navigation
Tags received from the host MUST persist across in-app page navigations without requiring a new `postMessage`. They MUST be stored in `localStorage` for resilience across soft reloads.

### FR-06 — Role Immutability via Host
The user's platform `role` (`admin`, `moderator`, `entrepreneur`, `funder`, `advisor`) MUST be managed exclusively in the collaboration project's database. The Kumii host MUST NOT be able to elevate or change a user's role by manipulating `postMessage` payloads.

### FR-07 — Race Condition Prevention
The iframe MUST NOT lose session tokens that arrive from the host before React's `useEffect` has mounted. A pre-React message buffer MUST capture and replay any messages received during initialisation.

### FR-08 — Graceful Degradation
If no session is received within 40 seconds of mounting, the app MUST display a human-readable reconnect prompt rather than a login form or blank page.

### FR-09 — Content Security Policy
The community API server MUST emit `frame-ancestors` headers listing only trusted origins so that third-party sites cannot embed the app without authorisation.

### FR-10 — Profile Sync
On every authenticated session exchange, the latest profile data from Kumii (name, avatar, sector, etc.) MUST overwrite the collaboration project's profile row. The `role` field MUST be excluded from this sync.

---

## 3. System Actors & Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          User's Browser                                     │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  kumii.africa (Host Application — "Lovable")                          │ │
│  │  ─────────────────────────────────────────────────────────────────    │ │
│  │  • Supabase Project A (lovable-project)                               │ │
│  │  • User authenticated, JWT signed by Project A secret                 │ │
│  │  • Knows user tags: ["joburg_sloane_connect"]                         │ │
│  │                                                                       │ │
│  │  <iframe src="https://communities-ten.vercel.app">                    │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Community App (Embedded — this repository)                     │  │ │
│  │  │  ──────────────────────────────────────────────────────────     │  │ │
│  │  │  • Supabase Project B (collaboration-project)                   │  │ │
│  │  │  • Receives JWT from Project A via postMessage                  │  │ │
│  │  │  • Exchanges JWT at /api/auth/exchange for Project B session     │  │ │
│  │  │  • Receives tags via KUMII_IDENTITY postMessage                 │  │ │
│  │  │  • Routes joburg_sloane_connect users automatically             │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘

External Services:
  • Supabase Project A  — kumii.africa user store
  • Supabase Project B  — collaboration user store + all app data
  • Vercel              — hosts Community App (web + serverless API)
  • Resend              — transactional email (reminders, update notifications)
  • Microsoft Graph     — Outlook calendar invites (boardroom bookings)
```

---

## 4. Application Architecture

### 4.1 Monorepo Structure

```
collaboration/
├── apps/
│   ├── web/                  React SPA (Vite)
│   │   └── src/
│   │       ├── App.tsx       Root — session bridge, postMessage handler, routing
│   │       ├── lib/
│   │       │   ├── KumiiContext.tsx    Context shape, localStorage helpers
│   │       │   ├── messageBuffer.ts   Pre-React message queue
│   │       │   ├── api.ts             Axios instance with auth interceptor
│   │       │   └── supabase.ts        Supabase JS client (Project B)
│   │       └── pages/
│   │           └── Forum/
│   │               ├── ForumPage.tsx         Tag-based auto-redirect
│   │               └── CategoryDetailPage.tsx Joburg Sloane Connect page
│   └── api/                  Express serverless API (Node.js)
│       └── src/
│           ├── index.ts      App bootstrap, CORS, rate limiting, routes
│           ├── config.ts     Zod-validated env schema
│           ├── middleware/
│           │   └── auth.ts   JWT verification, role injection, ban enforcement
│           └── routes/
│               └── auth.ts   /exchange, /refresh, /sync, /me
└── packages/
    └── db/
        └── migrations/       PostgreSQL migration files (Supabase)
```

### 4.2 Component Responsibility Matrix

| Component | Responsibility |
|---|---|
| `messageBuffer.ts` | Captures postMessages before React mounts; replays them on handler registration |
| `App.tsx` | Registers message handler; drives session state machine; renders loading/timeout/reconnect UI |
| `KumiiContext.tsx` | Global React context for profile, startup, role, tags, roles |
| `api.ts` (Axios) | Attaches `Authorization: Bearer <token>` to every API request; handles 401 redirect |
| `ForumPage.tsx` | Reads `tags` from context; redirects tagged users |
| `auth.ts` (API route) | `/exchange`, `/refresh`, `/sync`, `/me` — the entire cross-project auth bridge |
| `auth.ts` (middleware) | Verifies JWT against Project B; injects `req.user`; enforces suspensions/bans |

---

## 5. Technology Architecture

### 5.1 Stack

| Layer | Technology | Version |
|---|---|---|
| Host platform | Lovable (React) | — |
| Community SPA | React + React-Bootstrap | 18.x |
| Build tool | Vite | 5.x |
| Routing | React Router v6 | 6.x |
| Data fetching | React Query | 3.x |
| API framework | Express.js | 4.x |
| Runtime | Node.js | 18.x (Vercel) |
| Auth / DB | Supabase (PostgreSQL 15) | JS SDK v2 |
| Deployment | Vercel (Serverless Functions) | — |
| Schema validation | Zod | 3.x |
| Email | Resend | — |
| Calendar | Microsoft Graph API | v1.0 |

### 5.2 Network Topology

```
Browser
  │
  ├─── HTTPS ──▶  kumii.africa            (Lovable CDN)
  │                    │
  │               window.postMessage (cross-origin, same tab)
  │                    │
  └─── HTTPS ──▶  communities-ten.vercel.app
                       │
                       ├── /api/*  ──▶  Vercel Serverless Function (Express)
                       │                    │
                       │               supabase-admin-client
                       │                    │
                       │               Supabase Project B (PostgreSQL)
                       │
                       └── /*  ──▶  Vite SPA (static, CDN edge)
                                        │
                                    supabase-js client
                                        │
                                    Supabase Project B (PostgreSQL)
```

### 5.3 Supabase Project Separation

| Aspect | Project A (Kumii/Lovable) | Project B (Collaboration) |
|---|---|---|
| URL | `<lovable-project>.supabase.co` | `<collab-project>.supabase.co` |
| JWT secret | Lovable-controlled | Collaboration-controlled |
| User store | Lovable's `auth.users` | Collaboration's `auth.users` |
| Profile data | Lovable's `profiles` | Collaboration's `profiles` |
| Role management | Lovable (persona_type) | Collaboration (`role` enum) |
| Tags / user metadata | Lovable user_metadata | Not stored — received via postMessage only |

---

## 6. End-to-End Flow Narrative

### Phase 1 — Host Page Load

1. User navigates to `https://kumii.africa/community`.
2. The Lovable (Kumii) SPA renders an `<iframe src="https://communities-ten.vercel.app" />`.
3. The Kumii application has already authenticated the user via Supabase Project A and holds:
   - A valid Project A `access_token` (JWT)
   - A valid Project A `refresh_token`
   - The user's tags array, e.g. `["joburg_sloane_connect"]`
   - The user's roles array, e.g. `["staff"]`

### Phase 2 — Iframe Initialisation Race Prevention

4. The `messageBuffer.ts` module is evaluated at **import time** (before React mounts) and installs a `window.addEventListener('message')` listener. All incoming messages are buffered.
5. `main.tsx` renders `<App />`.
6. `App.tsx` calls `registerAppHandler(handleMessage)` inside `useEffect`. This simultaneously:
   - Sets `liveHandler = handleMessage`
   - Drains any buffered messages synchronously (solves the race where the host sends `KUMII_SESSION` before React mounts)

### Phase 3 — KUMII_READY Handshake

7. `App.tsx` immediately calls `window.parent.postMessage({ type: 'KUMII_READY' }, '*')`.
8. This ping repeats every 1,200 ms for up to 40 seconds (33 retries) until a `KUMII_SESSION` is received.

### Phase 4 — Session Delivery (KUMII_SESSION)

9. The Kumii host receives `KUMII_READY` and responds with:
   ```json
   {
     "type": "KUMII_SESSION",
     "access_token": "<Project-A JWT>",
     "refresh_token": "<Project-A refresh token>"
   }
   ```
10. `handleMessage` receives this event and validates the origin against the trusted-origins allowlist.

### Phase 5 — Token Exchange

11. The community app attempts `supabase.auth.setSession({ access_token, refresh_token })` directly.
12. This **fails** because the JWT is signed by Project A's secret — Project B's Supabase rejects it with `invalid JWT signature`.
13. The app falls back to `POST /api/auth/exchange` with the Project A token.

**Server-side exchange (`/api/auth/exchange`):**

```
a. Decode JWT payload (no signature check — trust is established by postMessage origin control)
b. Extract: email, sub (Lovable user ID), user_metadata
c. Compute deterministic password = HMAC-SHA256(sub, EXCHANGE_SECRET)
d. Look up existing user in Project B by email (Supabase Admin API)
e. If exists:  UPDATE auth.users — sync password + Lovable metadata
   If new:     CREATE auth.users — email_confirm: true, password, metadata
f. Upsert profiles row — Lovable data overwrites all fields EXCEPT role
   - New user: role defaults to 'entrepreneur' (or 'admin' if email in ADMIN_EMAILS)
   - Existing: role is NEVER overwritten
g. Call Project B token endpoint (grant_type=password) → returns Project B session
h. Read final role from profiles table
i. Return { access_token, refresh_token, role, user }
```

14. `App.tsx` calls `supabase.auth.setSession()` with the Project B tokens — succeeds.
15. `setSession` → `loading = false` → app renders.

### Phase 6 — Identity Delivery (KUMII_IDENTITY)

16. The Kumii host sends (typically immediately after `KUMII_SESSION`, and re-sent on every token refresh):
    ```json
    {
      "type": "KUMII_IDENTITY",
      "tags":  ["joburg_sloane_connect"],
      "roles": ["staff"]
    }
    ```
17. `handleMessage` validates origin, extracts `tags` and `roles`, calls:
    - `setKumiiTags(["joburg_sloane_connect"])`
    - `setKumiiRoles(["staff"])`
    - `saveKumiiIdentity(tags, roles)` → persists to `localStorage`
18. The `KumiiContext.Provider` re-renders with the new tags.

### Phase 7 — Profile Delivery (KUMII_PROFILE)

19. The Kumii host optionally sends:
    ```json
    {
      "type": "KUMII_PROFILE",
      "profile": { "user_id": "...", "first_name": "...", "email": "...", ... },
      "startup": { "company_name": "...", "stage": "...", ... }
    }
    ```
20. Stored in context and `localStorage` for display use (name, avatar, etc.). Never used for access control.

### Phase 8 — Community Auto-Redirect

21. The React Router renders `<ForumPage />` at `/forum`.
22. `ForumPage` reads `tags` from `useKumii()`.
23. A `useEffect` fires:
    ```tsx
    if (tags?.includes('joburg_sloane_connect')) {
      navigate('/forum/categories/joburg-sloane-connect', { replace: true });
    }
    ```
24. The user lands on `<CategoryDetailPage slug="joburg-sloane-connect" />` — the Joburg Sloane Connect community — without any manual navigation.

### Phase 9 — Authenticated API Calls

25. Every subsequent API call from the SPA attaches the Project B JWT via Axios interceptor:
    ```
    Authorization: Bearer <Project-B access_token>
    ```
26. The `authenticate` middleware on every API route:
    - Calls `supabaseAdmin.auth.getUser(token)` — verifies against Project B
    - Fetches `profiles` row → injects `req.user = { id, email, role }`
    - Checks `moderation_actions` for active suspensions/bans

---

## 7. Authentication Architecture

### 7.1 Session State Machine

```
                        ┌──────────────────────────────────────────┐
                        │              App.tsx                     │
                        └──────────────────────────────────────────┘
                                          │
                        ┌─────────────────▼──────────────────────┐
                        │          loading = true                 │
                        │  (spinner — waiting for session)        │
                        └─────────────────┬──────────────────────┘
                                          │
              ┌───────────────────────────┼──────────────────────────┐
              │                           │                          │
    getSession() returns           KUMII_SESSION                No session after
    existing session               received                     40 s in iframe
              │                           │                          │
    setSession, setLoading=false   exchange flow              iframeTimeout=true
              │                           │                    setLoading=false
              └───────────────────────────┼──────────────────────────┘
                                          │
                        ┌─────────────────▼──────────────────────┐
                        │         session !== null                │
                        │    React Router renders routes          │
                        └─────────────────────────────────────────┘
```

### 7.2 Token Exchange Detail

| Step | Action | Who |
|---|---|---|
| 1 | Decode Lovable JWT (no sig check) | Community API |
| 2 | Extract `email`, `sub`, `user_metadata` | Community API |
| 3 | `HMAC-SHA256(sub, EXCHANGE_SECRET)` → password | Community API |
| 4 | Lookup user in Project B by email | Community API → Supabase Admin |
| 5 | Create or update `auth.users` with password | Community API → Supabase Admin |
| 6 | Upsert `profiles` (no `role` overwrite) | Community API → Supabase Admin |
| 7 | `POST /auth/v1/token?grant_type=password` | Community API → Supabase Auth |
| 8 | Receive Project B `{ access_token, refresh_token }` | Community API |
| 9 | Read `role` from `profiles` | Community API |
| 10 | Return `{ access_token, refresh_token, role, user }` to browser | Community API |
| 11 | `supabase.auth.setSession(...)` succeeds | Browser (community SPA) |

### 7.3 Token Refresh

When the Project B access token expires, the SPA calls `POST /api/auth/refresh` with the current Lovable token + Project B refresh token. The endpoint:
1. Attempts the fast path: `grant_type=refresh_token`
2. Falls back to `grant_type=password` (re-derives the deterministic password)
3. Re-syncs Lovable metadata as a fire-and-forget side effect

### 7.4 Server-side Profile Sync Webhook

`POST /api/auth/sync` allows the Kumii backend to push profile changes (KYC, sector update, etc.) to the collaboration project without the user being online. Secured by `X-Sync-Secret` header matching `EXCHANGE_SECRET`.

---

## 8. Authorization Architecture

### 8.1 Role Model

| Role | Managed by | Scope |
|---|---|---|
| `entrepreneur` | Collaboration DB | Default for all new users |
| `funder` | Collaboration DB | Set by admin |
| `advisor` | Collaboration DB | Set by admin |
| `moderator` | Collaboration DB | Can approve/reject forum content |
| `admin` | Collaboration DB (or `ADMIN_EMAILS` env) | Full platform access |

**Critical rule:** The `role` column in `profiles` is **never written** by the token exchange path for returning users (unless the email is in `ADMIN_EMAILS`). Tags from the host have no role-elevation capability.

### 8.2 Tag vs Role Distinction

| Property | `tags` (KUMII_IDENTITY) | `role` (profiles table) |
|---|---|---|
| Source | Kumii host via postMessage | Collaboration DB |
| Transport | Browser-only (never hits the API as auth) | JWT → API middleware → DB |
| Use | UI routing, display personalisation | Server-side access control |
| Can be forged by host? | Yes — but only affects client-side routing | No — enforced server-side |
| Example | `joburg_sloane_connect` | `admin` |

### 8.3 Route-Level Guards

```tsx
// Admin-only page
<Route
  path="forum-admin"
  element={userRole === 'admin' ? <ForumAdminPage /> : <Navigate to="/forum" replace />}
/>
```

```typescript
// API middleware
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
```

### 8.4 Suspension/Ban Enforcement

Every authenticated API request checks `moderation_actions` for active suspensions or bans. Admins and moderators are exempt. A banned user receives `403` on every API call.

---

## 9. postMessage Protocol

### 9.1 Origin Validation

The community app validates the `event.origin` on every received message against:

**Exact matches:**
- `https://kumii.africa`
- `https://www.kumii.africa`
- `https://communities-ten.vercel.app`

**Regex patterns:**
- `/^https:\/\/[a-z0-9-]+\.lovable\.app$/`
- `/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/`
- `/^https:\/\/[a-z0-9-]+\.gptengineer\.app$/`
- `/^https:\/\/[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/`

Messages from any other origin are silently dropped and a console warning is logged.

### 9.2 Message Types

#### `KUMII_READY` (community → host)
```json
{ "type": "KUMII_READY" }
```
Sent immediately on mount and every 1,200 ms for up to 40 s. Signals that the community app is ready to receive a session.

---

#### `KUMII_SESSION` (host → community)
```json
{
  "type":          "KUMII_SESSION",
  "access_token":  "<Project-A JWT>",
  "refresh_token": "<Project-A refresh token>"
}
```
Triggers the token exchange flow. `refresh_token` is optional — if absent, the exchange endpoint uses only `access_token`.

---

#### `KUMII_PROFILE` (host → community)
```json
{
  "type": "KUMII_PROFILE",
  "profile": {
    "user_id":                    "uuid",
    "first_name":                 "Jane",
    "last_name":                  "Doe",
    "email":                      "jane@example.com",
    "phone":                      "+27821234567",
    "location":                   "Johannesburg",
    "bio":                        "Founder at ...",
    "organization":               "Acme Corp",
    "persona_type":               "entrepreneur",
    "linkedin_url":               "https://linkedin.com/in/...",
    "twitter_url":                null,
    "industry_sectors":           ["FinTech", "EdTech"],
    "skills":                     ["product", "design"],
    "interests":                  ["startups", "venture capital"],
    "profile_picture_url":        "https://...",
    "profile_completion_percentage": 85
  },
  "startup": {
    "company_name":               "Acme Corp",
    "industry":                   "FinTech",
    "stage":                      "seed",
    "description":                "...",
    "location":                   "Johannesburg",
    "website":                    "https://acme.com",
    "team_size":                  5,
    "founded_year":               2023,
    "key_products_services":      "...",
    "market_access_needs":        "...",
    "challenges":                 "..."
  }
}
```
Display-only. Stored in React context and `localStorage`. Never used for access control.

---

#### `KUMII_IDENTITY` (host → community)
```json
{
  "type":  "KUMII_IDENTITY",
  "tags":  ["joburg_sloane_connect"],
  "roles": ["staff"]
}
```
Re-sent on every token refresh. Tags and roles are display-only — they affect client-side routing and UI personalisation only. `tags` is the array that drives the `joburg_sloane_connect` auto-redirect.

**Known tag values:**

| Tag | Effect |
|---|---|
| `joburg_sloane_connect` | Redirects user from `/forum` to `/forum/categories/joburg-sloane-connect` |
| *(others TBD)* | Reserved for future community auto-routing |

---

## 10. API Reference & Payloads

### POST `/api/auth/exchange`

**Purpose:** Bridge a Project A JWT to a Project B Supabase session.

**Request:**
```http
POST /api/auth/exchange
Content-Type: application/json
Origin: https://kumii.africa
```
```json
{
  "access_token":  "<Project-A JWT>",
  "refresh_token": "<Project-A refresh token>"
}
```

**Response (200):**
```json
{
  "access_token":  "<Project-B JWT>",
  "refresh_token": "<Project-B refresh token>",
  "role":          "entrepreneur",
  "user": {
    "id":    "<Project-B user UUID>",
    "email": "jane@example.com"
  }
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Missing `access_token`, malformed JWT, no `email` or `sub` claim |
| 401 | CORS origin not trusted |
| 500 | User creation failed, token endpoint failed, DB error |

---

### POST `/api/auth/refresh`

**Purpose:** Renew a Project B session using the latest Lovable token.

**Request:**
```json
{
  "access_token":  "<latest Project-A JWT>",
  "refresh_token": "<current Project-B refresh token>"
}
```

**Response (200):**
```json
{
  "access_token":  "<new Project-B JWT>",
  "refresh_token": "<new Project-B refresh token>"
}
```

---

### GET `/api/auth/me`

**Purpose:** Return the full profile for the authenticated user.

**Request:**
```http
GET /api/auth/me
Authorization: Bearer <Project-B JWT>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id":               "<uuid>",
    "email":            "jane@example.com",
    "full_name":        "Jane Doe",
    "avatar_url":       "https://...",
    "role":             "entrepreneur",
    "verified":         true,
    "company":          "Acme Corp",
    "bio":              "...",
    "sector":           "FinTech",
    "location":         "Johannesburg",
    "phone":            "+27821234567",
    "reputation_score": 0,
    "is_suspended":     false,
    "is_banned":        false,
    "created_at":       "2024-01-01T00:00:00Z",
    "updated_at":       "2026-06-01T00:00:00Z"
  }
}
```

---

### POST `/api/auth/sync`

**Purpose:** Server-to-server profile sync webhook from Kumii backend.

**Request:**
```http
POST /api/auth/sync
X-Sync-Secret: <EXCHANGE_SECRET>
Content-Type: application/json
```
```json
{
  "user_id":       "<Lovable sub UUID>",
  "user_metadata": {
    "email":      "jane@example.com",
    "full_name":  "Jane Doe",
    "avatar_url": "https://...",
    "sector":     "FinTech",
    "verified":   true
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user_id":      "<Project-B UUID>",
    "fields_synced": ["email", "full_name", "avatar_url", "sector", "verified"]
  }
}
```

---

### `authenticate` Middleware — Request Enrichment

Applied to all protected routes. Adds `req.user` to the request:

```typescript
req.user = {
  id:    "<Project-B UUID>",
  email: "jane@example.com",
  role:  "entrepreneur"
}
```

---

## 11. State Management & Persistence

### 11.1 React State (App.tsx)

| State | Type | Source | Survives navigation? |
|---|---|---|---|
| `session` | `Session \| null` | Supabase `getSession` / `setSession` | Yes (Supabase localStorage) |
| `kumiiProfile` | `KumiiProfile \| null` | `KUMII_PROFILE` + localStorage | Yes |
| `kumiiStartup` | `KumiiStartup \| null` | `KUMII_PROFILE` + localStorage | Yes |
| `userRole` | `UserRole \| null` | `/api/auth/me` or `/exchange` response | Until page reload |
| `kumiiTags` | `string[] \| null` | `KUMII_IDENTITY` + localStorage | Yes |
| `kumiiRoles` | `string[] \| null` | `KUMII_IDENTITY` + localStorage | Yes |

### 11.2 localStorage Keys

| Key | Content | Written by |
|---|---|---|
| `kumii_profile` | `KumiiProfile` JSON | `saveKumiiProfile()` |
| `kumii_startup` | `KumiiStartup` JSON | `saveKumiiProfile()` |
| `kumii_identity` | `{ tags, roles }` JSON | `saveKumiiIdentity()` |
| `sb-<ref>-auth-token` | Supabase Project B session | Supabase JS SDK |

### 11.3 KumiiContext

All child components access the context via `useKumii()`:

```tsx
const { profile, startup, role, tags, roles } = useKumii();
```

The `role` field is the **authoritative** platform role from `/api/auth/me`. The `tags` and `roles` fields are display-only signals from the host.

---

## 12. Security Controls

### 12.1 Cross-Origin Embedding

```
Content-Security-Policy: frame-ancestors 'self'
  https://kumii.africa
  https://*.lovable.app
  https://*.lovableproject.com
  https://*.gptengineer.app
```
Set via Helmet's `frameAncestors` directive in `apps/api/src/index.ts`.

### 12.2 CORS

The Express API allows only:
- Exact origins: `kumii.africa`, `communities-ten.vercel.app`
- Pattern-matched: `*.lovable.app`, `*.lovableproject.com`, `*.vercel.app` (preview deploys)

All other origins receive `403` from the CORS middleware before any route handler runs.

### 12.3 postMessage Origin Validation

All incoming `window.postMessage` events are validated against the same trusted-origins list before any handler runs. Untrusted origins are dropped and logged.

### 12.4 Token Exchange Security

- The Lovable JWT signature is **not verified** (cross-project — different secret).
- Trust is established by the `postMessage` origin check and CORS: only `kumii.africa` can call `/api/auth/exchange`.
- The deterministic password is derived server-side and never sent to the browser.
- `EXCHANGE_SECRET` must be a cryptographically random 32+ character string set in Vercel environment variables.

### 12.5 Role Protection

- The `role` field is excluded from all Lovable-driven profile sync operations for returning users.
- Admin bootstrap (`ADMIN_EMAILS`) is applied on every login but only promotes — never demotes.
- Tags carry zero server-side authority. No API route reads the `tags` array.

### 12.6 Rate Limiting

Global Express rate limiter: configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` (defaults: 15-minute window, 100 requests). Applied before all routes.

### 12.7 Suspension / Ban Enforcement

The `authenticate` middleware queries `moderation_actions` on every request. A user with an active suspension or ban is blocked at the middleware layer regardless of their JWT validity.

---

## 13. Environment Variables

### Community API (Vercel)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Project B Supabase URL |
| `SUPABASE_ANON_KEY` | ✅ | Project B anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Project B service role key — never exposed to browser |
| `JWT_SECRET` | ✅ | Min 32 chars — used as `EXCHANGE_SECRET` fallback |
| `EXCHANGE_SECRET` | ✅ | Random 32+ char secret for HMAC password derivation + `/sync` auth |
| `ADMIN_EMAILS` | Optional | Comma-separated emails always promoted to `admin` |
| `CORS_ORIGIN` | ✅ | Primary allowed CORS origin |
| `SESSION_SECRET` | ✅ | Express session secret |
| `RESEND_API_KEY` | Optional | Transactional email |
| `RESEND_FROM_EMAIL` | Optional | Sender address |
| `MS_TENANT_ID` | Optional | Microsoft Graph — Outlook calendar invites |
| `MS_CLIENT_ID` | Optional | Microsoft Graph |
| `MS_CLIENT_SECRET` | Optional | Microsoft Graph |
| `CRON_SECRET` | Optional | Secures `/api/events/reminders/due` cron endpoint |

### Community SPA (Vercel)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Project B Supabase URL (public) |
| `VITE_SUPABASE_ANON_KEY` | Project B anon key (public) |
| `VITE_API_URL` | Community API base URL |

---

## 14. Failure Modes & Recovery

| Failure | Behaviour | Recovery |
|---|---|---|
| Host never sends `KUMII_SESSION` | After 40 s: "Session not received" UI with **Try Again** button | User clicks Try Again — restarts 40 s ping cadence |
| Exchange endpoint cold start (Vercel) | `exchangeInProgressRef` prevents premature timeout; extends timeout by 15 s | Automatic |
| `/api/auth/exchange` returns 5xx | `iframeTimeout = true` — reconnect UI shown | User clicks Try Again |
| `KUMII_SESSION` arrives before React mounts | `messageBuffer.ts` buffers the message and replays it on `registerAppHandler` | Automatic |
| `KUMII_IDENTITY` arrives before tags are needed | Tags stored in context + localStorage immediately | Automatic |
| Project B refresh token expired | `/api/auth/refresh` falls back to `grant_type=password` — transparent to user | Automatic |
| User suspended/banned | `authenticate` middleware returns `403` on every API call | Admin must lift the action |
| `EXCHANGE_SECRET` not set | Falls back to `JWT_SECRET`; logs warning | Set `EXCHANGE_SECRET` in Vercel |

---

## 15. Sequence Diagrams

### 15.1 First-Time Login + Tag Routing

```
Browser (kumii.africa)          iframe (community app)           Community API         Supabase Project B
        │                               │                               │                       │
        │  render <iframe>              │                               │                       │
        │──────────────────────────────▶│                               │                       │
        │                               │  KUMII_READY (postMsg)        │                       │
        │◀──────────────────────────────│                               │                       │
        │                               │                               │                       │
        │  KUMII_SESSION                │                               │                       │
        │  { access_token (Proj A) }    │                               │                       │
        │──────────────────────────────▶│                               │                       │
        │                               │  setSession() → fails         │                       │
        │                               │  (wrong Supabase project)     │                       │
        │                               │                               │                       │
        │                               │  POST /api/auth/exchange      │                       │
        │                               │──────────────────────────────▶│                       │
        │                               │                               │  createUser / update  │
        │                               │                               │──────────────────────▶│
        │                               │                               │  upsert profiles      │
        │                               │                               │──────────────────────▶│
        │                               │                               │  token (password)     │
        │                               │                               │──────────────────────▶│
        │                               │                               │  ◀─── Proj B tokens ──│
        │                               │  ◀── { access_token (B),      │                       │
        │                               │        refresh_token (B),      │                       │
        │                               │        role } ─────────────── │                       │
        │                               │  setSession(B) → ✅            │                       │
        │                               │  setUserRole('entrepreneur')   │                       │
        │                               │  loading = false               │                       │
        │                               │                               │                       │
        │  KUMII_IDENTITY               │                               │                       │
        │  { tags: ["joburg_sloane_connect"] }                          │                       │
        │──────────────────────────────▶│                               │                       │
        │                               │  setKumiiTags(["joburg_..."])  │                       │
        │                               │  saveKumiiIdentity(...)        │                       │
        │                               │                               │                       │
        │                               │  navigate("/forum")            │                       │
        │                               │  ┌─ForumPage renders          │                       │
        │                               │  │ tags includes              │                       │
        │                               │  │ "joburg_sloane_connect"    │                       │
        │                               │  │ → navigate(               │                       │
        │                               │  │   "/forum/categories/      │                       │
        │                               │  │    joburg-sloane-connect", │                       │
        │                               │  │   { replace: true })       │                       │
        │                               │  └────────────────────────────│                       │
        │                               │  CategoryDetailPage renders    │                       │
        │                               │  GET /api/forum/categories     │                       │
        │                               │──────────────────────────────▶│                       │
        │                               │  ◀── categories ─────────────│                       │
```

### 15.2 Returning User (Cached Session)

```
Browser                         iframe (community app)           Supabase Project B
        │                               │                               │
        │  render <iframe>              │                               │
        │──────────────────────────────▶│                               │
        │                               │  getSession() from localStorage│
        │                               │──────────────────────────────▶│
        │                               │  ◀── valid session ───────────│
        │                               │  setSession, loading = false   │
        │                               │  (no exchange needed)          │
        │                               │                               │
        │  KUMII_IDENTITY               │                               │
        │  { tags: ["joburg_sloane_connect"] }
        │──────────────────────────────▶│                               │
        │                               │  tags from localStorage already│
        │                               │  set — tags updated in context │
        │                               │  → navigate to JSC community   │
```

---

*Document generated from live codebase analysis — June 2026.*  
*Maintainer: Engineering Team, Kumii / 22 On Sloane.*
