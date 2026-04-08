import api from './api';

export interface WordEntry {
  word: string;
  count: number;
}

export const wordCloudApi = {
  /**
   * Fetch the current aggregated word cloud for a context.
   * contextId = category slug (e.g. "sloane-connect") or event UUID.
   */
  getCloud: async (contextId: string, limit = 100): Promise<WordEntry[]> => {
    const { data } = await api.get(`/wordcloud/${contextId}`, { params: { limit } });
    return (data.data ?? []) as WordEntry[];
  },

  /**
   * Submit a word or short phrase to a context.
   * Returns the normalised word and its new cumulative count.
   */
  submitWord: async (contextId: string, word: string): Promise<WordEntry> => {
    const { data } = await api.post(`/wordcloud/${contextId}/submit`, { word });
    return data.data as WordEntry;
  },

  /**
   * Clear a context's word cloud (admin/moderator only).
   */
  clearCloud: async (contextId: string): Promise<void> => {
    await api.delete(`/wordcloud/${contextId}`);
  },
};
