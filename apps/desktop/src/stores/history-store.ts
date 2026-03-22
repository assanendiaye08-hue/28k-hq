import { create } from 'zustand';
import { apiFetch } from '../api/client';

export interface Session {
  id: string;
  focus: string | null;
  goalId: string | null;
  goalTitle: string | null;
  mode: string;
  totalWorkedMs: number;
  totalBreakMs: number;
  pomodoroCount: number;
  xpAwarded: number;
  startedAt: string;
  endedAt: string | null;
}

interface HistoryState {
  sessions: Session[];
  count: number;
  isLoading: boolean;
  error: string | null;
  fetchHistory: (limit?: number) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  sessions: [],
  count: 0,
  isLoading: false,
  error: null,
  fetchHistory: async (limit?: number) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiFetch<{ sessions: Session[]; count: number }>(
        `/timer/history?limit=${limit ?? 20}`,
      );
      set({ sessions: data.sessions, count: data.count, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load history',
        isLoading: false,
      });
    }
  },
}));
