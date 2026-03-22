import { create } from 'zustand';
import { apiFetch } from '../api/client';
import { useDashboardStore } from './dashboard-store';

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  type: 'MEASURABLE' | 'FREETEXT';
  status: 'ACTIVE' | 'COMPLETED' | 'MISSED' | 'EXTENDED';
  currentValue: number;
  targetValue: number | null;
  unit: string | null;
  timeframe: 'YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY' | null;
  deadline: string;
  depth: number;
  children: Goal[];
  createdAt: string;
}

interface CreateGoalInput {
  title: string;
  type: 'MEASURABLE' | 'FREETEXT';
  deadline: string;
  timeframe?: string;
  targetValue?: number;
  unit?: string;
  parentId?: string;
  description?: string;
}

interface GoalsState {
  goals: Goal[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  expandedIds: Set<string>;
  fetchGoals: (timeframe?: string) => Promise<void>;
  toggleExpanded: (goalId: string) => void;
  isExpanded: (goalId: string) => boolean;
  createGoal: (input: CreateGoalInput) => Promise<void>;
  updateProgress: (goalId: string, currentValue: number) => Promise<{ xpAwarded?: number }>;
  completeGoal: (goalId: string) => Promise<{ xpAwarded: number }>;
}

/** Collect goal IDs at depth 0 and 1 for auto-expansion */
function collectShallowIds(goals: Goal[]): string[] {
  const ids: string[] = [];
  for (const goal of goals) {
    if (goal.depth <= 1) {
      ids.push(goal.id);
    }
    if (goal.children) {
      for (const child of goal.children) {
        if (child.depth <= 1) {
          ids.push(child.id);
        }
      }
    }
  }
  return ids;
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: [],
  isLoading: false,
  isSubmitting: false,
  error: null,
  expandedIds: new Set<string>(),

  fetchGoals: async (timeframe?: string) => {
    set({ isLoading: true, error: null });
    try {
      const query = timeframe ? `?timeframe=${timeframe}` : '';
      const goals = await apiFetch<Goal[]>(`/goals${query}`);
      const shallowIds = collectShallowIds(goals);
      set({ goals, isLoading: false, expandedIds: new Set(shallowIds) });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load goals',
        isLoading: false,
      });
    }
  },

  toggleExpanded: (goalId: string) => {
    const { expandedIds } = get();
    const next = new Set(expandedIds);
    if (next.has(goalId)) {
      next.delete(goalId);
    } else {
      next.add(goalId);
    }
    set({ expandedIds: next });
  },

  isExpanded: (goalId: string) => {
    return get().expandedIds.has(goalId);
  },

  createGoal: async (input: CreateGoalInput) => {
    set({ isSubmitting: true });
    try {
      await apiFetch('/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await get().fetchGoals();
      useDashboardStore.getState().fetchDashboard();
    } finally {
      set({ isSubmitting: false });
    }
  },

  updateProgress: async (goalId: string, currentValue: number) => {
    const res = await apiFetch<{ xpResult?: { xpAwarded: number } }>(`/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentValue }),
    });
    await get().fetchGoals();
    useDashboardStore.getState().fetchDashboard();
    return { xpAwarded: res.xpResult?.xpAwarded };
  },

  completeGoal: async (goalId: string) => {
    const res = await apiFetch<{ xpResult?: { xpAwarded: number } }>(`/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    await get().fetchGoals();
    useDashboardStore.getState().fetchDashboard();
    return { xpAwarded: res.xpResult?.xpAwarded ?? 0 };
  },
}));
