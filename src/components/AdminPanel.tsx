import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Copy, Plus, Ban, Loader2, Ticket, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function fmtDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminPanel() {
  const utils = trpc.useUtils();
  const codes = trpc.admin.listCodes.useQuery(undefined, { retry: false });
  const users = trpc.admin.listUsers.useQuery(undefined, { retry: false });
  const [days, setDays] = useState(30);
  const [note, setNote] = useState('');

  const createCode = trpc.admin.createCode.useMutation({
    onSuccess: (r) => {
      utils.admin.listCodes.invalidate();
      navigator.clipboard?.writeText(r.code).catch(() => {});
      toast.success(`Código ${r.code} creado y copiado al portapapeles`);
    },
    onError: e => toast.error(e.message),
  });
  const revoke = trpc.admin.revokeCode.useMutation({
    onSuccess: () => { utils.admin.listCodes.invalidate(); toast('Código revocado'); },
  });
  const extend = trpc.admin.extendUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); toast.success('Suscripción extendida'); },
  });
  const suspend = trpc.admin.suspendUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); toast('Usuario suspendido'); },
  });

  const copy = (code: string) => {
    navigator.clipboard?.writeText(code).then(
      () => toast.success(`${code} copiado`),
      () => toast(code),
    );
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button aria-label="Administración" variant="outline" size="sm" className="h-10 sm:h-8 gap-1.5 border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-950/50">
          <ShieldCheck size={14} />
          <span className="hidden sm:inline">Admin</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">Panel de administración</SheetTitle>
        </SheetHeader>

        {/* Generar código */}
        <div className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 space-y-2.5">
          <p className="text-xs text-amber-300 font-medium flex items-center gap-1.5">
            <Ticket size={13} /> Generar código de acceso
          </p>
          <p className="text-[11px] text-zinc-400 leading-snug">
            Cuando alguien te pague la suscripción, genera un código y envíaselo. Cada código
            sirve para crear UNA cuenta. Si no lo usa, puedes revocarlo.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              aria-label="Duración del código" className="min-w-0 bg-zinc-900 border border-zinc-700 rounded-md text-xs px-2 h-10 sm:h-9 text-zinc-200">
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
              <option value={90}>90 días</option>
              <option value={365}>1 año</option>
            </select>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nota (ej. nombre del cliente)"
              aria-label="Nota del código" className="col-span-2 row-start-2 min-w-0 sm:flex-1 bg-zinc-900 border border-zinc-700 rounded-md text-xs px-2.5 h-10 sm:h-9 outline-none placeholder:text-zinc-500" />
            <Button size="sm" onClick={() => createCode.mutate({ days, note: note || undefined })}
              disabled={createCode.isPending}
              className="col-start-2 row-start-1 min-w-0 gap-1 bg-amber-600 hover:bg-amber-500 text-zinc-950 font-semibold h-10 sm:h-9">
              {createCode.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Generar
            </Button>
          </div>
        </div>

        {/* Códigos */}
        <div className="mt-4 space-y-1.5">
          <p className="text-xs text-zinc-400 font-medium">Códigos generados:</p>
          {(codes.data ?? []).length === 0 && (
            <p className="text-[11px] text-zinc-600 py-3 text-center">Aún no has generado códigos.</p>
          )}
          {(codes.data ?? []).map(c => (
            <div key={c.id} className={cn(
              'rounded-lg border px-3 py-2 flex flex-wrap items-center gap-2',
              c.usedBy ? 'border-zinc-800 bg-zinc-900/40 opacity-60'
              : c.revoked ? 'border-red-900/50 bg-red-950/10 opacity-60'
              : 'border-emerald-800/50 bg-emerald-950/20')}>
              <span className="min-w-0 break-all font-mono text-sm font-bold tracking-wider">{c.code}</span>
              <span className="text-[10px] text-zinc-500">{c.days}d</span>
              {c.note && <span className="text-[10px] text-zinc-500 truncate max-w-20">{c.note}</span>}
              <span className={cn('ml-auto text-[10px] font-semibold',
                c.usedBy ? 'text-zinc-500' : c.revoked ? 'text-red-400' : 'text-emerald-400')}>
                {c.usedBy ? `usado por ${c.usedBy}` : c.revoked ? 'revocado' : 'disponible'}
              </span>
              {!c.usedBy && !c.revoked && (
                <>
                  <button onClick={() => copy(c.code)} className="text-zinc-400 hover:text-zinc-100" title="Copiar">
                    <Copy size={13} />
                  </button>
                  <button onClick={() => revoke.mutate({ code: c.code })} className="text-zinc-500 hover:text-red-400" title="Revocar">
                    <Ban size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Usuarios */}
        <div className="mt-5 space-y-1.5">
          <p className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
            <Users size={13} /> Suscriptores:
          </p>
          {(users.data ?? []).map(u => (
            <div key={u.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{u.username}</span>
                {u.isAdmin && <span className="text-[9px] uppercase font-bold text-amber-400 border border-amber-800 rounded px-1">admin</span>}
                <span className={cn('ml-auto text-[11px] font-mono',
                  u.daysLeft === null ? 'text-zinc-500'
                  : u.daysLeft < 0 ? 'text-red-400'
                  : u.daysLeft <= 5 ? 'text-amber-400' : 'text-emerald-400')}>
                  {u.daysLeft === null ? 'sin vencimiento'
                    : u.daysLeft < 0 ? 'vencido'
                    : `${u.daysLeft} días restantes`}
                </span>
              </div>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                alta {fmtDate(u.createdAt)} · último acceso {fmtDate(u.lastSignInAt)}
                {u.expiresAt ? ` · vence ${fmtDate(u.expiresAt)}` : ''}
              </p>
              {!u.isAdmin && (
                <div className="flex gap-1.5 mt-1.5">
                  <button onClick={() => extend.mutate({ username: u.username, days: 30 })}
                    className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/50 border border-emerald-800 text-emerald-300 hover:bg-emerald-900">
                    +30 días
                  </button>
                  <button onClick={() => extend.mutate({ username: u.username, days: 365 })}
                    className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/50 border border-emerald-800 text-emerald-300 hover:bg-emerald-900">
                    +1 año
                  </button>
                  <button onClick={() => suspend.mutate({ username: u.username })}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-950/50 border border-red-900 text-red-300 hover:bg-red-950">
                    Suspender
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-zinc-600 leading-relaxed">
          Flujo de cobro: el cliente te paga → generas un código con la duración comprada → se lo envías →
          crea su cuenta con ese código. Al vencerse, su acceso se bloquea hasta que lo extiendas.
        </p>
      </SheetContent>
    </Sheet>
  );
}
