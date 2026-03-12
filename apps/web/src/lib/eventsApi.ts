import api from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RsvpCounts {
  going: number;
  interested: number;
  not_going: number;
}

export interface CommunityEvent {
  id: string;
  category_id: string;
  title: string;
  description?: string;
  location?: string;
  meeting_url?: string;
  starts_at: string;
  ends_at?: string;
  max_attendees?: number;
  is_online: boolean;
  is_cancelled: boolean;
  created_by: string;
  created_at: string;
  forum_categories?: { id: string; name: string; slug?: string };
  profiles?: { id: string; email: string; avatar_url?: string; full_name?: string };
  rsvp_counts: RsvpCounts;
  user_rsvp: 'going' | 'interested' | 'not_going' | null;
  attendees?: Array<{ id: string; email: string; avatar_url?: string; full_name?: string }>;
}

export interface CreateEventPayload {
  category_id: string;
  title: string;
  description?: string;
  location?: string;
  meeting_url?: string;
  starts_at: string;
  ends_at?: string;
  max_attendees?: number;
  is_online?: boolean;
}

// ── API calls (re-use the existing axios instance with auth interceptor) ──────
export const eventsApi = {
  list: async (categoryId?: string): Promise<CommunityEvent[]> => {
    const params = categoryId ? { category_id: categoryId } : {};
    const { data } = await api.get('/events', { params });
    return data.data;
  },

  get: async (id: string): Promise<CommunityEvent> => {
    const { data } = await api.get(`/events/${id}`);
    return data.data;
  },

  create: async (payload: CreateEventPayload): Promise<CommunityEvent> => {
    const { data } = await api.post('/events', payload);
    return data.data;
  },

  rsvp: async (eventId: string, status: 'going' | 'interested' | 'not_going'): Promise<{ status: string; rsvp_counts: RsvpCounts }> => {
    const { data } = await api.post(`/events/${eventId}/rsvp`, { status });
    return data.data;
  },

  removeRsvp: async (eventId: string): Promise<{ rsvp_counts: RsvpCounts }> => {
    const { data } = await api.delete(`/events/${eventId}/rsvp`);
    return data.data;
  },

  setReminder: async (eventId: string, remindAt: string): Promise<void> => {
    await api.post(`/events/${eventId}/reminder`, { remind_at: remindAt });
  },

  cancel: async (eventId: string): Promise<void> => {
    await api.delete(`/events/${eventId}`);
  },
};
