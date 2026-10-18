import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { WATCHLIST } from "@/lib/data";
import { useCandleHistory } from "@/hooks/useCandleHistory";
import { CandleChart } from "@/components/CandleChart";
import {
  completedCandles,
  RULES,
  RULE_VERSION,
  runBacktest,
  strategySeries,
  type Horizon,
} from "@/lib/laboratory";
import { calculatePositionSize } from "@/lib/risk";
import {
  planSchema,
  settleLong,
  type TradingCosts,
  type TradingPlan,
} from "@contracts/trading";
import type { Asset, AssetAnalysis } from "@/types";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm";
const buttonClass =
  "rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-emerald-700";
const boxClass =
  "rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3";
const usd = (n: number) =>
  n.toLocaleString("es", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
const priceText = (n: number) => Number(n.toPrecision(8)).toString();
const date = (n: number) => new Date(n).toLocaleString("es");
const setupNames = {
  wait: "ESPERAR: sin entrada según estas reglas",
  pullback: "Recuperación tras retroceso",
  continuation: "Ruptura en tendencia",
};
const exitNames = {
  stop: "Stop",
  target: "Objetivo",
  trend: "Tendencia invalidada",
  time: "Plazo",
  session: "Fin de sesión",
  "gap-session": "Salto de sesión",
  end: "Fin de muestra",
};

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block space-y-1 text-xs text-zinc-400">
      <span>{label}</span>
      <input
        className={inputClass}
        type="number"
        step="any"
        min={min}
        max={max}
        required
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  );
}

export function TradingLab({ analyses }: { analyses: AssetAnalysis[] }) {
  const [assetClass, setAssetClass] = useState<Asset["assetClass"]>("stock");
  const [horizon, setHorizon] = useState<Horizon>("swing");
  const assets = useMemo(
    () => [
      ...new Map(
        [...WATCHLIST, ...analyses.map(a => a.asset)]
          .filter(a => a.assetClass === assetClass)
          .map(a => [a.id, a])
      ).values(),
    ],
    [analyses, assetClass]
  );
  const [assetId, setAssetId] = useState("AAPL");
  const asset = assets.find(a => a.id === assetId) ?? assets[0];
  const journal = trpc.paper.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Planes, pruebas y simulación</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Cuatro modos para medir tus decisiones. Aquí solo se simulan compras y
          sus salidas; no se envían órdenes al mercado.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-zinc-400 space-y-1">
          Mercado
          <select
            aria-label="Mercado"
            className={inputClass}
            value={assetClass}
            onChange={e => setAssetClass(e.target.value as Asset["assetClass"])}
          >
            <option value="stock">Acciones</option>
            <option value="crypto">Criptomonedas</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400 space-y-1">
          Plazo
          <select
            aria-label="Plazo"
            className={inputClass}
            value={horizon}
            onChange={e => setHorizon(e.target.value as Horizon)}
          >
            <option value="intraday">Intradía · velas de 5 min</option>
            <option value="swing">Varios días · velas de 1 día</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400 space-y-1">
          Activo
          <select
            aria-label="Activo"
            className={inputClass}
            value={asset.id}
            onChange={e => setAssetId(e.target.value)}
          >
            {assets.map(a => (
              <option key={a.id} value={a.id}>
                {a.symbol} · {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Experiment
        key={`${asset.assetClass}:${asset.id}:${horizon}`}
        asset={asset}
        horizon={horizon}
        available={journal.data?.account?.available}
        onOpened={() => journal.refetch()}
      />
      <PaperJournal />
    </div>
  );
}

function Experiment({
  asset,
  horizon,
  available,
  onOpened,
}: {
  asset: Asset;
  horizon: Horizon;
  available?: number;
  onOpened: () => unknown;
}) {
  const { history, error, loading, refresh } = useCandleHistory(
    asset,
    horizon === "intraday" ? "5m" : "1d"
  );
  const [capital, setCapital] = useState("10000"),
    [risk, setRisk] = useState("1");
  const [fee, setFee] = useState(""),
    [fixed, setFixed] = useState(""),
    [slippage, setSlippage] = useState("");
  const costs: TradingCosts = {
    feePercent: Number(fee),
    fixedFee: Number(fixed),
    slippagePercent: Number(slippage),
  };
  const validCosts =
    [fee, fixed, slippage].every(v => v.trim() !== "") &&
    Number(fee) >= 0 &&
    Number(fee) <= 10 &&
    Number(slippage) >= 0 &&
    Number(slippage) <= 10 &&
    Number(fixed) >= 0 &&
    Number(fixed) <= 10000;
  const options = {
    ...costs,
    capital: Number(capital),
    riskPercent: Number(risk),
    horizon,
    assetClass: asset.assetClass,
  };
  const bars = history
    ? completedCandles(history.candles, horizon, asset.assetClass)
    : [];
  const series = strategySeries(bars),
    setup = series.setups.at(-1) ?? "wait";
  const close = bars.at(-1)?.close,
    volatility = series.volatility.at(-1);
  const [draft, setDraft] = useState<{
    entry: string;
    stop: string;
    target: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const [test, setTest] = useState<{
    development: ReturnType<typeof runBacktest>;
    reserved: ReturnType<typeof runBacktest>;
    first: number;
    split: number;
    last: number;
    count: number;
    source: string;
    capital: number;
    costs: TradingCosts;
    risk: number;
  } | null>(null);
  const open = trpc.paper.open.useMutation({
    onSuccess: () => {
      void onOpened();
      setDraft(null);
      setNote("");
      toast.success("Compra simulada guardada con su plan y costes.");
    },
    onError: e => toast.error(e.message),
  });
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  let plan: TradingPlan | null = null,
    sizing: ReturnType<typeof calculatePositionSize> | null = null,
    planError = "";
  if (draft) {
    const parsed = planSchema.safeParse({
      ...costs,
      assetId: asset.id,
      symbol: asset.symbol,
      assetClass: asset.assetClass,
      horizon,
      entry: Number(draft.entry),
      stop: Number(draft.stop),
      target: Number(draft.target),
      riskPercent: Number(risk),
      note,
    });
    if (!parsed.success)
      planError = parsed.error.issues[0]?.message ?? "Revisa el plan.";
    else {
      plan = parsed.data;
      try {
        sizing = calculatePositionSize({
          ...plan,
          capital: available ?? Number(capital),
          direction: "long",
          fractional: asset.assetClass === "crypto",
        });
      } catch (e) {
        planError = e instanceof Error ? e.message : "Revisa el capital.";
      }
    }
  }
  function prepare() {
    if (!close || !volatility || close <= 2 * volatility) return;
    setDraft({
      entry: priceText(close),
      stop: priceText(close - 2 * volatility),
      target: priceText(close + 4 * volatility),
    });
    setRequestId(crypto.randomUUID());
  }
  function evaluate() {
    try {
      if (
        !validCosts ||
        bars.length < 100 ||
        !Number.isFinite(options.capital) ||
        options.capital < 100 ||
        options.capital > 1e8
      )
        throw new Error(
          "Necesitas 100 velas cerradas, capital válido y costes explícitos (pueden ser cero)."
        );
      const split = 50 + Math.floor((bars.length - 50) * 0.7);
      setTest({
        development: runBacktest(bars, options, 50, split),
        reserved: runBacktest(bars, options, split),
        first: bars[50].time,
        split: bars[split].time,
        last: bars.at(-1)!.time,
        count: bars.length,
        source: history!.source,
        capital: options.capital,
        costs: { ...costs },
        risk: options.riskPercent,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo evaluar.");
    }
  }
  return (
    <>
      <div className={boxClass}>
        <div className="flex flex-wrap justify-between gap-2">
          <h3 className="font-semibold">
            {asset.symbol} ·{" "}
            {horizon === "intraday"
              ? "Intradía (5 min)"
              : "Varios días (1 día)"}
          </h3>
          <button
            className="text-xs text-emerald-400"
            disabled={loading}
            onClick={refresh}
          >
            Actualizar datos
          </button>
        </div>
        <p className="text-xs text-zinc-400">
          {history
            ? `${history.source} · ${bars.length} velas cerradas · última: ${bars.length ? date(bars.at(-1)!.time * 1000) : "sin datos"}`
            : "Cargando historial…"}
        </p>
        {(error || history?.stale) && (
          <p role="status" className="text-xs text-amber-300">
            {error ??
              "La fuente está usando un historial anterior. Comprueba su fecha antes de decidir."}
          </p>
        )}
        <CandleChart
          asset={asset}
          height={280}
          initialTimeframe={horizon === "intraday" ? "5m" : "1d"}
        />
        <p className="text-sm text-emerald-300">{setupNames[setup]}</p>
        <p className="text-xs text-zinc-400">
          La lectura usa solo velas cerradas del plazo elegido arriba. El
          gráfico permite consultar otros intervalos. Una caída por sí sola no
          confirma una oportunidad.
        </p>
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer">
            Reglas fijas y límites de la prueba
          </summary>
          <p className="mt-2">{RULES}</p>
          <p className="mt-2">
            Versión {RULE_VERSION}. Intradía intenta cerrar al final de la vela
            de las 15:55 de Nueva York (acciones) o 23:55 UTC (cripto). Si falta
            esa vela, sale en la siguiente apertura disponible y cuenta el salto
            de sesión. No incluye calendario de cierres anticipados, impuestos,
            dividendos ni ejecución real. Históricos gratuitos limitados; no
            equivalen a un estudio de varios años.
          </p>
        </details>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <NumberField
            label="Capital de prueba (USD)"
            value={capital}
            onChange={setCapital}
            min={100}
            max={1e8}
          />
          <NumberField
            label="Riesgo por operación (%)"
            value={risk}
            onChange={setRisk}
            min={0.01}
            max={5}
          />
          <NumberField
            label="Comisión por lado (%)"
            value={fee}
            onChange={setFee}
            max={10}
          />
          <NumberField
            label="Comisión fija por lado (USD)"
            value={fixed}
            onChange={setFixed}
            max={10000}
          />
          <NumberField
            label="Spread y deslizamiento por lado (%)"
            value={slippage}
            onChange={setSlippage}
            max={10}
          />
        </div>
        <p className="text-xs text-zinc-500">
          Introduce los costes de tu intermediario. El cero debe ser una
          decisión explícita. El límite del 5% es un control de la simulación,
          no una recomendación de riesgo.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            className={buttonClass}
            disabled={!validCosts || bars.length < 100}
            onClick={evaluate}
          >
            Probar reglas históricas
          </button>
          <button
            className={buttonClass}
            disabled={!validCosts || !close || !volatility}
            onClick={prepare}
          >
            Preparar plan de compra simulada
          </button>
        </div>
      </div>
      {draft && (
        <form
          className={boxClass}
          onSubmit={e => {
            e.preventDefault();
            if (plan && sizing && validCosts) open.mutate({ requestId, plan });
          }}
        >
          <h3 className="font-semibold">Plan de compra · {asset.symbol}</h3>
          <p className="text-xs text-zinc-400">
            Precio propuesto a partir de una vela cerrada; puedes editarlo.
            Guardarlo registra una ejecución manual hipotética, sin comprobar
            que el mercado acepte ese precio. Stop y objetivo quedan fijos en el
            diario.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["entry", "stop", "target"] as const).map((field, i) => (
              <NumberField
                key={field}
                label={["Entrada (USD)", "Stop (USD)", "Objetivo (USD)"][i]}
                value={draft[field]}
                onChange={v => {
                  setDraft({ ...draft, [field]: v });
                  setRequestId(crypto.randomUUID());
                }}
              />
            ))}
          </div>
          <label className="block text-xs text-zinc-400 space-y-1">
            Motivo e invalidación
            <textarea
              className={inputClass}
              value={note}
              maxLength={500}
              onChange={e => {
                setNote(e.target.value);
                setRequestId(crypto.randomUUID());
              }}
              placeholder="Por qué entrarías y qué haría que dejaras de mantener la compra"
            />
          </label>
          {planError && (
            <p role="alert" className="text-xs text-amber-300">
              {planError}
            </p>
          )}
          {sizing && (
            <p className="text-sm">
              Cantidad:{" "}
              {sizing.quantity.toLocaleString("es", {
                maximumFractionDigits: 8,
              })}{" "}
              · Capital con comisión: {usd(sizing.capitalUsed)} · Pérdida al
              stop: {usd(sizing.estimatedLoss)} · Ganancia al objetivo:{" "}
              {usd(sizing.estimatedGain)} · Relación neta:{" "}
              {sizing.rewardRisk.toFixed(2)}
            </p>
          )}
          <p className="text-xs text-zinc-500">
            Dimensionado con {usd(available ?? Number(capital))} de capital{" "}
            {available === undefined
              ? "de ejemplo; crea una cuenta simulada abajo para guardar"
              : "virtual disponible"}
            . Los saltos de precio pueden superar la pérdida calculada.
          </p>
          <button
            className={buttonClass}
            disabled={
              open.isPending ||
              !plan ||
              !validCosts ||
              !sizing?.quantity ||
              sizing.estimatedGain <= 0 ||
              available === undefined
            }
          >
            Abrir simulación al precio indicado
          </button>
        </form>
      )}
      {test && (
        <div className={boxClass}>
          <h3 className="font-semibold">
            Prueba de {asset.symbol} · resultado histórico, no previsión
          </h3>
          <p className="text-xs text-zinc-400">
            {test.source} · {test.count} velas cerradas ·{" "}
            {date(test.first * 1000)} a {date(test.last * 1000)}. Capital{" "}
            {usd(test.capital)}, riesgo {test.risk}%, comisión{" "}
            {test.costs.feePercent}% + {usd(test.costs.fixedFee)} y
            deslizamiento {test.costs.slippagePercent}% por lado.
          </p>
          <p className="text-xs text-zinc-400">
            50 velas de calentamiento. División cronológica 70/30 sin optimizar
            parámetros. Cada tramo empieza con el mismo capital y sin posición.
            Reserva desde {date(test.split * 1000)}; revisarla repetidamente
            deja de ser una validación independiente.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <TestResult label="Primer tramo (70%)" result={test.development} />
            <TestResult label="Tramo reservado (30%)" result={test.reserved} />
          </div>
          <p className="text-xs text-amber-300">
            La muestra puede ser muy pequeña y está condicionada por los activos
            seleccionados y los datos disponibles. Las operaciones abiertas al
            final se liquidan al cierre de la muestra. Cuando stop y objetivo
            coinciden en una vela, se cuenta el stop primero.
          </p>
        </div>
      )}
    </>
  );
}

function TestResult({
  label,
  result: r,
}: {
  label: string;
  result: ReturnType<typeof runBacktest>;
}) {
  return (
    <div className="space-y-3 min-w-0">
      <h4 className="text-sm font-medium">{label}</h4>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        {[
          ["Resultado neto", `${usd(r.net)} (${r.returnPercent.toFixed(2)}%)`],
          ["Operaciones", String(r.trades.length)],
          [
            "Acierto observado",
            r.winRate === null ? "Sin operaciones" : `${r.winRate.toFixed(1)}%`,
          ],
          ["Caída máxima del capital", `${r.maxDrawdown.toFixed(2)}%`],
          [
            "Media neta por operación",
            r.expectancy === null ? "—" : usd(r.expectancy),
          ],
          [
            "Factor de beneficio",
            r.profitFactor === null
              ? "No estimable: sin pérdidas"
              : r.profitFactor.toFixed(2),
          ],
          ["Comisiones totales", usd(r.fees)],
          [
            "Comprar y mantener, neto",
            r.benchmark === null ? "—" : `${r.benchmark.toFixed(2)}%`,
          ],
          ["Velas con salida ambigua", String(r.ambiguous)],
          ["Salidas tras salto de sesión", String(r.sessionGaps)],
        ].map(([name, value]) => (
          <div key={name} className="rounded bg-zinc-950 p-2">
            <dt className="text-zinc-500">{name}</dt>
            <dd className="mt-1">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="h-44" aria-label={`Evolución del capital: ${label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={r.equity}>
            <CartesianGrid stroke="#27272a" />
            <XAxis dataKey="time" hide />
            <YAxis
              width={55}
              domain={["auto", "auto"]}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              labelFormatter={v => date(Number(v) * 1000)}
              formatter={v => usd(Number(v))}
              contentStyle={{ background: "#18181b", borderColor: "#3f3f46" }}
            />
            <Line
              type="linear"
              dataKey="value"
              name="Capital neto"
              stroke="#34d399"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {r.trades.length < 30 && (
        <p className="text-xs text-amber-300">
          Pocas operaciones: este resultado no demuestra una ventaja.
        </p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer">
          Últimas 10 operaciones de la prueba
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full mt-2 text-left">
            <thead>
              <tr>
                <th>Vela de entrada</th>
                <th>Vela de salida</th>
                <th>Motivo</th>
                <th>Neto</th>
                <th>R</th>
              </tr>
            </thead>
            <tbody>
              {r.trades.slice(-10).map((t, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="p-1">{date(t.entryTime * 1000)}</td>
                  <td>{date(t.exitTime * 1000)}</td>
                  <td>{exitNames[t.reason]}</td>
                  <td>{usd(t.net)}</td>
                  <td>{t.r.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function PaperJournal() {
  const query = trpc.paper.list.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [capital, setCapital] = useState("10000");
  const create = trpc.paper.initialize.useMutation({
    onSuccess: () => utils.paper.list.invalidate(),
    onError: e => toast.error(e.message),
  });
  const account = query.data?.account;
  return (
    <section className={boxClass}>
      <h3 className="font-semibold">Mi diario de operaciones simuladas</h3>
      <p className="text-xs text-zinc-400">
        Guardado en tu cuenta. Capital virtual separado del portafolio real. No
        hay ejecución automática al tocar stop u objetivo: registra la salida y
        su precio observado. Así no se inventan operaciones con cotizaciones
        retrasadas.
      </p>
      {query.isLoading && <p className="text-xs">Cargando diario…</p>}
      {query.error && (
        <div role="alert" className="text-sm text-amber-300">
          No se pudo cargar el diario: {query.error.message}{" "}
          <button className="underline" onClick={() => query.refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {query.data && !account && (
        <form
          className="flex items-end gap-3 flex-wrap"
          onSubmit={e => {
            e.preventDefault();
            create.mutate({ capital: Number(capital) });
          }}
        >
          <NumberField
            label="Capital virtual inicial (USD)"
            value={capital}
            onChange={setCapital}
            min={100}
            max={1e8}
          />
          <button className={buttonClass} disabled={create.isPending}>
            Crear cuenta simulada
          </button>
          <p className="text-xs text-zinc-500 w-full">
            El capital inicial queda fijo para conservar un historial
            comparable. No se ingresa dinero.
          </p>
        </form>
      )}
      {account && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 text-sm">
            {[
              ["Capital inicial", account.initialCapital],
              ["Resultado cerrado neto", account.realized],
              ["Saldo realizado", account.equity],
              ["Efectivo disponible", account.available],
              ["Riesgo de planes abiertos", account.openRisk],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-xs text-zinc-500">{label}</p>
                <p>{usd(Number(value))}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400">
            {account.closedCount} operaciones cerradas · Acierto observado:{" "}
            {account.winRate === null
              ? "sin datos"
              : `${account.winRate.toFixed(1)}%`}{" "}
            · Media neta:{" "}
            {account.expectancy === null
              ? "sin datos"
              : usd(account.expectancy)}
            . Estos resultados describen tu simulación y no predicen beneficios
            reales.
          </p>
          <p className="text-xs text-zinc-500">
            El saldo realizado no incluye fluctuaciones de las posiciones
            abiertas. Capital reservado: {usd(account.reserved)}. Riesgo
            conjunto limitado al 5% del saldo; no evita pérdidas por saltos de
            precio. {account.openCount} abiertas. Se muestran las últimas 100 y
            todas las abiertas; el saldo incluye todo el historial.
          </p>
          {query.data!.trades.length === 0 && (
            <p className="text-sm text-zinc-400">
              Todavía no hay compras simuladas. Prepara un plan arriba.
            </p>
          )}
          <div className="space-y-3">
            {query.data!.trades.map(t => (
              <JournalTrade key={t.id} trade={t} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

type JournalRow =
  inferRouterOutputs<AppRouter>["paper"]["list"]["trades"][number];
function JournalTrade({ trade: t }: { trade: JournalRow }) {
  const [exit, setExit] = useState(""),
    [reason, setReason] = useState<"manual" | "stop" | "target" | "time">(
      "manual"
    );
  const utils = trpc.useUtils();
  const close = trpc.paper.close.useMutation({
    onSuccess: () => {
      void utils.paper.list.invalidate();
      toast.success("Salida simulada guardada.");
    },
    onError: e => toast.error(e.message),
  });
  const p = t.plan;
  const preview =
    Number.isFinite(Number(exit)) && Number(exit) > 0 && Number(exit) <= 1e12
      ? settleLong(p.quantity, p.entryFill, p.entryFee, Number(exit), p)
      : null;
  return (
    <article className="rounded-lg border border-zinc-800 p-3 space-y-2">
      <h4 className="font-medium text-sm">
        {p.symbol} · {p.assetClass === "stock" ? "Acciones" : "Cripto"} ·{" "}
        {p.horizon === "intraday" ? "Intradía" : "Varios días"} ·{" "}
        {t.closedAt ? "Cerrada" : "Compra abierta: mantener o registrar salida"}
      </h4>
      <p className="text-xs text-zinc-400">
        {date(new Date(t.createdAt).getTime())} ·{" "}
        {p.quantity.toLocaleString("es", { maximumFractionDigits: 8 })} unidades
        · Entrada con deslizamiento: {priceText(p.entryFill)} USD · Stop:{" "}
        {priceText(p.stop)} · Objetivo: {priceText(p.target)}
      </p>
      <p className="text-xs text-zinc-500">
        Comisión {p.feePercent}% + {usd(p.fixedFee)}; deslizamiento{" "}
        {p.slippagePercent}% por lado. Riesgo inicial {usd(p.estimatedLoss)}.
      </p>
      {p.note && <p className="text-xs text-zinc-400">Motivo: {p.note}</p>}
      {t.closedAt ? (
        <p className="text-sm">
          Salida: {date(new Date(t.closedAt).getTime())} ·{" "}
          {priceText(t.exitPrice!)} USD · Neto: {usd(t.net!)} ·{" "}
          {(t.net! / p.estimatedLoss).toFixed(2)} R · {t.exitReason}
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={e => {
            e.preventDefault();
            close.mutate({ id: t.id, price: Number(exit), reason });
          }}
        >
          <NumberField
            label="Precio observado de salida (USD)"
            value={exit}
            onChange={setExit}
            min={0}
          />
          <label className="text-xs text-zinc-400 space-y-1">
            Motivo de salida
            <select
              className={inputClass}
              value={reason}
              onChange={e => setReason(e.target.value as typeof reason)}
            >
              <option value="manual">Decisión manual</option>
              <option value="stop">Stop</option>
              <option value="target">Objetivo</option>
              <option value="time">Plazo o fin de sesión</option>
            </select>
          </label>
          <button
            className={buttonClass}
            disabled={close.isPending || !preview}
          >
            Cerrar compra simulada
          </button>
          {preview && (
            <p className="text-xs w-full">
              Resultado neto hipotético al cerrar: {usd(preview.net)}. La salida
              guardada no se puede reescribir.
            </p>
          )}
        </form>
      )}
    </article>
  );
}
