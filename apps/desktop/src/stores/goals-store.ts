import { create } from 'zustand';
import { apiFetch } from '../api/client';

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

interface GoalsState {
  goals: Goal[];
  isLoading: boolean;
  error: string | null;
  expandedIds: Set<string>;
  fetchGoals: (timeframe?: string) => Promise<void>;
  toggleExpanded: (goalId: string) => void;
  isExpanded: (goalId: string) => boolean;
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
}));
