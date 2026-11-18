import { lazy, Suspense, useState } from 'react';
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
import { useDayTrading } from '@/hooks/useDayTrading';
import { DayTrading } from '@/sections/DayTrading';
import type { IntradayInterval } from '@/lib/intraday';
import { OpportunityDetail } from '@/sections/OpportunityDetail';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import type { Asset, AssetAnalysis } from '@/types';
import { Radar, BookOpen, LayoutDashboard, LogOut } from 'lucide-react';

const TradingLab = lazy(() => import('@/sections/TradingLab').then(module => ({ default: module.TradingLab })));

export default function Terminal({ user }: { user: SessionUser }) {
  const { analyses, loading, marketNotice, progress, quoteCount, updatedAt, refresh, addAsset, alerts, addAlert, removeAlert, portfolio, addPosition, removePosition } = useMarketData(user.id);
  const { logout } = useAuth();
  const [selected, setSelected] = useState<AssetAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [detailInterval, setDetailInterval] = useState<IntradayInterval>('5m');
  const [opportunity,setOpportunity]=useState<{asset:Asset;interval:IntradayInterval;daily:AssetAnalysis['candles']}|null>(null);
  const monitor = useDayTrading(analyses, portfolio, alerts);
  const openAnalysis = (analysis: AssetAnalysis, interval: IntradayInterval = '5m') => {
    setOpportunity(null);setDetailInterval(interval); setSelected(analysis);
  };
  const selectedAnalysis = selected
    ? analyses.find(a => a.asset.id === selected.asset.id && a.asset.assetClass === selected.asset.assetClass) ?? selected
    : null;

  const handlePick = async (asset: Asset) => {
    toast.loading(`Analizando ${asset.symbol}…`, { id: 'pick' });
    const analysis = await addAsset(asset);
    toast.dismiss('pick');
    if (analysis) {
      openAnalysis(analysis);
    } else {
      toast.error(`No se encontraron datos suficientes para ${asset.symbol}`);
    }
  };

  const handleQuickAlert = (a: AssetAnalysis) => {
    // Alert on a change in technical direction; never label it as a personal exit.
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
    <div className="min-h-screen min-w-0 bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex sm:flex-wrap lg:flex-nowrap">
          <div className="flex items-center gap-2 shrink-0">
            <div className="rounded-lg bg-emerald-500/15 p-1.5">
              <Radar size={20} className="text-emerald-400" />
            </div>
            <h1 className="font-bold leading-tight hidden min-[400px]:block">TradeRadar</h1>
          </div>
          <SearchBox onPick={handlePick} className="col-span-2 row-start-2 max-w-none sm:max-w-sm" />
          <div className="col-start-2 row-start-1 ml-auto flex min-w-0 items-center gap-2 shrink-0">
            <PortfolioPanel
              positions={portfolio}
              analyses={analyses}
              onAdd={addAsset}
              onSave={addPosition}
              onRemove={removePosition}
              onSelect={openAnalysis}
            />
            <AlertsPanel alerts={alerts} analyses={analyses} onAdd={addAlert} onRemove={removeAlert} />
            <div className="hidden md:flex flex-col items-end">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[11px] text-zinc-400">consulta cada 30 s</span>
              </div>
              <span className="text-[10px] text-zinc-400">{monitor.enabled ? 'day trading en vigilancia' : 'contexto diario y alertas de precio'}</span>
            </div>
            <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-800">
              {user.isAdmin && <AdminPanel />}
              <span className="text-xs text-zinc-400 hidden sm:inline max-w-24 truncate">{user.displayName ?? user.username}</span>
              <button onClick={() => logout.mutate()} title="Cerrar sesión" aria-label="Cerrar sesión"
                className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-400 hover:text-red-400 transition-colors sm:h-8 sm:w-8">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full min-w-0 max-w-6xl mx-auto px-3 py-4 sm:px-4 sm:py-5">
        {user.daysLeft !== null && user.daysLeft <= 7 && (
          <div className="mb-4 rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
            Tu suscripción {user.daysLeft <= 0 ? 'está por vencer hoy' : `vence en ${user.daysLeft} día${user.daysLeft === 1 ? '' : 's'}`}.
            Contacta al administrador para renovarla y no perder acceso.
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 grid h-auto w-full grid-cols-2 sm:mb-5 sm:inline-flex sm:w-fit sm:flex-wrap">
            <TabsTrigger value="dashboard" className="h-auto min-h-11 gap-1 px-2 text-xs whitespace-normal sm:min-h-8 sm:text-sm">
              <LayoutDashboard size={14} className="hidden sm:block" /> Contexto diario
            </TabsTrigger>
            <TabsTrigger value="daytrading" className="h-auto min-h-11 gap-1 px-2 text-xs whitespace-normal sm:min-h-8 sm:text-sm">Day trading{monitor.enabled ? ' · activo' : ''}</TabsTrigger>
            <TabsTrigger value="research" className="h-auto min-h-11 gap-1 px-2 text-xs whitespace-normal sm:min-h-8 sm:text-sm">
              <BookOpen size={14} className="hidden sm:block" /> Investigación
            </TabsTrigger>
            <TabsTrigger value="laboratory" className="h-auto min-h-11 px-2 text-xs whitespace-normal sm:min-h-8 sm:text-sm">Planes y simulación</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            <Dashboard
              analyses={analyses}
              positions={portfolio}
              loading={loading}
              quoteCount={quoteCount}
              updatedAt={updatedAt}
              marketNotice={marketNotice}
              progress={progress}
              onSelect={openAnalysis}
              onDayTrading={() => setActiveTab('daytrading')}
              onRefresh={refresh}
              onQuickAlert={handleQuickAlert}
            />
          </TabsContent>
          <TabsContent value="daytrading">
            <DayTrading monitor={monitor} onSelect={(asset,interval)=>{
              const known=analyses.find(a=>a.asset.id===asset.id&&a.asset.assetClass===asset.assetClass);
              if(known)openAnalysis(known,interval);
              else {setSelected(null);setOpportunity({asset,interval,daily:monitor.dailyFor(asset)});}
            }} />
          </TabsContent>
          <TabsContent value="research">
            <Research />
          </TabsContent>
          <TabsContent value="laboratory">
            <Suspense fallback={<p className="text-sm text-zinc-400">Cargando planes y simulación…</p>}>
              <TradingLab analyses={analyses} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-zinc-800 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-4 text-[11px] text-zinc-600 leading-relaxed">
          TradeRadar es una herramienta educativa de análisis técnico. No es asesoría financiera ni garantiza resultados.
          Las decisiones de inversión y la ejecución de órdenes son responsabilidad tuya. Fuentes: Kraken, Coinbase Exchange, Binance, Yahoo Finance y Stooq.
        </div>
      </footer>

      <AssetDetail
        key={`${selected?.asset.assetClass}:${selected?.asset.id}:${detailInterval}`}
        analysis={selectedAnalysis}
        initialTimeframe={detailInterval}
        onWatchIntraday={interval => { monitor.setInterval(interval); monitor.start(); setSelected(null); setActiveTab('daytrading'); }}
        onClose={() => setSelected(null)}
        inPortfolio={selected ? portfolio.some(p => p.assetId === selected.asset.id && p.assetClass === selected.asset.assetClass) : false}
        position={selected ? portfolio.find(p => p.assetId === selected.asset.id && p.assetClass === selected.asset.assetClass) : undefined}
        alerts={alerts}
        onAddAlert={async alert => { if (!await addAlert(alert)) throw new Error('Alert save failed'); }}
        onRemoveAlert={removeAlert}
        onTogglePortfolio={handleTogglePortfolio}
      />
      {opportunity&&<OpportunityDetail key={`${opportunity.asset.assetClass}:${opportunity.asset.id}`} asset={opportunity.asset} daily={opportunity.daily} initialInterval={opportunity.interval} position={portfolio.find(p=>p.assetId===opportunity.asset.id&&p.assetClass===opportunity.asset.assetClass)} alerts={alerts} onClose={()=>setOpportunity(null)} onRegister={asset=>{void addPosition({assetId:asset.id,symbol:asset.symbol,assetClass:asset.assetClass,lots:[]});}}/>}
      <Toaster position="bottom-right" theme="dark" visibleToasts={3} />
    </div>
  );
}
