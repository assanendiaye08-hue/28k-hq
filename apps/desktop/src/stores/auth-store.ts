import { create } from 'zustand';
import { setAccessToken } from '../api/client';

interface AuthUser {
  id: string;
  displayName: string;
  discordId: string;
  avatar: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: AuthUser, accessToken: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // true initially while checking stored tokens
  login: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user, isAuthenticated: true, isLoading: false });
  },
  logout: () => {
    setAccessToken(null);
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
  setLoading: (isLoading) => set({ isLoading }),
}));
