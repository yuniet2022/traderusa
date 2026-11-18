# Mercado ampliado y etiquetas de Robinhood

La vigilancia de compras descubre símbolos fuera de la lista inicial. Combina catálogos y recorre el universo resultante; no necesita que un activo ya tenga un análisis diario guardado. Las ventas continúan requiriendo lotes propios válidos del mismo **símbolo y clase de activo**.

## Fuentes y alcance

| Catálogo público | Aporte |
| --- | --- |
| Nasdaq Trader: `nasdaqlisted.txt` y `otherlisted.txt` | Acciones y ETF listados en EE. UU.; excluye símbolos de prueba y normaliza las clases |
| Kraken AssetPairs | Pares USD en línea; XBT/BTC y XDG/DOGE |
| Coinbase Exchange Products | Productos USD en línea y con negociación habilitada |
| Binance Exchange Information | Pares spot USDT en negociación |
| Yahoo Finance: actividad, ganadores y perdedores | Muestra de hasta 250 elementos por lista para priorizar movimientos; no sustituye un directorio completo |

El alcance es **acciones/ETF de EE. UU. y criptos con pares compatibles en estas fuentes**, no todas las bolsas del mundo, todas las monedas de DeFi ni todos los productos de Robinhood. No incluye opciones, futuros, bonos, divisas ni margen. «Global» o «catálogo completo» identifica el universo descubierto, no cobertura mundial garantizada.

Se deduplica por `clase:símbolo` y se conserva la procedencia. Una acción BTC y una cripto BTC no se mezclan. La identidad de una moneda usa el símbolo del mercado; no comprueba contratos ni equivalencias entre cadenas. Verifica el instrumento en tu intermediario. Los precios USD y USDT de distintas plazas pueden diferir.

El catálogo no produce señales por sí mismo. Los precios conservan los proveedores de OHLC configurados: Yahoo/Stooq para acciones y Kraken/Coinbase/Binance/Yahoo para cripto. Cada entrada exige cierre, volumen, vigencia, estructura, plan y riesgo según [ENTRADAS_SALIDAS.md](ENTRADAS_SALIDAS.md).

## Barrido y cobertura visible

**Day trading → Iniciar vigilancia intradía** muestra fuentes disponibles, anteriores o inaccesibles, fecha original del catálogo, símbolos descubiertos, intentos realizados, historiales suficientes, fallos, pendientes y acciones fuera de horario. «Revisado» es un intento, no una cotización actual ni una compra confirmada. Los datos vigentes tienen un contador separado.

- Páginas de hasta 500 activos y versión del contenido; si cambia entre páginas se reinicia una vez la carga. No se anuncia como catálogo completo la lista inicial cuando fallan todas las fuentes.
- Catálogos recientes durante seis horas; respaldo anterior hasta 24 horas, con fecha conservada y cobertura parcial. Pausa de un minuto entre reintentos. El cliente revisa cobertura cada hora mientras está activo/visible y permite actualización manual.
- Rondas cada 20 segundos, hasta tres trabajos simultáneos y 45 segundos de presupuesto. Un símbolo nuevo puede necesitar historial intradía y diario; el servicio de precios mantiene su límite externo compartido de cuatro consultas.
- Dos trabajos prioritarios alternan con uno del barrido general. Ambas colas rotan. Cada ronda incorpora hasta 100 trabajos nuevos; **no es un límite de símbolos del universo**. Una cancelación no avanza por encima de un activo incompleto.
- Las acciones esperan la sesión regular estadounidense; cripto opera 24/7. Ocultar la pestaña, pausar, cambiar intervalo o cerrar la app cancela la ronda. Requiere app abierta y pestaña visible, sin escáner permanente en el servidor ni web push.

Miles de símbolos y los límites gratuitos pueden hacer que un recorrido tarde mucho más que el intervalo de consulta. No se rejuvenecen datos antiguos para mostrar compras actuales. Un catálogo amplio **no significa que todo esté analizado simultáneamente en tiempo real**. Cobertura amplia con baja latencia requeriría datos autorizados y capacidad dimensionada para ese volumen.

Se conservan hasta 120 fichas y 50 avisos de sesión para acotar memoria. Cada resultado se evalúa para avisos **antes** de limitar las fichas. La búsqueda consulta todos los símbolos descubiertos y permite priorizar/abrir un activo que no esté entre los últimos resultados.

Para evitar tapar el gráfico con decenas de avisos simultáneos, se muestran los tres primeros avisos de compra de cada ronda y se agrupan los adicionales en un contador/resumen. Las revisiones de venta propia conservan su aviso individual. El historial y los resultados siguen mostrando las detecciones dentro de sus límites indicados; agrupar avisos no modifica las reglas ni omite la evaluación de un activo.

La ficha nueva usa velas reales, detector, decisión y riesgo conectado. No fabrica 60 velas diarias para cumplir requisitos del escáner anterior. Si falta contexto diario, lo indica y no confirma patrones que dependan de sus niveles; puede evaluar estructura intradía suficiente. Al abrir se revalida el plan: un aviso anterior puede haber caducado. Abrir no añade posiciones ni operaciones. Registrar una posición es una acción explícita y exige completar sus lotes.

## Marca «En Robinhood»

Solo se muestra tras una coincidencia positiva del símbolo exacto en el catálogo público:

- Acciones: `https://api.robinhood.com/instruments/?symbol=...`, con instrumento activo y negociable; contempla notación de clases.
- Cripto: `https://nummus.robinhood.com/currency_pairs/`, con código exacto y par USD negociable; el catálogo se comparte entre consultas.

Negativos y desconocidos quedan **sin etiqueta**. Un 401/403, límite de uso, fallo de red o catálogo incompleto nunca equivale a disponibilidad confirmada. La confirmación se cachea una hora y vuelve a comprobarse; los fallos se pausan un minuto. No se marca por pertenecer a una lista incluida en el código. El cliente consulta al aparecer la ficha en pantalla, comparte solicitudes y limita su concurrencia.

No conecta la cuenta, no importa posiciones ni comprueba permisos por país/estado, tipo de cuenta, región o cadena. La marca identifica una coincidencia pública; verifica disponibilidad efectiva e identidad en tu cuenta. No es una señal de compra. Si el endpoint cambia o exige autenticación, la disponibilidad queda desconocida.

## Operación y pruebas

Las rutas requieren sesión de TraderUSA y validan páginas y símbolos; no aceptan URLs arbitrarias. Los destinos son fijos, con límites de tiempo y tamaño de cuerpo. Los errores usan códigos acotados sin cuerpos privados ni credenciales. No hay migraciones ni credenciales del intermediario.

**Admin → Diagnosticar fuentes** incluye seis destinos de precios, seis de catálogo y dos de Robinhood. Un HTTP correcto no verifica por sí solo contenido, OHLC ni elegibilidad comercial.

Las pruebas cubren formatos/filtros, clases y deduplicación, más de 500 símbolos paginados, versiones cambiantes, cobertura parcial, catálogos anteriores y caducados, disponibilidad exacta/negativa/desconocida, caché/concurrencia y barridos de varios lotes sin saltarse activos incompletos. Usan respuestas controladas: no certifican cobertura de mercado, disponibilidad real en una cuenta ni rentabilidad.

Las pruebas de conexión desde este entorno fueron rechazadas por su proxy de red. La conectividad real debe comprobarse desde Railway con los diagnósticos y estados de fuentes. No se contrató un feed ni se ha verificado este despliegue en producción.
