# TraderUSA / TradeRadar

Aplicación educativa de análisis técnico de acciones y criptomonedas. Incluye un escáner de señales, indicadores, alertas locales, portafolio por cuenta y una calculadora de tamaño de posición. React/Vite sirve la interfaz y Hono/tRPC la API; MySQL almacena usuarios, códigos de suscripción, posiciones y alertas.

## Desarrollo

Requisitos: Node.js 24, npm 11 y MySQL/MariaDB con soporte de transacciones InnoDB. La configuración local se probó con MariaDB 11. El servidor necesita acceso HTTPS a `stooq.com`, `query1.finance.yahoo.com`, `api.kraken.com` y `api.binance.com`. El navegador consulta exclusivamente la API de mercado de la aplicación con su sesión; no requiere proxies CORS públicos.

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
TRADERUSA_DB_INTEGRATION=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run api/authRouter.integration.test.ts
```

Esta suite exige que `DATABASE_URL` apunte a `localhost` o `127.0.0.1` y a la base `traderusa` o `traderusa_test`. Verifica registros simultáneos con el mismo código, reutilización del código tras un registro fallido, revocación y limitación de acceso. Borra únicamente sus propias cuentas y códigos de prueba.

Existen incidencias previas de ESLint en otros componentes; una compilación correcta no significa que todo el lint esté resuelto.

## Señales y actualización de datos

- Los historiales, cotizaciones y búsquedas se consultan mediante `/api/market/*`, con sesión y parámetros validados. El servidor usa fuentes directas de OHLC, comparte peticiones simultáneas, conserva una caché acotada y pausa las fuentes que responden con límites de uso o restricciones. No acepta URLs arbitrarias. Los logs `[MARKET_SOURCE_ERROR]` identifican fuente y código sin registrar credenciales.
- El escáner analiza hasta cuatro activos simultáneamente y muestra los resultados conforme llegan. Cada barrido termina en un máximo de 45 segundos; un aviso indica si faltan activos. Conserva análisis anteriores identificados como caché cuando una actualización falla. La primera carga del historial no espera a las cotizaciones: puede mostrar precios históricos hasta recibir una cotización posterior.
- La caché del servidor conserva historiales cinco minutos (30 segundos en intradía) y cotizaciones 30 segundos. Si fallan las fuentes, puede servir un historial almacenado hasta 24 horas o una cotización hasta cinco minutos, siempre marcada como caché y conservando las fechas originales. Las fuentes gratuitas pueden limitar el acceso también desde servidores; si ninguna entrega OHLC suficientes se muestra el fallo y se permite reintentar, sin generar precios o velas.
- La carga del historial se repite cada cinco minutos; las cotizaciones se consultan cada 30 segundos. No se garantiza que los proveedores gratuitos entreguen precios de tiempo real ni que estén disponibles.
- La carga inicial y cada tick aceptado usan el mismo cálculo: actualizan la vela, RSI, medias, MACD, ATR, votos, régimen, puntuación, filtros de extensión, señal y niveles. El detalle abierto refleja el análisis actualizado. Las respuestas anteriores a una recarga completa no sobrescriben esa recarga.
- Un tick del mismo día modifica una copia de la última vela. Si el proveedor da una hora de un día UTC posterior, se agrega una vela provisional con los precios observados; su volumen inicial es cero y no reconstruye operaciones intradía desconocidas. Si falta la hora del proveedor, se actualiza la última vela disponible sin inventar una fecha de cotización. Esto es un cálculo indicativo, no un feed OHLC oficial.
- Cada precio muestra fuente, hora del proveedor cuando existe y estado de cotización/histórico/caché. La hora de consulta local se distingue de la hora del dato. Las series diarias y la caché no se contabilizan como cotizaciones recién consultadas.
- Los horizontes aproximan un año como 252 sesiones para acciones y 365 días para cripto. El máximo usa los cierres del historial disponible hasta ese límite; con menos historial no representa un año completo.
- La proximidad al máximo usa una escala heurística: +50 en el máximo, 0 a un 20% por debajo y valores negativos para distancias mayores. Se mantiene el límite de −100 a +100 y los filtros de extensión posteriores.
- El momentum de 3–6 meses es absoluto: promedia los retornos del propio activo. No es un ranking transversal ni omite el último mes. Se conserva su identificador interno `csmom` por compatibilidad con el contenido educativo.
- La fuerza direccional es una aproximación, no el ADX estándar. Los pesos son por estrategia y régimen; todavía no hay un ensemble con límites por familia.

No hay backtest validado de este motor, tasa de acierto, Sharpe ni estimación de rentabilidad. Las referencias académicas de la pestaña Investigación explican conceptos; no son resultados de esta implementación. Antes de añadir rankings relativos, modelos ajustados por riesgo o LightGBM/XGBoost hacen falta datos limpios y evaluación cronológica fuera de muestra, con costos y un benchmark.

## Autenticación

El registro bloquea la fila del código con `SELECT ... FOR UPDATE` y crea el usuario y consume el código dentro de una sola transacción. Solo emite la cookie después de confirmar la transacción.

El acceso permite hasta diez intentos por nombre de usuario normalizado en quince minutos y responde `429` con `Retry-After` al superar el límite. Ese presupuesto vive en memoria de un proceso: se pierde al reiniciar y no se comparte entre réplicas. Para producción con varias instancias hace falta un limitador compartido en el proxy o Redis, además de controles por origen; no se confía en cabeceras IP arbitrarias del cliente. Un límite por cuenta también puede bloquear temporalmente a un usuario legítimo si alguien agota sus intentos.
