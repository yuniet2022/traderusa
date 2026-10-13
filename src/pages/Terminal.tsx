import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dashboard } from '@/sections/Dashboard';
import { AssetDetail } from '@/sections/AssetDetail';
import { Research } from '@/sections/Research';
import { SearchBox } from '@/components/SearchBox';
import { AlertsPanel } from '@/components/AlertsPanel';
import { PortfolioPanel } from '@/components/PortfolioPanel';
import { AdminPanel } from '@/components/AdminPanel';
import { useMarketData } from '@/hooks/useMarketData';
import { useAuth, type SessionUser } from '@/hooks/useAuth';
import { ensureNotifyPermission } from '@/lib/alerts';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import type { Asset, AssetAnalysis } from '@/types';
import { Radar, BookOpen, LayoutDashboard, LogOut } from 'lucide-react';

export default function Terminal({ user }: { user: SessionUser }) {
  const { analyses, loading, liveCount, updatedAt, refresh, addAsset, alerts, addAlert, removeAlert, portfolio, addPosition, removePosition } = useMarketData(user.id);
  const { logout } = useAuth();
  const [selected, setSelected] = useState<AssetAnalysis | null>(null);

  // pedir permiso de notificaciones al abrir para las alertas automáticas
  useEffect(() => {
    const t = setTimeout(() => { ensureNotifyPermission(); }, 2500);
    return () => clearTimeout(t);
  }, []);

  const handlePick = async (asset: Asset) => {
    toast.loading(`Analizando ${asset.symbol}…`, { id: 'pick' });
    const analysis = await addAsset(asset);
    toast.dismiss('pick');
    if (analysis) {
      setSelected(analysis);
    } else {
      toast.error(`No se encontraron datos suficientes para ${asset.symbol}`);
    }
  };

  const handleQuickAlert = (a: AssetAnalysis) => {
    // Si está en compra → avisar cuándo vender (salida); si no → avisar cuándo comprar (entrada)
    if (a.composite >= 20) {
      addAlert({ assetId: a.asset.id, symbol: a.asset.symbol, kind: 'signal_sell' });
    } else {
      addAlert({ assetId: a.asset.id, symbol: a.asset.symbol, kind: 'signal_buy' });
    }
  };

  const handleTogglePortfolio = (a: AssetAnalysis) => {
    const exists = portfolio.some(p => p.assetId === a.asset.id);
    if (exists) {
      removePosition(a.asset.id);
      toast(`${a.asset.symbol} eliminado de tu portafolio`);
    } else {
      addPosition({ assetId: a.asset.id, symbol: a.asset.symbol, assetClass: a.asset.assetClass, lots: [] });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="rounded-lg bg-emerald-500/15 p-1.5">
              <Radar size={20} className="text-emerald-400" />
            </div>
            <h1 className="font-bold leading-tight hidden sm:block">TradeRadar</h1>
          </div>
          <SearchBox onPick={handlePick} />
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <PortfolioPanel
              positions={portfolio}
              analyses={analyses}
              onAdd={addAsset}
              onSave={addPosition}
              onRemove={removePosition}
              onSelect={setSelected}
            />
            <AlertsPanel alerts={alerts} analyses={analyses} onAdd={addAlert} onRemove={removeAlert} />
            <div className="hidden md:flex flex-col items-end">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[11px] text-zinc-400">datos reales en vivo</span>
              </div>
              <span className="text-[10px] text-zinc-600">alertas automáticas activadas</span>
            </div>
            <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-800">
              {user.isAdmin && <AdminPanel />}
              <span className="text-xs text-zinc-400 hidden sm:inline max-w-24 truncate">{user.displayName ?? user.username}</span>
              <button onClick={() => logout.mutate()} title="Cerrar sesión"
                className="text-zinc-500 hover:text-red-400 transition-colors p-1">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        {user.daysLeft !== null && user.daysLeft <= 7 && (
          <div className="mb-4 rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
            Tu suscripción {user.daysLeft <= 0 ? 'está por vencer hoy' : `vence en ${user.daysLeft} día${user.daysLeft === 1 ? '' : 's'}`}.
            Contacta al administrador para renovarla y no perder acceso.
          </div>
        )}
        <Tabs defaultValue="dashboard">
          <TabsList className="mb-5">
            <TabsTrigger value="dashboard" className="gap-1.5">
              <LayoutDashboard size={14} /> Señales en vivo
            </TabsTrigger>
            <TabsTrigger value="research" className="gap-1.5">
              <BookOpen size={14} /> Investigación
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            <Dashboard
              analyses={analyses}
              positions={portfolio}
              loading={loading}
              liveCount={liveCount}
              updatedAt={updatedAt}
              onSelect={setSelected}
              onRefresh={refresh}
              onQuickAlert={handleQuickAlert}
            />
          </TabsContent>
          <TabsContent value="research">
            <Research />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-zinc-800 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-4 text-[11px] text-zinc-600 leading-relaxed">
          TradeRadar es una herramienta educativa de análisis técnico. No es asesoría financiera ni garantiza resultados.
          Las decisiones de inversión y la ejecución de órdenes son responsabilidad tuya. Fuentes: Binance, CoinGecko, Yahoo Finance y Stooq.
        </div>
      </footer>

      <AssetDetail
        analysis={selected}
        onClose={() => setSelected(null)}
        inPortfolio={selected ? portfolio.some(p => p.assetId === selected.asset.id) : false}
        onTogglePortfolio={handleTogglePortfolio}
      />
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}
