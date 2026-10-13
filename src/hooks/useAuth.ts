import { trpc } from '@/providers/trpc';

export interface SessionUser {
  id: number;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  expiresAt: number | null;
  daysLeft: number | null;
}

export function useAuth() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, { retry: false, staleTime: 60_000 });

  const login = trpc.auth.login.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      // recarga completa: garantiza que la cookie de sesión y el estado queden limpios
      setTimeout(() => window.location.reload(), 300);
    },
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setTimeout(() => window.location.reload(), 300);
    },
  });
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      window.location.reload();
    },
  });

  return {
    user: (me.data ?? null) as SessionUser | null,
    isLoading: me.isLoading,
    isAuthenticated: !!me.data,
    login,
    register,
    logout,
  };
}
