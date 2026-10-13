import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Radar, Loader2, Lock, User, Ticket } from 'lucide-react';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const busy = login.isPending || register.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'login') {
        await login.mutateAsync({ username, password });
      } else {
        await register.mutateAsync({ username, password, accessCode });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de autenticación';
      setError(msg.includes('fetch') ? 'No se pudo conectar con el servidor. Recarga la página e intenta de nuevo.' : msg);
    }
  };

  const canSubmit = mode === 'login'
    ? username.length >= 3 && password.length >= 6
    : username.length >= 3 && password.length >= 6 && accessCode.trim().length >= 4;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="rounded-xl bg-emerald-500/15 p-3 mb-3">
            <Radar size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold">TradeRadar</h1>
          <p className="text-xs text-zinc-500 mt-1 text-center">
            Señales de trading con datos reales. Servicio por suscripción.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
            <button type="button" onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 py-1.5 font-medium transition-colors ${mode === 'login' ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-500'}`}>
              Ya tengo cuenta
            </button>
            <button type="button" onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 py-1.5 font-medium transition-colors ${mode === 'register' ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-500'}`}>
              Soy nuevo
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 h-10">
            <User size={14} className="text-zinc-500 shrink-0" />
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Usuario"
              autoComplete="username"
              className="bg-transparent outline-none text-sm w-full placeholder:text-zinc-600"
            />
          </div>
          <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 h-10">
            <Lock size={14} className="text-zinc-500 shrink-0" />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="bg-transparent outline-none text-sm w-full placeholder:text-zinc-600"
            />
          </div>

          {mode === 'register' && (
            <>
              <div className="flex items-center gap-2 rounded-md border border-amber-800/60 bg-amber-950/20 px-3 h-10">
                <Ticket size={14} className="text-amber-400 shrink-0" />
                <input
                  value={accessCode}
                  onChange={e => setAccessCode(e.target.value.toUpperCase())}
                  placeholder="Código de acceso"
                  autoComplete="off"
                  className="bg-transparent outline-none text-sm w-full placeholder:text-zinc-600 font-mono tracking-wider"
                />
              </div>
              <p className="text-[11px] text-zinc-500 leading-snug">
                TradeRadar es un servicio por suscripción. Para crear tu cuenta necesitas un
                <strong className="text-amber-300"> código de acceso</strong> que recibes al suscribirte.
                Contacta al administrador para obtenerlo.
              </p>
            </>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <Button type="submit" disabled={busy || !canSubmit}
            className="w-full gap-2 h-11 text-base font-bold bg-emerald-600 hover:bg-emerald-500">
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy
              ? 'Entrando…'
              : mode === 'login'
                ? '▶ INICIAR SESIÓN'
                : '▶ ACTIVAR MI SUSCRIPCIÓN'}
          </Button>
          {mode === 'login' && !busy && (
            <p className="text-[11px] text-zinc-500 text-center">
              Escribe tu usuario y contraseña y pulsa el botón verde de arriba.
            </p>
          )}
        </form>

        <p className="text-[10px] text-zinc-600 text-center mt-4">
          Herramienta educativa de análisis técnico. No es asesoría financiera.
        </p>
      </div>
    </div>
  );
}
