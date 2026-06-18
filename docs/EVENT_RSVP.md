# Event RSVP Cards & Process — End-to-End

> **Stack:** React + React-Bootstrap (web) · Express + Supabase (API) · PostgreSQL (database)

---

## Table of Contents

1. [Data Model](#1-data-model)
2. [API Endpoints](#2-api-endpoints)
3. [Frontend Types](#3-frontend-types)
4. [The Event Card Component](#4-the-event-card-component)
5. [RSVP Interaction Flow](#5-rsvp-interaction-flow)
6. [Capacity Enforcement](#6-capacity-enforcement)
7. [Event Detail Modal — RSVP & Reminders](#7-event-detail-modal--rsvp--reminders)
8. [Attendees Panel (Admin)](#8-attendees-panel-admin)
9. [Event Update Notifications](#9-event-update-notifications)
10. [Reminders](#10-reminders)
11. [Featured Events](#11-featured-events)
12. [Cover Images](#12-cover-images)
13. [State Management Pattern](#13-state-management-pattern)

---

## 1. Data Model

### `community_events` (migration `007_events_bookmarks_schema.sql`, `009_featured_events.sql`, `015_event_cover_image.sql`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, auto-generated |
| `category_id` | `uuid` | FK → `forum_categories(id)` |
| `title` | `text` | Required |
| `description` | `text` | Optional |
| `location` | `text` | Physical address |
| `meeting_url` | `text` | Used when `is_online = true` |
| `starts_at` | `timestamptz` | Required |
| `ends_at` | `timestamptz` | Optional |
| `max_attendees` | `int` | `NULL` = unlimited |
| `is_online` | `boolean` | Default `false` |
| `is_cancelled` | `boolean` | Soft-cancel flag, default `false` |
| `is_featured` | `boolean` | Surfaced on the forum landing page, default `false` |
| `cover_image_url` | `text` | Public URL from `event-covers` storage bucket |
| `created_by` | `uuid` | FK → `auth.users(id)` |
| `created_at` / `updated_at` | `timestamptz` | Auto-managed |

**Indexes:** `category_id`, `starts_at`, `created_by`, partial index on `starts_at WHERE is_cancelled = false`, partial index on `is_featured = true`.

---

### `community_event_rsvps` (migration `007_events_bookmarks_schema.sql`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `event_id` | `uuid` | FK → `community_events(id) ON DELETE CASCADE` |
| `user_id` | `uuid` | FK → `auth.users(id) ON DELETE CASCADE` |
| `status` | `text` | `CHECK (status IN ('going', 'interested', 'not_going'))` |
| `created_at` / `updated_at` | `timestamptz` | |

**Unique constraint:** `(event_id, user_id)` — one RSVP record per user per event. Changing status is an **upsert**, not an insert.

---

### `event_reminders`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `event_id` | `uuid` | FK → `community_events(id)` |
| `user_id` | `uuid` | FK → `auth.users(id)` |
| `remind_at` | `timestamptz` | When to fire the reminder |
| `sent` | `boolean` | Flipped to `true` once processed |

**Unique constraint:** `(event_id, user_id)` — one reminder per user per event.

---

## 2. API Endpoints

All routes require a valid JWT (`authenticate` middleware). The token is injected by the Axios instance in `apps/web/src/lib/api.ts`.

### Events

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/events` | authenticated | List events. Query params: `?category_id=<uuid>`, `?view=upcoming\|past\|all`, `?limit`, `?offset` |
| `GET` | `/api/events/featured` | authenticated | Featured events (upcoming first, then past). `?limit` (max 20) |
| `GET` | `/api/events/:id` | authenticated | Single event with full RSVP counts and `user_rsvp` |
| `POST` | `/api/events` | authenticated | Create event |
| `PATCH` | `/api/events/:id` | authenticated | Update event (owner / admin / moderator) |
| `DELETE` | `/api/events/:id` | authenticated | Soft-cancel (`is_cancelled = true`) |
| `PATCH` | `/api/events/:id/feature` | admin only | Toggle `is_featured` |

### RSVP

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/events/:id/rsvp` | authenticated | Set or update RSVP status. Body: `{ status: 'going' \| 'interested' \| 'not_going' }`. Returns updated `rsvp_counts` |
| `DELETE` | `/api/events/:id/rsvp` | authenticated | Remove RSVP entirely. Returns updated `rsvp_counts` |

### Reminders

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/events/:id/reminder` | authenticated | Create or replace a reminder. Body: `{ remind_at: <ISO string> }` |
| `DELETE` | `/api/events/:id/reminder` | authenticated | Cancel a reminder |
| `GET` | `/api/events/reminders/due` | cron secret | Processes all unsent reminders whose `remind_at ≤ now` — sends in-app notifications + emails, then marks `sent = true` |

### Attendees

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/events/:id/rsvps/attendees` | admin only | Full attendee list with `going / interested / not_going` breakdown and profile details |

---

## 3. Frontend Types

Defined in `apps/web/src/lib/eventsApi.ts`.

```ts
interface RsvpCounts {
  going:      number;
  interested: number;
  not_going:  number;
}

interface CommunityEvent {
  id:               string;
  category_id:      string;
  title:            string;
  description?:     string;
  location?:        string;
  meeting_url?:     string;
  starts_at:        string;       // ISO 8601
  ends_at?:         string;
  max_attendees?:   number;
  is_online:        boolean;
  is_cancelled:     boolean;
  is_featured:      boolean;
  cover_image_url?: string;       // Supabase Storage public URL
  created_by:       string;
  created_at:       string;
  forum_categories?: { id: string; name: string; slug?: string };
  profiles?:        { id: string; email: string; avatar_url?: string; full_name?: string };
  rsvp_counts:      RsvpCounts;
  user_rsvp:        'going' | 'interested' | 'not_going' | null;
  exhibitors?:      Exhibitor[];
}
```

`rsvp_counts` and `user_rsvp` are **computed server-side** in the `mapEvent()` helper by scanning the joined `community_event_rsvps` array, then stripping the raw array from the response.

---

## 4. The Event Card Component

**File:** `apps/web/src/components/events/EventCard.tsx`

### Visual anatomy

```
┌────────────────────────────────────────────────────┐
│  [Cover image 160px]  ← click → opens detail modal │
│  [⭐ Featured] [Online] [Full]    [Community name]  │ ← badges float over image
├────────────────────────────────────────────────────┤
│  Event Title (clickable)                           │
│  Short description (2-line clamp)                  │
│  📅 Mon, Jun 18                                    │
│  🕒 15:00 – 21:00                                  │
│  📍 Cnr Winnie Mandela Drive…                      │
│  👥 3 going  2 interested  10 spots left           │
├────────────────────────────────────────────────────┤
│  [✓ Going]  [★ Interested]  [✕]                    │ ← RSVP buttons
└────────────────────────────────────────────────────┘
```

When **no cover image** is set, the 160px image area is replaced by a 4px colour-gradient bar and the badges render below it inside the card body.

When the event is **cancelled**, the RSVP button row is hidden entirely.

### Component props

```ts
interface Props {
  event:        CommunityEvent;
  onRsvpChange: (eventId: string, status: string | null, counts: RsvpCounts) => void;
  onViewDetails:(event: CommunityEvent) => void;
}
```

- `onRsvpChange` — bubbles the new status and fresh counts up to the parent page so list-level state stays in sync.
- `onViewDetails` — opens the `EventDetailModal`.

### Local state

| State | Initial value | Purpose |
|---|---|---|
| `userRsvp` | `event.user_rsvp` | Which button is highlighted active |
| `counts` | `event.rsvp_counts` | Displayed counts (updated optimistically after each API call) |
| `loading` | `false` | Disables all three buttons while a request is in flight |

---

## 5. RSVP Interaction Flow

### Setting an RSVP

```
User clicks [✓ Going]
      │
      ▼
handleRsvp('going')
      │
      ├─ userRsvp === 'going'?
      │       YES → eventsApi.removeRsvp(eventId)   POST → DELETE /events/:id/rsvp
      │              setUserRsvp(null)
      │              setCounts(res.rsvp_counts)
      │
      └─ NO  → eventsApi.rsvp(eventId, 'going')     POST /events/:id/rsvp
                setUserRsvp('going')
                setCounts(res.rsvp_counts)
```

- Clicking the **same status again** removes the RSVP entirely (toggle-off behaviour).
- Clicking a **different status** replaces the existing RSVP via `upsert` on `(event_id, user_id)`.
- All three buttons are **disabled** while `loading = true` to prevent double-submission.
- The `not_going` button (✕) still calls the same `handleRsvp` flow — it registers an explicit `not_going` record rather than silently removing the RSVP.

### API — `POST /events/:id/rsvp`

```
1. If status === 'going' → check capacity:
     SELECT count(*) FROM community_event_rsvps
     WHERE event_id = :id AND status = 'going'
     Compare against community_events.max_attendees
     → 400 "Event is at full capacity" if exceeded

2. UPSERT into community_event_rsvps
   ON CONFLICT (event_id, user_id) DO UPDATE SET status = :status

3. Recompute rsvp_counts
4. Return { status, rsvp_counts }
```

### API — `DELETE /events/:id/rsvp`

```
1. DELETE FROM community_event_rsvps
   WHERE event_id = :id AND user_id = :userId

2. Recompute rsvp_counts
3. Return { rsvp_counts }
```

---

## 6. Capacity Enforcement

- `max_attendees = NULL` → **unlimited**; capacity check is skipped.
- The card computes `isFull = max_attendees != null && counts.going >= max_attendees` **locally** using optimistic counts.
- When `isFull` is true:
  - A **"Full"** badge appears on the card.
  - The **"✓ Going"** button is **disabled** (unless `userRsvp === 'going'`, in which case the user can still toggle themselves off).
  - A **"X spots left"** counter turns red.
- The server performs an **authoritative capacity check** before any `going` upsert, returning `400` if the slot is full by the time the request arrives (race-condition guard).

---

## 7. Event Detail Modal — RSVP & Reminders

**File:** `apps/web/src/components/events/EventDetailModal.tsx`

The modal has three tabs: **Details**, **Attendees**, **Exhibitions**.

### Details tab — RSVP section

Mirrors the card's RSVP logic but with a larger, more descriptive layout. It reads its own local `userRsvp` / `counts` state initialised from `event.user_rsvp` and `event.rsvp_counts`. State is **independent from the card** — the card's `onRsvpChange` callback keeps the parent page's list in sync separately.

### Reminder section

A date-time picker lets the user schedule an in-app + email reminder:

```
User picks a datetime → eventsApi.setReminder(eventId, remindAt)
                          POST /events/:id/reminder
                          → upsert into event_reminders
                          → reminderSet = true (bell icon fills)

User cancels →         eventsApi.setReminder (DELETE)
                          DELETE /events/:id/reminder
                          → reminderSet = false
```

---

## 8. Attendees Panel (Admin)

**File:** `apps/web/src/components/events/EventAttendeesPanel.tsx`

Only rendered when `isAdmin = true` and the "Attendees" tab is selected.

Calls `GET /api/events/:id/rsvps/attendees` which:

1. Fetches all RSVPs for the event.
2. Collects the unique `user_id` values.
3. Joins profiles in a **second query** (PostgREST cannot traverse `community_event_rsvps.user_id → profiles` in a single select because the FK points to `auth.users`, not `profiles`).
4. Returns a merged attendee list with counts:

```json
{
  "event_id": "...",
  "event_title": "Joburg Sloane Connect",
  "total": 5,
  "counts": { "going": 3, "interested": 2, "not_going": 0 },
  "attendees": [
    {
      "id": "...",
      "status": "going",
      "created_at": "...",
      "user": { "id": "...", "full_name": "Jane Doe", "email": "jane@...", "sector": null, "avatar_url": null }
    }
  ]
}
```

---

## 9. Event Update Notifications

When an admin/moderator **PATCHes** an event and any of `title`, `starts_at`, or `location` change, the API fires a background `setImmediate` job that:

1. Fetches all users with `status = 'going'` on that event (excluding the editor).
2. Batches up to **10 emails per round** via `sendEmail()`.
3. Sends a styled HTML email listing what changed.

This is **fire-and-forget** — a failure here never blocks the PATCH response.

---

## 10. Reminders

The reminder pipeline is a **cron-style pull** model:

```
Vercel Cron (or any HTTP caller with CRON_SECRET)
    │
    ▼
GET /api/events/reminders/due
    │
    ├─ SELECT * FROM event_reminders
    │  WHERE sent = false AND remind_at <= now()
    │
    ├─ UPDATE event_reminders SET sent = true
    │  (mark sent BEFORE sending to avoid duplicate delivery on retry)
    │
    └─ For each reminder (via setImmediate, non-blocking):
         • INSERT into notifications  (in-app bell)
         • sendEmail()                (email to user)
```

The endpoint is secured by `CRON_SECRET` header (`x-cron-secret` or `Authorization: Bearer <secret>`). If `CRON_SECRET` is not set in env, the endpoint is open — useful in development.

---

## 11. Featured Events

- `is_featured` is toggled by admins via `PATCH /api/events/:id/feature`.
- The **Forum / Communities landing page** (`ForumPage.tsx`) calls `eventsApi.listFeatured(6)` which fetches up to 6 featured events (upcoming first, then most-recent past).
- The **⭐ Featured** badge is shown on the event card and detail modal for any event with `is_featured = true`.

---

## 12. Cover Images

**Supabase Storage bucket:** `event-covers` (public, 5 MB limit, JPEG/PNG/WebP/GIF)

| Action | Where |
|---|---|
| Upload / replace / remove | `EventImageUpload.tsx` component (used in both `CreateEventModal` and `EventDetailModal`) |
| Stored as | `covers/<timestamp>-<random>.<ext>` |
| Referenced via | `cover_image_url` column on `community_events` |
| Displayed on card | 160px cover at the top; badges float over the image |
| Displayed in modal | 220px hero with bottom dark-gradient overlay |

RLS policies allow **any authenticated user** to upload and **public** read access (the bucket is public).

---

## 13. State Management Pattern

There is **no global store** (Redux, Zustand, etc.) for events. State flows like this:

```
Parent page (e.g. EventsPage, ForumPage)
│   holds: events[]  (from useQuery / useState)
│
├── <EventCard event={e} onRsvpChange={(id, status, counts) => {
│       // update events[] in place
│   }} onViewDetails={setSelectedEvent} />
│
└── <EventDetailModal event={selectedEvent}
        onRsvpChange={(id, status, counts) => {
            setSelectedEvent(prev => prev ? { ...prev, rsvp_counts: counts } : null);
        }}
        onEventUpdated={(updated) => {
            // replace event in list
        }}
    />
```

- Each `EventCard` owns its **own** local `userRsvp` and `counts` state, so multiple cards on the same page update independently without re-fetching the whole list.
- Counts returned by the API after each RSVP call are the **authoritative** server values — there is no client-side counter arithmetic.
- The detail modal initialises from `event.user_rsvp` / `event.rsvp_counts` at mount time and manages its own copy from that point forward.
