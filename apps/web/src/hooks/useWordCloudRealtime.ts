import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { WordEntry } from '../lib/wordCloudApi';

/**
 * Subscribes to real-time word cloud updates via Supabase Broadcast channels.
 *
 * The API broadcasts events on channel `wordcloud:<contextId>`:
 *   - event "update"  → { word: string, count: number }
 *   - event "reset"   → {}
 *
 * This mirrors the existing CommunityChatPanel approach so no new
 * infrastructure (Socket.IO etc.) is required.
 */
export function useWordCloudRealtime(
  contextId: string,
  onUpdate: (entry: WordEntry) => void,
  onReset: () => void
): void {
  // Stable refs so the channel subscription never stale-closes over old callbacks
  const onUpdateRef = useRef(onUpdate);
  const onResetRef  = useRef(onReset);
  onUpdateRef.current = onUpdate;
  onResetRef.current  = onReset;

  const subscribe = useCallback(() => {
    const channel = supabase
      .channel(`wordcloud:${contextId}`)
      .on('broadcast', { event: 'update' }, ({ payload }) => {
        if (payload?.word) {
          onUpdateRef.current(payload as WordEntry);
        }
      })
      .on('broadcast', { event: 'reset' }, () => {
        onResetRef.current();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contextId]);

  useEffect(() => {
    const cleanup = subscribe();
    return cleanup;
  }, [subscribe]);
}
