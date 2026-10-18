# Medir si las reglas tienen una ventaja

No se ha demostrado rentabilidad de TradeRadar. El laboratorio permite evaluar reglas y registrar simulaciones; sus resultados dependen de datos y supuestos.

## Implementado

- Cuatro modos: acciones/cripto × intradía de cinco minutos/varios días con velas diarias.
- Reglas largas fijas `long-ema20-50-atr14-v1`: EMA20 > EMA50, cierre sobre EMA20 y recuperación tras retroceso o ruptura del máximo de diez velas. Solo usa velas cerradas.
- Entrada en la apertura siguiente, stop a 2 ATR14 desde esa entrada y objetivo a 4 ATR14. El stop no se amplía después. Salida también por cierre bajo EMA50, plazo máximo de 24 velas intradía o 20 diarias, o final de muestra.
- Intradía intenta salir al cierre de la vela que empieza a las 15:55 de Nueva York en acciones y 23:55 UTC en cripto. No abre en esa vela ni en otra fecha a partir de una señal del día anterior. Si falta la salida, sale en la siguiente apertura disponible y registra el salto de sesión.
- Comisión porcentual y fija por lado, spread/deslizamiento adverso y redondeo conservador. El tamaño está limitado por efectivo y riesgo al stop con costes. No abre si el objetivo neto no es positivo.
- Una apertura bajo el stop se ejecuta a esa apertura con deslizamiento, aunque exceda el riesgo nominal. Una apertura sobre el objetivo usa el objetivo como supuesto conservador. Si una vela toca ambos, cuenta el stop primero e informa la ambigüedad. Las salidas conocidas antes de abrir la vela tienen prioridad sobre su recorrido posterior.
- 50 velas de calentamiento y separación cronológica 70/30 sin ajustar parámetros. Cada tramo comienza con el mismo capital y liquida compras pendientes al terminar. Muestra resultado neto, caída del capital marcada a cierre, acierto observado, expectativa, factor de beneficio, comisiones, operaciones y comprar/mantener con costes.
- Diario por usuario con capital virtual fijo, planes y costes inmutables, cierres manuales y resultados persistentes. Los totales realizados no incluyen la fluctuación de las compras abiertas. No ejecuta órdenes reales ni stops automáticos.

## Diferencia con el escáner

El escáner de ocho estrategias continúa usando velas diarias. Cambiar su gráfico no cambia ese motor. Su puntuación no es una probabilidad calibrada. Sus niveles y reglas difieren de los del laboratorio; no se pueden atribuir las métricas de uno al otro.

El portafolio conserva lotes registrados por el usuario. El diario simulado es independiente: cerrar una simulación no vende ni elimina posiciones del portafolio.

## Cómo evaluar

1. Elige mercado, plazo y activo. Fija capital, riesgo y costes del intermediario antes de probar. Si los costes son desconocidos, no supongas que cero describe tu operativa.
2. Conserva activo, versión, fuente, fechas, costes, capital, número de velas y operaciones mostrados. El resultado es una captura de esa prueba; una nueva prueba usa el historial disponible entonces.
3. Examina el tramo reservado sin usarlo para escoger parámetros o activos. Consultarlo repetidamente y elegir la mejor variante consume esa reserva y exige datos nuevos para confirmar.
4. Contrasta con comprar/mantener, pérdidas máximas, número de operaciones, costes mayores y simulación posterior. Una tasa de acierto aislada o un resultado positivo en pocos días no demuestra ventaja.
5. En el diario, registra el motivo, precios hipotéticos observados y todas las pérdidas. No borres operaciones fallidas ni confundas resultados abiertos con realizados.

## Límites pendientes

Las fuentes gratuitas suelen entregar hasta 420 velas, con retrasos, cambios de fuente y huecos. En intradía pueden representar solo unos días. Faltan un histórico estable de varios años, revisión independiente de ajustes por splits/dividendos, activos excluidos y sesgo de supervivencia. No hay calendario bursátil completo para cierres anticipados. La caída máxima usa cierres, no el peor recorrido dentro de una vela.

Comprar/mantener usa todo el capital y puede tener exposición mayor que la estrategia dimensionada por riesgo. Es una referencia contextual, no una comparación de riesgo idéntico. No se anualizan muestras cortas ni se presenta un Sharpe sin metodología suficiente.

El diario guarda precios introducidos manualmente, sin comprobar liquidez ni ejecuciones reales. No incluye impuestos, financiación ni préstamo. Un stop no garantiza el precio de salida. El límite conjunto del 5% controla la simulación y no prescribe un riesgo adecuado para dinero real.

El flujo y el libro de órdenes no están conectados. El volumen OHLC no distingue compras y ventas agresivas ni revela órdenes futuras. El aprendizaje automático y la ejecución automática siguen pendientes de datos y validación adecuados.

Las pruebas de software verifican cálculos y comportamiento con datos controlados; no prueban una ventaja económica. Antes de arriesgar dinero real hace falta evidencia fuera de muestra y simulación posterior con costes y condiciones representativos. Ninguna métrica garantiza beneficios.
