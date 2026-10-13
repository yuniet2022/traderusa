import { useAuth } from '@/hooks/useAuth';
import Login from './Login';
import Terminal from './Terminal';
import { Radar } from 'lucide-react';

export default function Home() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl bg-emerald-500/15 p-3">
            <Radar size={28} className="text-emerald-400 animate-pulse" />
          </div>
          <p className="text-xs text-zinc-500">Cargando tu sesión…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) return <Login />;
  return <Terminal user={user} />;
}
