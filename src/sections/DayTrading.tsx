import { useState } from "react";
import type { Asset } from "@/types";
import type { useDayTrading } from "@/hooks/useDayTrading";
import { assetKey, type IntradayInterval } from "@/lib/intraday";
import { ensureNotifyPermission } from "@/lib/alerts";
import { fmtPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RobinhoodBadge } from "@/components/RobinhoodBadge";

interface Props {
  monitor: ReturnType<typeof useDayTrading>;
  onSelect: (asset: Asset, interval: IntradayInterval) => void;
}
export function DayTrading({ monitor: m, onSelect }: Props) {
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
    const a = m.assets.find(a => assetKey(a) === key);
    if (a) onSelect(a, interval);
  };
  const matches = query.trim()
    ? m.assets.filter(a =>
        `${a.symbol} ${a.name}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
    : [];
  return (
    <section aria-label="Monitor de day trading" className="min-w-0 space-y-4">
      <div className="rounded-xl border border-indigo-800/60 bg-indigo-950/20 p-4 space-y-3">
        <h2 className="text-lg font-semibold">
          Day trading · Compras y salidas intradía
        </h2>
        <p className="text-sm text-zinc-300">
          Busca compras en el catálogo ampliado de acciones y ETF de EE. UU. y
          criptomonedas, sin limitarse a tu lista ni al sesgo diario. Las ventas
          se revisan solo sobre tus compras registradas.
        </p>
        <p className="text-xs text-zinc-400">
          No hay un cupo de 3 o 4 compras. El número depende de las condiciones
          y de los datos disponibles; más avisos no implica más ganancias. El
          barrido es progresivo: miles de activos no se confirman
          simultáneamente. Cada entrada necesita datos actuales. Los avisos
          masivos se agrupan; agruparlos no limita cuántos activos se analizan.
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
              ? `Ronda en curso: ${m.progress} activos comprobados · barrido progresivo`
              : "Vigilancia activa · nuevas rondas cada 20 segundos."}
        </p>
        <p className="text-[11px] text-zinc-400">
          Avisos dentro de la app y del navegador cuando sean compatibles.
          Requieren app abierta y pestaña visible; no hay avisos con la app
          cerrada. Las fuentes lentas pueden alargar una ronda. No ejecuta
          compras ni ventas.
        </p>
      </div>
      <section
        aria-label="Cobertura del mercado"
        className="rounded-xl border border-zinc-800 p-4 space-y-2"
      >
        <h3 className="text-sm font-semibold">
          Cobertura de compras del mercado
        </h3>
        <p className="text-[11px] text-zinc-400">
          La etiqueta «En Robinhood» aparece solo cuando se verifica su catálogo
          público. La ausencia de etiqueta no confirma que el activo esté
          excluido; puede faltar verificación. Depende también de tu cuenta y
          región.
        </p>
        <p className="text-xs text-zinc-300">
          {m.universe.loading
            ? `Cargando catálogo: ${m.universe.received} activos recibidos…`
            : `${m.assets.length} activos conocidos · ${m.universe.assets.length} descubiertos por las fuentes.`}
        </p>
        {m.enabled && (m.universe.error || m.universe.coverage?.partial) && (
          <p className="text-xs text-amber-300">
            {m.universe.error ??
              "Cobertura parcial: alguna fuente no está disponible o entrega un catálogo anterior. No equivale a todo el mercado mundial."}
          </p>
        )}
        {m.universe.coverage?.sources.map(s => (
          <p key={s.id} className="text-[11px] text-zinc-400">
            {s.name}:{" "}
            {s.status === "ok"
              ? "disponible"
              : s.status === "stale"
                ? "catálogo anterior"
                : "no disponible"}{" "}
            · {s.count} activos ·{" "}
            {s.fetchedAt
              ? new Date(s.fetchedAt).toLocaleString("es")
              : "sin consulta válida"}
            {s.error ? ` · ${s.error}` : ""}
          </p>
        ))}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            ["Revisados en esta vigilancia", m.coverage.attempted],
            ["Con historial suficiente", m.coverage.analysed],
            ["Con fallo o sin historial", m.coverage.failed],
            [
              "Pendientes de revisión",
              Math.max(0, m.assets.length - m.coverage.attempted),
            ],
          ].map(([label, value]) => (
            <p key={label} className="rounded border border-zinc-800 p-2">
              <span className="block text-zinc-400">{label}</span>
              <strong>{value}</strong>
            </p>
          ))}
        </div>
        {m.closedStocks > 0 && (
          <p className="text-xs text-zinc-400">
            {m.closedStocks} acciones/ETF esperan la sesión regular. Cripto
            sigue abierta 24/7.
          </p>
        )}
        {m.coverage.dailyMissing > 0 && (
          <p className="text-xs text-amber-300">
            {m.coverage.dailyMissing} activos sin contexto diario: sus patrones
            diarios no se confirman.
          </p>
        )}
        <button
          className="min-h-10 text-xs text-indigo-300 underline"
          disabled={!m.enabled || m.universe.loading}
          onClick={m.universe.refresh}
        >
          Actualizar catálogos de mercado
        </button>
      </section>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          ["Posibles compras", live.filter(a => a.kind === "buy").length],
          [
            "Revisar ventas propias",
            live.filter(a => a.kind === "sell").length,
          ],
          ["Con datos vigentes", live.filter(a => a.reading.dataReady).length],
          ["Activos en el universo", m.assets.length],
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
          <p className="text-[11px] text-zinc-400">
            Se muestran hasta 120 resultados recientes; este límite de pantalla
            no limita el universo del barrido. Los avisos se evalúan para cada
            activo revisado, aunque su ficha deje de estar en esta lista.
          </p>
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
          {matches.length > 0 && (
            <div
              className="rounded-lg border border-zinc-800 p-3 space-y-2"
              aria-label="Buscar en el catálogo completo"
              role="region"
            >
              <p className="text-xs text-zinc-400">
                {matches.length} coincidencias en el catálogo · primeras 20.
                Selecciona una para consultar su gráfico y darle prioridad.
              </p>
              {matches.slice(0, 20).map(a => (
                <button
                  key={assetKey(a)}
                  className="block min-h-10 w-full text-left text-xs text-indigo-200"
                  onClick={() => {
                    m.inspect(a);
                    onSelect(a, m.interval);
                  }}
                >
                  {a.symbol} · {a.name}
                </button>
              ))}
            </div>
          )}
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
                    <RobinhoodBadge key={a.key} asset={a.reading.asset} />{" "}
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
