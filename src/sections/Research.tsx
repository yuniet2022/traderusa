import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, AlertTriangle, ExternalLink } from 'lucide-react';

const strategies = [
  {
    name: 'Tendencia y momentum temporal',
    description: 'Compara precio y medias móviles, y mide el rendimiento del propio activo. La literatura sobre momentum temporal estudia estrategias sistemáticas con reglas y universos concretos.',
    implementation: 'La app combina SMA20/50/200, MACD normalizado por ATR y retornos históricos. Sus parámetros son heurísticos; no replica la cartera ni los resultados de un estudio.',
    reference: 'Moskowitz, Ooi y Pedersen (2012), Time series momentum, Journal of Financial Economics.',
    href: 'https://doi.org/10.1016/j.jfineco.2011.11.003',
  },
  {
    name: 'Momentum absoluto de 3–6 meses',
    description: 'El momentum transversal compara ganadores y perdedores de un universo de activos. Es distinto de observar únicamente si un activo ha subido.',
    implementation: 'La app promedia retornos absolutos de 3 y 6 meses. No calcula un ranking relativo, no excluye el último mes y no implementa la cartera transversal del artículo.',
    reference: 'Jegadeesh y Titman (1993), Returns to Buying Winners and Selling Losers, Journal of Finance.',
    href: 'https://doi.org/10.1111/j.1540-6261.1993.tb04702.x',
  },
  {
    name: 'Proximidad al máximo de 52 semanas',
    description: 'La proximidad al máximo histórico reciente es una señal estudiada en la literatura. Su asociación histórica con rendimientos no garantiza el comportamiento futuro de un activo.',
    implementation: 'La app usa el mayor cierre disponible hasta un año y una escala heurística: +50 en el máximo y 0 a un 20% por debajo. No es una probabilidad ni una réplica del estudio.',
    reference: 'George y Hwang (2004), The 52-Week High and Momentum Investing, Journal of Finance.',
    href: 'https://doi.org/10.1111/j.1540-6261.2004.00695.x',
  },
  {
    name: 'Reversión a la media y régimen',
    description: 'RSI, bandas de Bollinger y z-score describen movimientos respecto de un rango reciente. Una lectura de sobrecompra puede persistir durante una tendencia.',
    implementation: 'La app usa estas reglas y una aproximación de fuerza direccional para cambiar pesos. Esa aproximación no es el ADX estándar. No se ha validado una tasa de acierto, Sharpe o rentabilidad para esta combinación.',
  },
];

const validation = [
  'Definir universo, fechas, horizonte de las señales y reglas de entrada/salida antes del experimento.',
  'Usar datos ajustados, sin información futura y con control de sesgo de supervivencia.',
  'Separar cronológicamente entrenamiento, validación y prueba; evaluar también ventanas fuera de muestra.',
  'Incluir comisiones, spread, deslizamiento y disponibilidad de los instrumentos.',
  'Comparar con comprar y mantener y con reglas simples, e informar drawdown, rotación y resultados netos.',
];

const resources = [
  { name: 'TradingView', description: 'Documentación de gráficos y lenguaje Pine Script.', href: 'https://www.tradingview.com/pine-script-docs/' },
  { name: 'QuantConnect', description: 'Documentación de investigación y backtesting con LEAN.', href: 'https://www.quantconnect.com/docs/' },
  { name: 'Alpaca', description: 'Documentación de datos y APIs de trading; consulta elegibilidad y condiciones.', href: 'https://docs.alpaca.markets/' },
  { name: 'Webull', description: 'Portal de desarrolladores; verifica permisos, mercados y planes actuales.', href: 'https://developer.webull.com/' },
];

export function Research() {
  return (
    <div className="space-y-6">
      <Card className="bg-amber-950/20 border-amber-900/40">
        <CardContent className="pt-4 flex gap-3">
          <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} aria-hidden="true" />
          <div className="text-sm text-amber-200/90 space-y-2">
            <p className="font-semibold">El motor de señales no tiene un backtest validado.</p>
            <p>Las puntuaciones son reglas educativas, no probabilidades de beneficio. Las referencias explican los conceptos; sus resultados no son resultados de TraderUSA.</p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="research-methods">
        <h2 id="research-methods" className="text-lg font-bold">Qué calcula la app y de dónde viene la idea</h2>
        {strategies.map(strategy => (
          <Card key={strategy.name} className="bg-zinc-900/60 border-zinc-800">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{strategy.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs leading-relaxed">
              <p className="text-zinc-400">{strategy.description}</p>
              <p className="text-indigo-300">{strategy.implementation}</p>
              {strategy.href && <a href={strategy.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-zinc-300 underline underline-offset-2">
                <BookOpen size={13} aria-hidden="true" />{strategy.reference}
              </a>}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3" aria-labelledby="research-validation">
        <h2 id="research-validation" className="text-lg font-bold">Cómo evaluar una futura estrategia</h2>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="pt-4 space-y-3 text-xs text-zinc-400">
            <p>Antes de añadir momentum relativo, pesos por familias o un modelo como LightGBM/XGBoost, necesitamos un protocolo reproducible.</p>
            <ol className="list-decimal pl-4 space-y-2">{validation.map(item => <li key={item}>{item}</li>)}</ol>
            <p>Esas extensiones y los modelos de aprendizaje automático todavía no están implementados ni evaluados en esta app.</p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="research-resources">
        <h2 id="research-resources" className="text-lg font-bold">Documentación de herramientas externas</h2>
        <p className="text-xs text-zinc-400">Consulta precios y capacidades vigentes en las fuentes oficiales. La app no está conectada a estas plataformas ni ejecuta órdenes.</p>
        <div className="grid sm:grid-cols-2 gap-3">{resources.map(resource => (
          <Card key={resource.name} className="bg-zinc-900/60 border-zinc-800">
            <CardContent className="pt-4 space-y-2">
              <a href={resource.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-emerald-300">{resource.name}<ExternalLink size={13} aria-hidden="true" /></a>
              <p className="text-xs text-zinc-400">{resource.description}</p>
              <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">Fuente externa</Badge>
            </CardContent>
          </Card>
        ))}</div>
      </section>
    </div>
  );
}
