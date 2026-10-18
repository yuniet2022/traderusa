# TraderUSA / TradeRadar

Aplicación educativa de análisis técnico de acciones y criptomonedas. Incluye escáner, gráficos actualizables, alertas, portafolio, calculadora de riesgo con costes, pruebas históricas y un diario de operaciones simuladas por cuenta. React/Vite sirve la interfaz y Hono/tRPC la API; MySQL almacena usuarios, códigos de suscripción, posiciones y alertas.

## Desarrollo

Requisitos: Node.js 24, npm 11 y MySQL/MariaDB con soporte de transacciones InnoDB. La configuración local se probó con MariaDB 11. El servidor necesita acceso HTTPS a `stooq.com`, `query1.finance.yahoo.com`, `query2.finance.yahoo.com`, `api.kraken.com`, `api.exchange.coinbase.com` y `api.binance.com`. El navegador consulta exclusivamente la API de mercado de la aplicación con su sesión; no requiere proxies CORS públicos.

```sh
npm ci --registry=https://registry.npmjs.org --replace-registry-host=always
```

El lockfile incluye direcciones de un espejo privado. La opción de npm cambia el destino de descarga conservando versiones e integridad del lockfile.

Configura `DATABASE_URL`, `APP_ID` y `APP_SECRET` en las variables del proceso o en un archivo local `.env.local` ignorado por Git. `DATABASE_URL` es una conexión MySQL a tu base de desarrollo y `APP_SECRET` debe ser un secreto aleatorio propio. No publiques estos valores. `APP_ID` es el identificador local de la aplicación.

Inicializa únicamente tu base de desarrollo con migraciones revisadas. Con la conexión configurada, genera la migración, inspecciona su SQL y aplícala antes de arrancar:

```sh
node --env-file=.env.local node_modules/drizzle-kit/bin.cjs generate
node --env-file=.env.local node_modules/drizzle-kit/bin.cjs migrate
node --env-file=.env.local node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3000 --strictPort
```

No ejecutes `db:push` sobre una base de producción para probar cambios. El esquema usa `BIGINT UNSIGNED AUTO_INCREMENT` explícito para evitar el SQL inválido `serial AUTO_INCREMENT` que generaba la declaración anterior. La representación del identificador no cambia respecto a la base local existente. El DDL exportado se comprobó creando cuatro tablas aisladas. La introspección de `db:push` del Drizzle Kit instalado falla sobre esta MariaDB con `checkConstraint`; no se usa para validar el motor ni se recomienda como alternativa a las migraciones revisadas.

El registro requiere un código de acceso creado por un administrador. No hay un usuario administrador ni una contraseña predeterminados. Los permisos de notificación del navegador son opcionales.

La calculadora de tamaño de posición permite indicar comisión porcentual, comisión fija y spread/deslizamiento adverso por cada lado. Limita las unidades usando tanto el riesgo al stop con esos costes como el capital necesario para la entrada. Muestra el resultado al objetivo con los costes indicados y el acierto de equilibrio bajo un modelo de salidas al objetivo o al stop; este umbral no es una probabilidad de éxito ni un rendimiento validado. Los campos de costes vacíos se tratan como cero con un aviso. No incluye impuestos, financiación ni préstamo de activos, y un salto del stop puede producir una pérdida mayor.

## Planes, pruebas y simulación

La pestaña **Planes y simulación** cubre acciones y criptomonedas, cada una en intradía (cinco minutos) y varios días (velas diarias). Su motor largo `long-ema20-50-atr14-v1` es independiente del escáner diario: combina EMA20/50, recuperación tras retroceso o ruptura de diez velas y ATR14. Las reglas están visibles junto al gráfico; no se ha demostrado que generen beneficios.

1. Selecciona mercado, plazo y activo. Consultar otro intervalo del gráfico no cambia el plazo de las reglas.
2. Introduce capital, riesgo y costes por lado. Los costes requieren un valor explícito, incluido cero cuando corresponda.
3. **Probar reglas históricas** usa velas cerradas, 50 de calentamiento y divide el resto cronológicamente 70/30. Entra en la siguiente apertura, aplica costes, respeta saltos del stop y prioriza el stop si también se toca el objetivo. Informa rendimiento neto, caída máxima del capital marcada al cierre de las velas, acierto observado, expectativa, factor de beneficio, comisiones, operaciones y comprar/mantener con costes. Cada tramo comienza con el mismo capital y liquida sus compras pendientes al terminar. La curva no mide fluctuaciones dentro de una vela.
4. **Crear cuenta simulada** fija una vez el capital virtual inicial. **Preparar plan de compra simulada** propone precios desde una vela cerrada; puedes editarlos y escribir el motivo. Guarda una ejecución manual hipotética, tamaño y costes calculados en el servidor, stop y objetivo originales.
5. Registra la venta con su precio observado. Solo se cierran compras simuladas existentes. El diario conserva planes y resultados al recargar, calcula saldo y resultado neto, y protege el acceso por usuario. No ejecuta stops automáticamente ni envía órdenes al mercado; los precios introducidos no se comprueban contra ejecuciones reales.

La simulación admite hasta 20 compras abiertas y 10.000 registros por cuenta. El riesgo conjunto previsto al stop está limitado al 5% del saldo realizado: es un control del producto, no una recomendación. El tamaño usa el efectivo virtual disponible y el porcentaje elegido. Los saltos pueden superar el riesgo previsto. Los totales incluyen todo el historial; se muestran los últimos 100 registros y todas las compras abiertas. No se reescriben planes ni salidas cerradas, ni se restablece el capital para ocultar pérdidas. El diario está separado del portafolio.

El inicializador añade las dos tablas de [deploy/002-paper-trading.sql](deploy/002-paper-trading.sql), además de comprobar el esquema base. No altera ni borra tablas existentes. Docker y Railway incluyen este archivo. En instalaciones manuales, ejecuta el inicializador empaquetado con **ambos** archivos SQL junto a él, o aplica esta creación aditiva revisada antes de usar el diario. Conserva copia de seguridad antes de actualizar una base importante.

Los historiales gratuitos están limitados a unas 420 velas; intradía puede cubrir apenas unos días. No incluye dividendos, impuestos, calendario de cierres anticipados, libro de órdenes ni ejecución real. Si falta la vela del cierre intradía, se sale en la siguiente apertura disponible y se cuenta el salto de sesión. Consulta [docs/VALIDACION_ESTRATEGIA.md](docs/VALIDACION_ESTRATEGIA.md) antes de interpretar resultados.

## Despliegue en Railway

La guía [deploy/RAILWAY.md](deploy/RAILWAY.md) configura la aplicación desde GitHub y MySQL en el mismo proyecto. Incluye las variables necesarias, la creación automática del primer administrador y un dominio HTTPS de Railway. `railway.json` establece la construcción con Docker, la inicialización previa al despliegue y la comprobación de salud. El servidor también prepara la base al arrancar en Railway antes de aceptar peticiones. Los siguientes despliegues conservan las cuentas existentes; los cambios de esquema requieren migraciones revisadas.

## Despliegue en DigitalOcean

La guía [deploy/DIGITALOCEAN.md](deploy/DIGITALOCEAN.md) instala TraderUSA junto a ArchViz con Docker, una base independiente y credenciales de ejecución. Incluye comprobaciones de recursos, creación del primer administrador y los requisitos de dominio/HTTPS.

## Compilación y producción

```sh
npm run build
npm run check
npm start
```

`npm start` necesita las tres variables anteriores en el proceso (por ejemplo, desde el gestor de secretos del alojamiento). En producción las cookies usan `Secure`, `HttpOnly` y `SameSite=Lax`: el sitio debe servirse mediante HTTPS. El puerto se configura con `PORT`, por defecto 3000.

## Pruebas

```sh
npm test
npm run check
npm run lint
```

Vitest incluye pruebas bajo `src/` y `api/`: RSI, estrategias, recálculo por cotizaciones, búsqueda, escáner, riesgo, sesiones y limitación de intentos. La suite de integración se omite sin una activación explícita porque escribe datos aislados en una base local:

```sh
TRADERUSA_DB_INTEGRATION=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run api/authRouter.integration.test.ts api/paperRouter.integration.test.ts
```

Esta suite exige que `DATABASE_URL` apunte a `localhost` o `127.0.0.1` y a la base `traderusa` o `traderusa_test`. Verifica registros simultáneos con el mismo código, reutilización del código tras un registro fallido, revocación y limitación de acceso. Borra únicamente sus propias cuentas y códigos de prueba.

La suite del diario exige específicamente `traderusa_test`, con sus seis tablas preparadas. Comprueba cuentas privadas, suscripciones vencidas, aperturas idempotentes, cierre único, efectivo, riesgo conjunto y pérdidas superiores al stop. El motor histórico tiene pruebas de ausencia de anticipación, costes, salidas ambiguas, saltos, reserva cronológica, velas incompletas y horarios de Nueva York con cambio de hora. Estas pruebas usan datos controlados y no miden rentabilidad de mercado.

Existen incidencias previas de ESLint en otros componentes; una compilación correcta no significa que todo el lint esté resuelto.

## Señales y actualización de datos

- Los historiales, cotizaciones y búsquedas se consultan mediante `/api/market/*`, con sesión y parámetros validados. El servidor usa fuentes directas de OHLC, comparte peticiones simultáneas, conserva una caché acotada y pausa las fuentes que responden con límites de uso o restricciones. No acepta URLs arbitrarias. Los logs `[MARKET_SOURCE_ERROR]` identifican fuente y código sin registrar credenciales.
- El escáner analiza hasta cuatro activos simultáneamente y muestra los resultados conforme llegan. Cada barrido termina en un máximo de 45 segundos; un aviso indica si faltan activos. Conserva análisis anteriores identificados como caché cuando una actualización falla. La primera carga del historial no espera a las cotizaciones: puede mostrar precios históricos hasta recibir una cotización posterior.
- La caché del servidor conserva los historiales del escáner cinco minutos, las velas de los gráficos cinco segundos y las cotizaciones 30 segundos. Si fallan las fuentes, puede servir un historial almacenado hasta 24 horas o una cotización hasta cinco minutos, siempre marcada como caché y conservando las fechas originales. Las fuentes gratuitas pueden limitar el acceso también desde servidores; si ninguna entrega OHLC suficientes se muestra el fallo y se permite reintentar, sin generar precios o velas.
- El gráfico de velas abierto consulta cada diez segundos, se pausa al ocultar la pestaña y consulta de nuevo al volver. Permite actualizar manualmente y conserva el último gráfico si una consulta falla; cancela las consultas al cerrar o cambiar de activo/temporalidad. Muestra la hora de consulta a la fuente y, cuando existe, la hora del precio que esta informa. La vela diaria de acciones prioriza Yahoo para incluir la sesión en curso; el respaldo de cierres diarios de Stooq se identifica expresamente. Una consulta reciente no garantiza precios sin retraso del proveedor.
- La carga del historial se repite cada cinco minutos; las cotizaciones se consultan cada 30 segundos. No se garantiza que los proveedores gratuitos entreguen precios de tiempo real ni que estén disponibles.
- La carga inicial y cada tick aceptado usan el mismo cálculo: actualizan la vela, RSI, medias, MACD, ATR, votos, régimen, puntuación, filtros de extensión, señal y niveles. El detalle abierto refleja el análisis actualizado. Las respuestas anteriores a una recarga completa no sobrescriben esa recarga.
- Un tick del mismo día modifica una copia de la última vela. Si el proveedor da una hora de un día UTC posterior, se agrega una vela provisional con los precios observados; su volumen inicial es cero y no reconstruye operaciones intradía desconocidas. Si falta la hora del proveedor, se actualiza la última vela disponible sin inventar una fecha de cotización. Esto es un cálculo indicativo, no un feed OHLC oficial.
- Cada precio muestra fuente, hora del proveedor cuando existe y estado de cotización/histórico/caché. La hora de consulta local se distingue de la hora del dato. Las series diarias y la caché no se contabilizan como cotizaciones recién consultadas.
- Los horizontes aproximan un año como 252 sesiones para acciones y 365 días para cripto. El máximo usa los cierres del historial disponible hasta ese límite; con menos historial no representa un año completo.
- La proximidad al máximo usa una escala heurística: +50 en el máximo, 0 a un 20% por debajo y valores negativos para distancias mayores. Se mantiene el límite de −100 a +100 y los filtros de extensión posteriores.
- El momentum de 3–6 meses es absoluto: promedia los retornos del propio activo. No es un ranking transversal ni omite el último mes. Se conserva su identificador interno `csmom` por compatibilidad con el contenido educativo.
- La fuerza direccional es una aproximación, no el ADX estándar. Los pesos son por estrategia y régimen; todavía no hay un ensemble con límites por familia.

El motor diario del escáner sigue sin backtest validado, Sharpe ni estimación de rentabilidad. El laboratorio evalúa sus propias reglas sobre el historial disponible: sus métricas no validan las ocho estrategias del escáner ni predicen beneficios. Las referencias académicas de la pestaña Investigación explican conceptos; no son resultados de esta implementación. Antes de añadir rankings relativos, modelos ajustados por riesgo o LightGBM/XGBoost hacen falta datos limpios y evaluación cronológica fuera de muestra, con costos y un benchmark.

## Recuperación cuando fallan las fuentes

El historial de cripto usa Kraken y, como respaldo, Coinbase Exchange (OHLC públicos en USD), Binance y Yahoo. Coinbase pagina los intervalos diarios en solicitudes de como máximo 300 velas para conservar hasta 420 observaciones; las semanas se agrupan a partir de sus velas diarias disponibles. Yahoo intenta sus servidores `query1` y `query2`. Los respaldos siguen sujetos a disponibilidad y límites de cada proveedor; las pruebas de software usan respuestas controladas, no certifican el acceso desde Railway.

El navegador conserva los historiales reales ya recibidos hasta 24 horas para recuperarlos durante un fallo, manteniendo origen, velas y fechas originales. El tiempo máximo se mide también desde la consulta original del servidor para no rejuvenecer datos almacenados. Las observaciones se identifican como anteriores y no disparan nuevas alertas. Una cotización nueva no elimina la advertencia si el historial aún no se ha actualizado. No se generan velas ni señales cuando no existe historial válido.

Cuando la carga falla o conserva historiales anteriores, se reintenta al minuto mientras la pestaña está visible y hay conexión; también puede recuperarse al volver a la pestaña o a la red. El usuario puede actualizar manualmente. Una sesión inválida o una cancelación no se sustituye por una respuesta antigua.

En Railway, consulta `[MARKET_SOURCE_ERROR]`: informa proveedor y código, incluidos HTTP 401/403/429/451, errores DNS, conexión o certificados, sin imprimir consultas, credenciales ni el mensaje privado de la excepción. Los mensajes repetidos se limitan por fuente/código. Un HTTP 5xx pausa brevemente la fuente; los rechazos y límites existentes conservan su pausa compartida. Si todos los proveedores están inaccesibles y no hay datos guardados, hace falta resolver el acceso desde el alojamiento o configurar una fuente con acceso autorizado; repetir la interfaz no restablece una fuente bloqueada.

## Autenticación

El registro bloquea la fila del código con `SELECT ... FOR UPDATE` y crea el usuario y consume el código dentro de una sola transacción. Solo emite la cookie después de confirmar la transacción.

El acceso permite hasta diez intentos por nombre de usuario normalizado en quince minutos y responde `429` con `Retry-After` al superar el límite. Ese presupuesto vive en memoria de un proceso: se pierde al reiniciar y no se comparte entre réplicas. Para producción con varias instancias hace falta un limitador compartido en el proxy o Redis, además de controles por origen; no se confía en cabeceras IP arbitrarias del cliente. Un límite por cuenta también puede bloquear temporalmente a un usuario legítimo si alguien agota sus intentos.
