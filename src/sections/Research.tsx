import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, LineChart, Brain, Shield, BookOpen, AlertTriangle, CheckCircle2 } from 'lucide-react';

const webullCard = {
  name: 'Webull (broker + OpenAPI oficial)', price: '$0 comisiones · OpenAPI gratis para clientes',
  best: 'El único broker retail "app-first" con API oficial de trading para acciones',
  notes: 'OpenAPI oficial (developer.webull.com): Trading API (órdenes en acciones, opciones, futuros y cripto), Market Data API (quotes Level 1 en tiempo real gratis, WebSocket, históricos para backtesting), sandbox de simulación y servidor MCP para conectar agentes de IA. 27M de usuarios, cotiza en NASDAQ (BULL). Herramientas superiores a Robinhood: 100+ indicadores, paper trading (premio #1 de StockBrokers), Level 2, órdenes condicionales, 50 criptos, venta en corto. Contras: sin chat 24/7, educación mejorable, margen estándar más caro (8,74%) que Robinhood Gold. Cripto reintegrada a la app principal desde agosto 2025.',
  tag: 'Broker + API',
};

const tools = [
  webullCard,
  {
    name: 'Trade Ideas (Holly AI)', price: 'Desde ~$89/mes (Holly AI en Premium ~$167-178/mes)',
    best: 'Señales de day trading pre-mercado generadas por IA',
    notes: 'Holly AI simula millones de escenarios cada noche sobre ~50 estrategias y publica las mejores cada mañana, con win-rate histórico transparente. Escanea 8.000+ acciones en tiempo real. Solo acciones y opciones de EE. UU.; sin cripto. Trustpilot ~2.1/5 (pocas reseñas). Integración con Interactive Brokers y E*TRADE.',
    tag: 'Señales IA',
  },
  {
    name: 'TrendSpider', price: 'Desde ~$52-89/mes (con add-ons puede superar $200/mes)',
    best: 'Automatización de análisis técnico multi-activo',
    notes: 'Escáner en lenguaje natural, backtesting sin código con 50+ años de datos, AI Strategy Lab para entrenar modelos ML propios (Random Forest, KNN, regresión logística), bots sin código, apps móviles. Cubre acciones, ETFs, futuros, forex y cripto. Trustpilot ~4.8/5. Mejor valoración global en comparativas de 2026.',
    tag: 'Análisis + bots',
  },
  {
    name: 'VectorVest', price: 'Desde $19.99/mes',
    best: 'Recomendación clara compra/venta/mantener sobre 18.000+ acciones',
    notes: 'Sistema VST (Value, Safety, Timing) que condensa fundamentales y precio en una señal simple. Afirma superar al S&P 500 por 10x en 22 años (dato del propio proveedor). Sin cripto ni forex. Trustpilot ~4.6/5 con 2.000+ reseñas.',
    tag: 'Recomendaciones',
  },
  {
    name: 'TradingView', price: 'Desde ~$13/mes (plan gratis útil)',
    best: 'Gráficos, 100.000+ indicadores comunitarios, Pine Script',
    notes: 'El estándar de facto para charting. Screener multi-activo, alertas, y estrategias programables en Pine Script. No ejecuta por sí solo; se conecta a brokers compatibles (Robinhood no está soportado para trading directo).',
    tag: 'Charting',
  },
  {
    name: 'Cryptohopper / 3Commas / Pionex', price: 'Gratis – ~$50/mes',
    best: 'Bots de cripto conectados a exchanges',
    notes: 'Grid bots, DCA, arbitraje y copy-trading. Se conectan por API a exchanges (Binance, Coinbase, Kraken...). Robinhood solo expone API oficial para cripto, no para acciones, y estas plataformas no la soportan de forma nativa.',
    tag: 'Bots cripto',
  },
  {
    name: 'QuantConnect / Alpaca', price: 'Gratis (open source) / desde $0',
    best: 'Backtesting y trading algorítmico programático',
    notes: 'QuantConnect (motor Lean en C#/Python) para backtests institucionales; Alpaca ofrece API de trading de acciones sin comisiones. Son la vía seria si quieres automatizar ejecución real — pero con un broker distinto a Robinhood.',
    tag: 'Algo trading',
  },
  {
    name: 'Finviz / TC2000 / ThinkOrSwim', price: 'Gratis – ~$30/mes / gratis',
    best: 'Screeners y análisis de opciones',
    notes: 'Finviz para screening rápido visual, TC2000 para escaneo sin código (~$10/mes), ThinkOrSwim (Charles Schwab) gratis con analítica de opciones profesional.',
    tag: 'Screeners',
  },
];

const strategies = [
  {
    name: 'Trend following / momentum temporal',
    evidence: 'La evidencia más sólida que existe. AQR documentó rentabilidad positiva en cada década desde 1880 en 67 mercados, con ~11% anualizado sobre la tasa libre de riesgo (bruto), Sharpe neto ~0.76, y buen comportamiento en 8 de las 10 mayores crisis del siglo (Hurst, Ooi & Pedersen, Journal of Portfolio Management).',
    implementation: 'En esta app: precio vs SMA200, cruce SMA50/200 (cruce dorado/muerte), SMA20 vs SMA50, y rendimiento a 12 meses.',
    icon: LineChart,
  },
  {
    name: 'Momentum transversal (ganadores vs perdedores)',
    evidence: 'Jegadeesh & Titman (1993): comprar ganadores de 3-12 meses y vender perdedores generó ~1% mensual de spread, significativo en todas las combinaciones 3/6/9/12 meses. Replicado en EE. UU. y mercados internacionales durante 30 años de datos fuera de muestra. La variante "máximo de 52 semanas" (George & Hwang) duplica los retornos del momentum clásico.',
    implementation: 'En esta app: momentum relativo 3-6 meses y proximidad al máximo de 52 semanas.',
    icon: Brain,
  },
  {
    name: 'Reversión a la media (RSI, Bollinger, z-score)',
    evidence: 'Win rates del 65-75% en mercados laterales según backtests recientes (frente al 10-40% del trend following). Versiones refinadas reportan ~13% anualizado con Sharpe ~2.1 en tests de 25 años, pero fallan catastróficamente en tendencias fuertes — por eso requiere detección de régimen.',
    implementation: 'En esta app: RSI(14), %B de Bollinger, z-score a 20 días y reversión contraria de 1 mes, con peso mayor cuando el mercado está en rango.',
    icon: Shield,
  },
  {
    name: 'MACD y cruces de medias',
    evidence: 'Popular pero con evidencia mixta en solitario; funciona mejor como filtro de confirmación dentro de un sistema compuesto que como estrategia aislada. Su valor real está en combinarse con filtros de régimen (ADX).',
    implementation: 'En esta app: histograma MACD (12, 26, 9) normalizado por ATR.',
    icon: LineChart,
  },
  {
    name: 'Modelos de Machine Learning',
    evidence: 'Random Forest, gradient boosting y LSTM muestran capacidad predictiva modesta fuera de muestra en literatura académica, con alto riesgo de sobreajuste. Los fondos cuantitativos (Two Sigma, Citadel) los usan combinados con decenas de señales clásicas, no en solitario.',
    implementation: 'Fuera del alcance de datos gratuitos en el navegador; la app emula el enfoque con un ensemble ponderado por régimen.',
    icon: Bot,
  },
  {
    name: 'Buy & Hold (referencia)',
    evidence: 'S&P 500 ~9-10% anualizado histórico. La mayoría de estrategias activas no lo superan neto de costes a largo plazo (SPIVA). Cualquier señal debe evaluarse contra este benchmark.',
    implementation: 'Úsalo como vara de medir: si las señales no baten comprar y mantener, no aportan.',
    icon: BookOpen,
  },
];

const robinhoodNotes = [
  'Robinhood tiene API oficial solo para cripto (Robinhood Crypto Trading API). No existe API pública oficial para acciones.',
  'Las librerías no oficiales (robin_stocks, etc.) usan endpoints privados: violan los términos de servicio, se rompen con frecuencia y pueden conllevar cierre de cuenta. No recomendado.',
  'Novedad clave: Webull sí ofrece OpenAPI oficial para acciones, opciones, futuros y cripto (Trading API + Market Data API en tiempo real, con sandbox y SDK en developer.webull.com). Si quieres que TradeRadar ejecute órdenes automáticamente, Webull es hoy la vía oficial más accesible para el trader minorista.',
  'Flujo recomendado actual: esta app genera señales → tú ejecutas manualmente en tu broker. Siguiente paso posible: conectar TradeRadar a la OpenAPI de Webull para ejecución automática y datos Level 1 en tiempo real sin retraso.',
];


export function Research() {
  return (
    <div className="space-y-6">
      <Card className="bg-amber-950/20 border-amber-900/40">
        <CardContent className="pt-4 flex gap-3">
          <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-amber-200/90 leading-relaxed">
            Ninguna herramienta — incluida esta app — garantiza beneficios. Las rentabilidades citadas
            proceden de backtests y literatura académica; el rendimiento pasado no asegura resultados futuros.
            Esto no es asesoría financiera.
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-bold mb-1">Herramientas existentes (investigación 2026)</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Comparativa de las principales plataformas de señales, escáneres y bots, con precios y especialidad.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          {tools.map(t => (
            <Card key={t.name} className="bg-zinc-900/60 border-zinc-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">{t.name}</CardTitle>
                  <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">{t.tag}</Badge>
                </div>
                <p className="text-xs text-emerald-400/90 font-medium">{t.price}</p>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-zinc-300 font-medium mb-1">Mejor para: {t.best}</p>
                <p className="text-xs text-zinc-500 leading-relaxed">{t.notes}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-1">Estrategias con mejor evidencia de resultados</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Ordenadas por solidez de la evidencia académica y práctica. Las 4 primeras están implementadas en el motor de señales de esta app.
        </p>
        <div className="space-y-3">
          {strategies.map(s => (
            <Card key={s.name} className="bg-zinc-900/60 border-zinc-800">
              <CardContent className="pt-4 flex gap-3">
                <s.icon className="text-indigo-400 shrink-0 mt-0.5" size={18} />
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold">{s.name}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed"><span className="text-zinc-200 font-medium">Evidencia:</span> {s.evidence}</p>
                  <p className="text-xs text-indigo-300/80 leading-relaxed">{s.implementation}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-4">Tu caso: Robinhood hoy y la opción Webull</h2>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="pt-4">
            <ul className="space-y-2.5">
              {robinhoodNotes.map((n, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                  <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={14} />
                  {n}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
