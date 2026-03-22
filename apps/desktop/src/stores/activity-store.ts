import { create } from 'zustand';
import { apiFetch } from '../api/client';

export interface Grinder {
  displayName: string;
  focus: string | null;
  startedAt: string;
}

interface ActivityState {
  grinders: Grinder[];
  count: number;
  isLoading: boolean;
  fetchGrinders: () => Promise<void>;
}

export const useActivityStore = create<ActivityState>((set) => ({
  grinders: [],
  count: 0,
  isLoading: false,
  fetchGrinders: async () => {
    set({ isLoading: true });
    try {
      const data = await apiFetch<{ grinders: Grinder[]; count: number }>('/activity/grinding');
      set({ grinders: data.grinders, count: data.count, isLoading: false });
    } catch {
      // Fail silently -- show empty state
      set({ grinders: [], count: 0, isLoading: false });
    }
  },
}));
