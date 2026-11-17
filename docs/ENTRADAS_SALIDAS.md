# Entradas, salidas y riesgo: comparación y validación

## Qué se investigó

Se revisaron dos proyectos comunitarios de Jake Schincariol, publicados con licencia MIT. Son herramientas de la comunidad para Claude, no funciones oficiales de Claude ni fuentes nuevas de cotizaciones:

- [day-trader-skill, revisión 3d0f4ef](https://github.com/Jakeschincariol/day-trader-skill/tree/3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd): en particular [entrada](https://github.com/Jakeschincariol/day-trader-skill/blob/3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd/trader-entry/SKILL.md), [salida](https://github.com/Jakeschincariol/day-trader-skill/blob/3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd/trader-exit/SKILL.md), [riesgo](https://github.com/Jakeschincariol/day-trader-skill/blob/3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd/trader-risk/SKILL.md), presupuesto y simulación.
- [trader-skill, revisión 5189e79](https://github.com/Jakeschincariol/trader-skill/tree/5189e79b9a480755a3733ac9713f5353981dbe18): portafolio, lotes, presupuesto y límites.

Sus suites sin red pasaron 315 y 175 pruebas, respectivamente. Eso comprueba reglas de software sobre sus datos de prueba; no acredita ganancias ni acceso a proveedores desde Railway.

TraderUSA incorpora una implementación propia en TypeScript del flujo cierre → plan → tamaño → revisión. No instala estos paquetes, añade Python, noticias, resultados empresariales ni conexión a un intermediario. La atribución está en [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Comparación con la aplicación anterior

| Aspecto | Antes | Ahora |
| --- | --- | --- |
| Entradas | Conteo de condiciones y referencia del rango desde las primeras barras disponibles | Cinco patrones explícitos con disparador, vigencia, invalidación y motivo de espera/bloqueo |
| Rango inicial | Podía usar un rango incompleto | Exige las barras exactas de los primeros 30 minutos; no sustituye barras ausentes |
| Confirmación | La lectura no separaba completamente vela abierta y disparador cerrado | Solo cierres para confirmar; una vela abierta puede bloquear por precio o invalidación, nunca confirmar |
| Participación | Confluencia indicativa | Volumen de la vela ≥1.2× el promedio de las 20 anteriores, junto con estructura y cierre |
| Vigencia | Un patrón podía seguir pareciendo utilizable tras la ruptura | Caduca a los dos intervalos; controla actualización, huecos, sesión y alejamiento del precio |
| Niveles | Calculadora manual separada de los setups | Aplicación explícita del mismo plan: entrada, stop estructural y objetivo; conserva capital y costos |
| Tamaño | Riesgo al stop, capital y costos | Además reserva, exposición incluyendo la posición existente, efectivo, pérdida máxima, riesgo diario restante y beneficio/riesgo neto mínimo |
| Salidas propias | Resultado por lotes y umbrales personales | Añade deterioro tras subida con momentum, rechazo/pérdida de estructura y volumen; distingue ganancia y pérdida según tus compras |
| Horarios | Lectura intradía parcialmente provisional | Sesión regular estadounidense con festivos/cierres anticipados; cripto sigue abierta 24/7 con referencia diaria UTC |

Se mantiene el escáner diario, los escenarios históricos y el diario simulado. El detector sustituye el antiguo panel de confluencia y el panel provisional de tipo de día. Una puntuación del escáner describe sesgo; no es una orden de compra o venta de tus posiciones.

## Reglas y uso

La cabecera del detalle muestra la **decisión integrada**, no el sesgo diario como señal principal. `tradeDecision` combina el detector causal, el estado del plan aplicado y la evaluación de la calculadora. Sin setup vigente indica esperar; con setup pero sin el mismo plan/riesgo comprobado indica preparar o validar la compra; solo con coincidencia de activo, intervalo e identificador de plan, datos recientes, precio admitido, tamaño positivo finito, costos explícitos y límites respetados muestra **Posible compra ahora**. Cambiar manualmente los niveles desvincula el plan y retira esa indicación. Los niveles y las unidades se muestran junto a la decisión. No significa una ejecución ni una probabilidad calibrada de beneficio.

El contexto diario sigue disponible en un desplegable secundario. Una caída porcentual diaria no cancela por sí sola un setup intradía; tampoco un sesgo diario positivo lo confirma. Las ventas continúan requiriendo lotes válidos y evidencia de salida o un umbral personal, y no dependen de tener presupuesto para una nueva compra.

Abre un activo → **Day trading · Entradas y salidas**. El gráfico y el detector empiezan en cinco minutos. Cambiar entre 1, 5 y 15 minutos sincroniza ambos. Los intervalos de una hora, un día, una semana y el gráfico de línea son vistas de contexto: el detector conserva su intervalo intradía y la interfaz muestra esa diferencia.

Fuera de la sesión regular, la cabecera muestra **Mercado cerrado · esperar**, y el detector informa horario y próxima apertura en fecha/hora de Nueva York, con festivos, horario estacional y cierres anticipados. No aplica avisos de frescura de ejecución como si el cierre normal fuera una avería. Los gráficos, detector y escenarios pausan la autoconsulta, conservan el historial y permiten una consulta manual; un fallo real permanece visible y no genera una indicación de compra. La apertura reanuda la consulta, pero no garantiza datos ni confirmación: aún deben llegar cierres suficientes. No se analizan premercado ni operaciones posteriores al cierre. Cripto conserva sus consultas 24/7.

Los gráficos diarios/semanales muestran los años en el rango de fechas. Para Yahoo, la serie semanal se construye de barras diarias validadas, ordenadas y sin marcas temporales repetidas; se suman volúmenes y se conservan apertura inicial, extremos y cierre final de cada semana, antes de limitar la serie. Se rechaza una respuesta que declare un intervalo diario contradictorio. Una semana parcial no se presenta como cinco días completos. Las referencias semanales de lunes UTC se etiquetan por fecha UTC para no mostrarlas como el domingo anterior en Nueva York.

Para avisos sobre varios activos, abre **Day trading → Iniciar vigilancia intradía**. Se revisan todos los activos cargados, incluidos los que tienen un sesgo diario neutral o bajista, sin un cupo de tres o cuatro candidatos. Los filtros del panel cambian la presentación, no la lista vigilada. La vigilancia es opcional, funciona con app abierta y pestaña visible, y continúa al navegar por otras pestañas internas. No funciona con la app cerrada. Las alertas personales existentes siguen siendo independientes.

Los avisos de posible compra incluyen entrada, máximo admisible, stop y objetivo. Las revisiones de venta requieren lotes válidos del mismo activo y consideran deterioro cerrado o un umbral personal alcanzado; pueden referirse a ganancias o a pérdidas reales de esa posición. Un aviso no coloca una orden ni confirma que el tamaño/costos del usuario sean aceptables. El aviso de compra se emite una vez por disparador cerrado; la salida, una vez mientras continúe la misma condición. Una fuente fallida no rearma una salida continua. Se guardan los últimos 50 avisos en memoria; recargar reinicia este historial. Al abrir un aviso se vuelve a comprobar su vigencia.

Las rondas se intentan cada 20 segundos, con tres peticiones simultáneas como máximo y cancelación a los 45 segundos. Se rota el comienzo tras una ronda cancelada. La antigüedad se reevalúa cada cinco segundos: el monitor no rejuvenece el historial conservado al fallar una fuente. Fuera de la sesión regular se omiten consultas intradía de acciones, sin aplicar ese cierre a cripto. Ocultar la pestaña, pausar, cambiar intervalo o cerrar la aplicación cancela la ronda y evita publicar respuestas anteriores. Las notificaciones del sistema necesitan permiso y compatibilidad del navegador; los avisos internos no requieren ese permiso. No hay servicio web push para iPhone u otros equipos con la app cerrada.

Los patrones son ruptura del rango inicial, ruptura del máximo de la sesión diaria anterior cerrada, ruptura y retest posterior, retroceso/reanudación sobre EMA20 y barrida/recuperación de soporte. Usan ATR, EMA20/50 y evolución de MACD cuando hay suficientes barras. Antes de tener MACD se usa mejora del cierre. No son cinco votos independientes ni probabilidades de acierto.

- Consulta de historial de hasta 30 segundos de antigüedad; se bloquea ante actualización fallida, historial anterior, ausencia de fechas verificables, huecos o barras recientes fuera de alineación. La última vela cerrada de la sesión debe tener como máximo dos intervalos más 30 segundos de antigüedad.
- Las fechas del proveedor, cuando existen, se contrastan con el cierre; al terminar una vela se espera a que la fuente la haya confirmado. La hora de consulta y la del precio se muestran por separado. Si el proveedor no informa esta última, permanece desconocida; los tiempos de las velas no garantizan una cotización sin retraso.
- Acciones: sesión regular de Nueva York, sin nuevas entradas los primeros 15 minutos ni los últimos 30. El rango inicial necesita 30 minutos completos. Se bloquean nuevas entradas tras varias rupturas fallidas o rupturas en ambas direcciones **dentro de la última hora**; un episodio antiguo no bloquea por sí solo el resto del día. Estos bloqueos por horario/estructura no impiden revisar salidas con datos actuales.
- Cripto: referencia UTC de 00:00 a 00:30 para el rango, sin cierre diario de negociación ni filtro de apertura de acciones.
- El calendario de acciones cubre 2025–2030, horario estacional y festivos regulares, además del cierre excepcional del 9 de enero de 2025. Fuera de esos años bloquea entradas. No consulta suspensiones intradía ni cierres extraordinarios futuros de la bolsa. Referencia: [NYSE Hours & Calendars](https://www.nyse.com/markets/hours-calendars).
- Stop basado en estructura y ATR; riesgo mínimo de 0.05% del precio. Objetivos a 2R y 3R **brutos**, donde R es entrada menos stop. Son referencias, no máximos pronosticados.
- La zona admite como máximo el menor de 0.5 ATR o 0.25R sobre el cierre de confirmación. Perder el nivel de invalidación después del disparador invalida el plan aunque el precio rebote. No se alarga su vencimiento ni se mueven sus objetivos para mantenerlo válido.

**Usar setup en calculadora de riesgo** traslada el primer objetivo y el stop a la calculadora. Esta usa la mayor entrada entre la referencia aplicada y el precio intradía disponible, recalcula el tamaño y conserva el capital/costos introducidos. Cambiar activo, intervalo, validez del setup o precio puede impedir validar el plan. Editar entrada/stop/objetivo convierte el cálculo en manual.

Los valores iniciales de reserva (10%), exposición máxima (25%) y beneficio/riesgo neto mínimo (1.5) son editables; no se han optimizado ni constituyen una recomendación. El efectivo disponible y los límites monetarios opcionales son manuales. Un campo opcional vacío no se comprueba: la app no lee saldo ni pérdidas de Robinhood. Los costos requieren un valor explícito para validar el cálculo, incluso cero. Un límite diario restante de cero impide añadir unidades.

La revisión de salida usa los lotes de la posición: subida previa de al menos un ATR, MACD debilitándose, vela bajista con rechazo o pérdida del mínimo anterior y volumen ≥1.2× su base. No asegura detectar un techo. Una posición en pérdida también puede requerir una salida por riesgo. Los umbrales personales se mantienen separados del escenario de mercado y no se modifican automáticamente. La app no crea órdenes, no ejecuta stops y no cambia el portafolio al aplicar un setup. El diario simulado conserva su motor y registro independientes.

## Por qué no se incorporaron las probabilidades de «Time Machine»

El proyecto externo remuestrea barras de cinco minutos por hora del día para construir 10.000 trayectorias. Son escenarios condicionados a una muestra reciente, no probabilidades predictivas calibradas. Esa simulación no incluye nuestros costos de ejecución y limita a −1R la pérdida en el stop incluso si hay un salto de precio. Su propia documentación reconoce que una ejecución real puede ser peor.

No se muestran esos porcentajes como una ventaja. Para comprobar el motor nuevo se añadió una reproducción cronológica sin red que considera costos y saltos, además de las pruebas controladas. No se ajustaron parámetros buscando mejorar el resultado del archivo.

## Reproducción histórica de comprobación

Entrada: archivo público `tests/fixtures/trader-timemachine/TSLA-60d5m.json.gz` de la revisión indicada de `day-trader-skill`. SHA-256 del archivo comprimido:

```text
b326efd64aa807e93325cff52770976e0820610a9cb9442f17dcfc5cffc9ef9f
```

El archivo se usa tal como viene del proyecto comunitario; sus precios no se verificaron contra una segunda fuente. No se incluye una copia de la serie en este repositorio.

```sh
curl --fail --location https://raw.githubusercontent.com/Jakeschincariol/day-trader-skill/3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd/tests/fixtures/trader-timemachine/TSLA-60d5m.json.gz --output /tmp/TSLA-60d5m.json.gz
./node_modules/.bin/esbuild scripts/replay-setups.ts --bundle --platform=node --format=esm --outfile=/tmp/replay-setups.mjs
node /tmp/replay-setups.mjs /tmp/TSLA-60d5m.json.gz
```

Supuestos: 10.000 USD iniciales, velas de cinco minutos, una posición abierta, tres entradas como máximo por sesión, 1% de riesgo por operación, 300 USD de presupuesto de riesgo diario, reserva de 10%, exposición máxima de 25%, mínimo 1.5 de beneficio/riesgo neto. El límite de tres entradas pertenece solo a este experimento; no filtra los avisos del monitor. Comisión de 0.05%, deslizamiento adverso de 0.05% y 0.50 USD fijos **por cada lado**. La señal solo ve barras previas; entra en la apertura siguiente o al precio original si es peor. Mantiene stop y objetivo 2R originales, cuenta primero el stop si una vela toca ambos y usa la apertura cuando salta el stop. Liquida cinco minutos antes del cierre de acciones. El presupuesto diario se consume conservadoramente por el riesgo previsto, sin reponerlo tras cerrar.

| Resultado en este archivo | Valor |
| --- | ---: |
| Sesiones completas | 59, del 27/07/2026 al 16/10/2026 |
| Sesiones incompletas excluidas | 1 |
| Operaciones | 8 |
| Positivas / negativas netas | 5 / 3 |
| Resultado neto del modelo | +30.67 USD (+0.31%) |
| Factor de beneficio | 1.26 |
| Caída máxima del capital al cierre de barras | 0.86% |

El [resultado reproducible](validation/entry-setups-tsla.json) incluye supuestos y operaciones. Se volvió a ejecutar con la revisión `entry-setups-v2-recent-range-noise`: acotar el filtro de rupturas a la última hora no cambió las ocho operaciones de este archivo. **Ocho operaciones de un solo activo no prueban rentabilidad ni superioridad frente al motor anterior.** No es una evaluación fuera de muestra reservada ni un estudio de varios regímenes. Supone entrega puntual de datos y no simula colas de órdenes, liquidez, suspensiones, impuestos, dividendos ni todas las fluctuaciones dentro de cada vela. La caída máxima puede ser mayor intravela. Cripto y los otros intervalos tienen comprobaciones de reglas con datos controlados, no una evaluación histórica equivalente.

## Comprobaciones de software

Las pruebas cubren cierre frente a vela en formación, rango incompleto, los cinco patrones, fuente atrasada/fallida, huecos, invalidación con rebote, caducidad, persecución de precio, sesión/festivos/horario estacional, costos y límites, salto del stop, ambigüedad OHLC, y salidas respecto al costo propio en ganancia o pérdida.

El recorrido en Chromium, con respuestas y reloj controlados, confirmó aplicar un plan sin borrar capital/costos, bloquear un precio alejado o un fallo de fuente, caducar el plan, impedir tamaño con riesgo diario cero y no escribir órdenes ni posiciones. También se comprobó que el diálogo no desborda a 1366, 440 y 320 píxeles. Son comprobaciones de interfaz; no certifican acceso en vivo desde Railway ni comportamiento de Safari físico.

El recorrido del monitor verificó más de cuatro activos, notificaciones internas y llamadas al navegador para una compra confirmada y una salida propia en pérdida, supresión de duplicados, gráfico inicial de cinco minutos, sincronización en ambas direcciones con el detector, aviso de contexto diario, bloqueo por precio alejado/fallo de fuente y pausa manual. No escribió operaciones ni posiciones y mantuvo el ancho en escritorio, 440 y 320 píxeles. Las pruebas unitarias también comprueban el límite de concurrencia, cancelación sin publicaciones tardías, fallos parciales y ausencia de ventas sin lotes del mismo activo.

La decisión integrada tiene pruebas de coincidencia del plan/riesgo, límites incumplidos, tamaño cero/no finito, ausencia de confirmación, precio alejado, vencimiento, datos antiguos, intervalo/activo distinto y ventas propias en pérdida independientes del presupuesto de entrada. El recorrido de navegador también comprueba el paso de preparar plan a posible compra, su retirada al agotar el riesgo diario, su recuperación al corregir el límite y su retirada por precio/fuente. Se comprobó en escritorio, 440 y 320 píxeles con datos controlados.

La limitación práctica principal sigue siendo recibir OHLC recientes desde el alojamiento. Este cambio muestra y bloquea esa ausencia; no convierte una fuente gratuita limitada en un feed de tiempo real. Para evaluar una ventaja harían falta más datos autorizados, varios activos/períodos, validación cronológica reservada y seguimiento prospectivo de señales, costos y ejecuciones.
