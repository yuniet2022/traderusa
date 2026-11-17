import { useState } from "react";
import type { AssetAnalysis } from "@/types";
import type { useDayTrading } from "@/hooks/useDayTrading";
import { assetKey, type IntradayInterval } from "@/lib/intraday";
import { ensureNotifyPermission } from "@/lib/alerts";
import { fmtPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  monitor: ReturnType<typeof useDayTrading>;
  analyses: AssetAnalysis[];
  onSelect: (analysis: AssetAnalysis, interval: IntradayInterval) => void;
}
export function DayTrading({ monitor: m, analyses, onSelect }: Props) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const live = m.enabled ? m.actions : [];
  const rows = live
    .filter(
      a =>
        (filter === "all" || a.reading.asset.assetClass === filter) &&
        (actionFilter === "all" || a.kind === actionFilter) &&
        `${a.reading.asset.symbol} ${a.reading.asset.name}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
    )
    .sort(
      (a, b) =>
        ({ sell: 0, buy: 1, wait: 2, blocked: 3 })[a.kind] -
          { sell: 0, buy: 1, wait: 2, blocked: 3 }[b.kind] ||
        a.reading.asset.symbol.localeCompare(b.reading.asset.symbol)
    );
  const open = (key: string, interval = m.interval) => {
    const a = analyses.find(a => assetKey(a.asset) === key);
    if (a) onSelect(a, interval);
  };
  return (
    <section aria-label="Monitor de day trading" className="min-w-0 space-y-4">
      <div className="rounded-xl border border-indigo-800/60 bg-indigo-950/20 p-4 space-y-3">
        <h2 className="text-lg font-semibold">
          Day trading · Compras y salidas intradía
        </h2>
        <p className="text-sm text-zinc-300">
          Busca setups con cierres y volumen en los {analyses.length} activos
          cargados, incluidos los que no tienen sesgo alcista diario. Las ventas
          se revisan solo sobre tus compras registradas.
        </p>
        <p className="text-xs text-zinc-400">
          No hay un cupo de 3 o 4 compras. El número depende de las condiciones
          y de los datos disponibles; más avisos no implica más ganancias.
          Puedes añadir activos con el buscador.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs">
            Velas intradía{" "}
            <select
              aria-label="Velas del monitor de day trading"
              value={m.interval}
              onChange={e => m.setInterval(e.target.value as IntradayInterval)}
              className="h-11 rounded border border-zinc-700 bg-zinc-950 px-2"
            >
              <option value="1m">1 min</option>
              <option value="5m">5 min</option>
              <option value="15m">15 min</option>
            </select>
          </label>
          <Button
            size="sm"
            className="min-h-11"
            onClick={m.enabled ? m.stop : m.start}
            disabled={!analyses.length}
          >
            {m.enabled ? "Pausar vigilancia" : "Iniciar vigilancia intradía"}
          </Button>
          {m.enabled && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={m.refresh}
              disabled={m.scanning}
            >
              Revisar ahora
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 h-auto whitespace-normal"
            onClick={async () => {
              try {
                const allowed = await ensureNotifyPermission();
                toast(
                  allowed
                    ? "Permiso de notificaciones concedido"
                    : "Usa los avisos dentro de la app",
                  {
                    description: allowed
                      ? "Inicia la vigilancia y mantén la pestaña visible. Los avisos externos dependen del soporte del navegador; también aparecen dentro de la app."
                      : "Este navegador no las permite o no están autorizadas. El monitor conserva sus avisos mientras está abierto.",
                  }
                );
              } catch {
                toast("Usa los avisos dentro de la app");
              }
            }}
          >
            Activar notificaciones del navegador
          </Button>
        </div>
        <p className="text-xs text-indigo-200" role="status">
          {!m.enabled
            ? "Vigilancia pausada. Iníciala para recibir avisos."
            : m.scanning
              ? `Revisando ${m.progress}/${analyses.length} activos…`
              : "Vigilancia activa · nuevas rondas cada 20 segundos."}
        </p>
        <p className="text-[11px] text-zinc-400">
          Avisos dentro de la app y del navegador cuando sean compatibles.
          Requieren app abierta y pestaña visible; no hay avisos con la app
          cerrada. Las fuentes lentas pueden alargar una ronda. No ejecuta
          compras ni ventas.
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          ["Posibles compras", live.filter(a => a.kind === "buy").length],
          [
            "Revisar ventas propias",
            live.filter(a => a.kind === "sell").length,
          ],
          ["Con datos vigentes", live.filter(a => a.reading.dataReady).length],
          ["Activos cargados", analyses.length],
        ].map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 rounded-lg border border-zinc-800 p-3"
          >
            <p className="text-xs text-zinc-400">{label}</p>
            <p className="mt-1 text-xl font-semibold">
              {m.enabled ? value : "—"}
            </p>
          </div>
        ))}
      </div>
      {m.enabled && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <label className="col-span-2 sm:col-span-1 min-w-0">
              Buscar activo
              <input
                aria-label="Buscar en day trading"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="mt-1 h-11 w-full min-w-0 rounded border border-zinc-700 bg-zinc-950 px-2"
              />
            </label>
            <label>
              Mercado
              <select
                aria-label="Mercado de day trading"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="mt-1 h-11 w-full rounded border border-zinc-700 bg-zinc-950 px-2"
              >
                <option value="all">Todos</option>
                <option value="stock">Acciones</option>
                <option value="crypto">Cripto</option>
              </select>
            </label>
            <label>
              Mostrar
              <select
                aria-label="Avisos de day trading"
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                className="mt-1 h-11 w-full rounded border border-zinc-700 bg-zinc-950 px-2"
              >
                <option value="all">Todos los estados</option>
                <option value="buy">Posibles compras</option>
                <option value="sell">Revisar ventas</option>
                <option value="blocked">Sin confirmación</option>
                <option value="wait">Esperar</option>
              </select>
            </label>
          </div>
          <div
            className="grid gap-3 lg:grid-cols-2"
            aria-label="Resultados de day trading"
          >
            {rows.map(a => (
              <article
                key={a.key}
                aria-label={`Day trading ${a.reading.asset.symbol}`}
                className={`min-w-0 rounded-xl border p-4 space-y-2 ${a.kind === "buy" ? "border-emerald-700 bg-emerald-950/15" : a.kind === "sell" ? "border-amber-700 bg-amber-950/15" : "border-zinc-800 bg-zinc-900/40"}`}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">
                    {a.reading.asset.symbol}{" "}
                    <span className="text-xs font-normal text-zinc-400">
                      {a.reading.asset.assetClass === "stock"
                        ? "Acción"
                        : "Cripto"}
                    </span>
                  </h3>
                  <span className="text-xs text-zinc-400">
                    {m.interval} · {a.reading.source}
                  </span>
                </div>
                <p
                  className={`text-sm font-semibold ${a.kind === "buy" ? "text-emerald-300" : a.kind === "sell" ? "text-amber-300" : "text-zinc-300"}`}
                >
                  {a.title}
                </p>
                <p className="text-xs leading-relaxed text-zinc-300">
                  {a.detail}
                </p>
                {a.reading.dataReady && a.reading.observedPrice != null && (
                  <p className="text-xs">
                    Precio disponible: {fmtPrice(a.reading.observedPrice)}
                  </p>
                )}
                <p className="text-[11px] text-zinc-400">
                  Último cierre:{" "}
                  {a.reading.lastClosedAt
                    ? new Date(a.reading.lastClosedAt).toLocaleTimeString("es")
                    : "pendiente"}{" "}
                  · consulta:{" "}
                  {a.reading.fetchedAt
                    ? new Date(a.reading.fetchedAt).toLocaleTimeString("es")
                    : "pendiente"}
                  .
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-10"
                  onClick={() => open(a.key)}
                >
                  Ver gráfico intradía de {a.reading.asset.symbol}
                </Button>
              </article>
            ))}
          </div>
          {!rows.length && (
            <p className="text-sm text-zinc-400">
              No hay activos con estos filtros. Se muestran solo setups que
              cumplan las reglas; no se generan señales para completar una
              cantidad.
            </p>
          )}
        </>
      )}
      <details
        className="rounded-xl border border-zinc-800 p-4"
        open={m.notices.length > 0}
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Historial de avisos de esta sesión ({m.notices.length})
        </summary>
        <p className="mt-2 text-xs text-zinc-400">
          Hasta 50 avisos; son registros de lo que se detectó entonces. Abre el
          gráfico para comprobar si siguen vigentes. Se reinicia al recargar.
        </p>
        {m.notices.map(n => (
          <div
            key={n.id}
            className="mt-3 border-t border-zinc-800 pt-3 text-xs space-y-1"
          >
            <p className="font-semibold">
              {n.action.reading.asset.symbol} · {n.action.title} ·{" "}
              {new Date(n.at).toLocaleTimeString("es")}
            </p>
            <p className="text-zinc-400">{n.action.detail}</p>
            <button
              className="min-h-9 text-indigo-300 underline"
              onClick={() =>
                open(
                  n.action.key,
                  n.action.reading.intervalSeconds === 60
                    ? "1m"
                    : n.action.reading.intervalSeconds === 900
                      ? "15m"
                      : "5m"
                )
              }
            >
              Revisar vigencia en el gráfico
            </button>
          </div>
        ))}
      </details>
    </section>
  );
}
