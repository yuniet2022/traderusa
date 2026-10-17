# Publicar TraderUSA en Railway

Se despliegan dos servicios en el mismo proyecto: la aplicación desde GitHub y MySQL con su volumen persistente. La interfaz y la API se sirven juntas. No hace falta usar el servidor de ArchViz.

Railway cobra por recursos; los créditos gratuitos o de prueba pueden agotarse. Consulta [los planes](https://railway.com/pricing) y el consumo de tu cuenta antes de contratar. Activa alertas de gasto. Esta configuración no contrata planes ni garantiza alojamiento gratuito permanente.

## 1. Crear el proyecto y la base

1. Entra en [Railway](https://railway.com/) con GitHub y crea un proyecto vacío.
2. Añade **Database → MySQL**. Mantén el nombre del servicio `MySQL` para usar la referencia de abajo y espera a que esté disponible.
3. Añade otro servicio desde **GitHub Repo → yuniet2022/traderusa**, rama `main`. Concede acceso a ese repositorio si Railway lo solicita.

El repositorio incluye `railway.json` y un `Dockerfile`; Railway utiliza esa configuración automáticamente. Si el primer despliegue falla antes de configurar las variables, completa el paso siguiente y vuelve a desplegar. Usa la raíz del repositorio y conserva una sola réplica.

## 2. Configurar las variables de la aplicación

En **Variables** del servicio TraderUSA, añade:

| Variable | Valor |
| --- | --- |
| `APP_ID` | `traderusa` |
| `APP_SECRET` | Un secreto aleatorio propio de al menos 32 bytes. Puedes generarlo en tu terminal con `openssl rand -hex 32`. |
| `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` — referencia a la conexión privada de MySQL. |
| `TRADER_ADMIN_USER` | Tu primer usuario administrador: 3–32 letras, números, puntos, guiones o guiones bajos. |
| `TRADER_ADMIN_PASSWORD` | Una contraseña propia de 12–128 caracteres. |

Introduce los secretos directamente en Railway. No los publiques en GitHub ni los envíes por chat. Si cambias el nombre del servicio MySQL, usa el selector de referencias de Railway para apuntar a su `MYSQL_URL`.

El contenedor ya establece `NODE_ENV=production`. Railway proporciona `PORT`; la aplicación escucha en `0.0.0.0` y utiliza ese puerto. No establezcas un comando de inicio distinto al del Dockerfile.

## 3. Desplegar y abrir la web

1. Aplica las variables y despliega el servicio TraderUSA.
2. El paso **pre-deploy** ejecuta `node dist/init-database.js && node dist/create-admin.js --if-needed`. Crea las tablas que faltan y el administrador inicial. Además, el servidor repite esta preparación al arrancar cuando Railway proporciona `RAILWAY_ENVIRONMENT_ID`; así comprueba la base de su propio entorno aunque se haya omitido el paso pre-deploy. Las operaciones son repetibles y conservan las cuentas existentes. Si faltan las credenciales iniciales o la conexión falla, la web no arranca.
3. En **Settings → Networking**, genera un dominio público para la aplicación. Usa el puerto asignado por Railway. La dirección `https://…up.railway.app` incluye HTTPS; las cookies de sesión requieren HTTPS.
4. Abre la web, inicia sesión con el administrador y comprueba que puedes guardar una posición y verla después de recargar. El administrador puede crear códigos de acceso para registrar otras cuentas.
5. Después de verificar el acceso, elimina `TRADER_ADMIN_USER` y `TRADER_ADMIN_PASSWORD` de las variables y aplica el cambio. En los siguientes despliegues el administrador existente se conserva, sin necesitar esas credenciales.

MySQL debe conservar su volumen. La aplicación no necesita volumen y no necesita una conexión pública a MySQL. Configura copias de seguridad en Railway antes de guardar datos importantes.

## Actualizaciones

Mantén activados los despliegues desde GitHub para la rama `main`. Al subir un commit, Railway construye la imagen y ejecuta el paso previo al despliegue; solo promueve la aplicación cuando `/api/trpc/ping` responde correctamente. Las tablas y las cuentas existentes se conservan; cambiar las variables iniciales no cambia contraseñas existentes.

La inicialización aplica exclusivamente el esquema base: **no modifica columnas existentes ni sustituye las migraciones**. Comprueba que existen las columnas necesarias; no verifica todos sus tipos ni índices. Los cambios futuros de esquema requieren migraciones revisadas y copia de seguridad. No uses `db:push` como comando de despliegue.

Mantén estable `APP_SECRET`: cambiarlo invalida las sesiones. Usa una sola réplica mientras el límite de intentos de acceso siga en memoria. La disponibilidad y el tiempo de los datos de mercado dependen también de los proveedores consultados desde el navegador.

## Si falla

- **Error de consulta al iniciar sesión:** consulta los logs de ejecución de TraderUSA y busca `[API_ERROR]`. Se registra el procedimiento y el código de la causa, sin consultas ni parámetros. `ER_NO_SUCH_TABLE` indica que faltan tablas (revisa el paso pre-deploy); `ER_ACCESS_DENIED_ERROR` indica credenciales o permisos; `ENOTFOUND` indica resolución del host; `ECONNREFUSED` indica que la conexión fue rechazada. Comparte únicamente esa línea para diagnosticar el fallo.
- **Preparación al arrancar:** después de `[STARTUP_SETUP]` deben aparecer `Tablas de TraderUSA listas.` y la creación o conservación del administrador antes de `Server running`. Si aparece `[STARTUP_SETUP_FAILED]`, corrige el problema indicado en las líneas anteriores. Conserva `TRADER_ADMIN_USER` y `TRADER_ADMIN_PASSWORD` hasta haber creado el primer administrador.
- **Pre-deploy / conexión:** confirma que MySQL está listo y que `DATABASE_URL` referencia `MySQL.MYSQL_URL`. Después vuelve a desplegar.
- **Credenciales iniciales:** configura las dos variables `TRADER_ADMIN_*` si todavía no existe un administrador. El inicializador no convierte usuarios existentes en administradores ni restablece contraseñas.
- **Esquema incompatible:** revisa la base y aplica una migración adecuada. No borres el volumen para intentar arreglarlo.
- **Healthcheck o dominio:** revisa los logs y las variables requeridas. El puerto de la red pública debe coincidir con `PORT`. Conserva el comando de inicio del Dockerfile.
- **No persiste la sesión:** utiliza la URL HTTPS y conserva el mismo `APP_SECRET`.

Referencias oficiales: [configuración en el repositorio](https://docs.railway.com/config-as-code), [pre-deploy](https://docs.railway.com/deployments/pre-deploy-command), [MySQL](https://docs.railway.com/databases/mysql).
