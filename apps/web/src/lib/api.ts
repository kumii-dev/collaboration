import axios from 'axios';
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch (error) {
    console.error('Failed to get session for API request:', error);
  }
  return config;
});

// Handle auth errors - but don't redirect on every 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Check if we actually have a valid session
      const { data: { session } } = await supabase.auth.getSession();
      
      // Only redirect to login if we truly have no session
      if (!session) {
        console.log('❌ No valid session, redirecting to login');
        window.location.href = '/login';
      } else {
        console.log('⚠️ Got 401 but have session, not redirecting');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
