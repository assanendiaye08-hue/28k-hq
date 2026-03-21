import { create } from 'zustand';
import { apiFetch } from '../api/client';

// Goal shape matching Prisma model + nested children from API
export interface Goal {
  id: string;
  title: string;
  type: 'MEASURABLE' | 'FREETEXT';
  status: 'ACTIVE' | 'COMPLETED' | 'MISSED' | 'EXTENDED';
  currentValue: number;
  targetValue: number | null;
  unit: string | null;
  timeframe: 'YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY' | null;
  deadline: string;
  children: Goal[];
}

export interface DashboardData {
  member: {
    displayName: string;
    totalXp: number;
    currentStreak: number;
    longestStreak: number;
    rank: string;
    rankColor: number;
    nextRank: {
      name: string;
      xpRequired: number;
      xpRemaining: number;
    } | null;
  };
  goals: {
    today: Goal[];
    weekly: Goal[];
  };
  timer: Record<string, unknown> | null;
  todayCheckins: number;
  quote: {
    text: string;
    author: string;
  };
}

interface DashboardState {
  data: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  data: null,
  isLoading: false,
  error: null,
  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiFetch<DashboardData>('/dashboard');
      set({ data, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load dashboard',
        isLoading: false,
      });
    }
  },
}));
