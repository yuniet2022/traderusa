# TraderUSA en un Droplet que ya ejecuta ArchViz Pro

Esta instalación crea un proyecto Compose `traderusa`, con su propia base MariaDB y volumen. No utiliza PostgreSQL ni cambia los contenedores o los puertos de ArchViz. La aplicación escucha únicamente en `127.0.0.1:3001`; la base no publica puertos.

## Antes de instalar

Comprueba memoria, espacio y puertos en el servidor:

```sh
free -h
df -h /
ss -ltnp | grep -E ':(80|443|3001)\b'
```

En un servidor de 2 GB compartido con ArchViz, comprueba que quede al menos alrededor de 1 GB disponible para construir la imagen y varios GB de disco. El heap de compilación está limitado a 512 MB; los contenedores de la aplicación y MariaDB tienen límites de 256 y 384 MB. Si no hay margen, amplía recursos o construye la imagen en otra máquina antes de instalar. No detengas ArchViz para forzar una compilación.

## Instalación separada

Desde la consola del servidor, con acceso autorizado al repositorio:

```sh
cd /opt
git clone --branch main https://github.com/yuniet2022/traderusa.git
cd /opt/traderusa
bash scripts/init-deployment.sh
docker compose --env-file .env.production.local -f compose.production.yml up -d --build
```

Si `/opt/traderusa` ya existe, inspecciona su remoto y cambios antes de actualizarlo; no vuelvas a clonarlo ni lo sobrescribas.

El script genera tres secretos aleatorios en `.env.production.local`, con permisos `600`, y conserva el archivo en ejecuciones posteriores. No copies su contenido al chat, a Git ni a una imagen. El Dockerfile excluye los archivos de entorno y solo recibe variables al arrancar el contenedor. En redes con una CA corporativa de confianza, la compilación admite el secreto BuildKit opcional `build_ca`; no desactives TLS para instalar dependencias.

El SQL de `deploy/schema.sql` inicializa exclusivamente una base vacía en el primer arranque. No se aplica sobre volúmenes existentes y no sustituye las migraciones de actualización. Conserva y respalda el volumen de base de datos.

Comprueba el arranque desde el servidor:

```sh
docker compose --env-file .env.production.local -f compose.production.yml ps
curl --fail http://127.0.0.1:3001/api/trpc/ping
```

La respuesta debe contener `"ok":true`. Comprueba también la página principal y los logs si un contenedor no está sano.

## Primer administrador

Ejecuta desde `/opt/traderusa`:

```sh
bash scripts/create-admin.sh
```

La contraseña se introduce sin mostrarla. El comando crea únicamente el administrador inicial y rechaza contraseñas cortas, usuarios existentes o una instalación que ya tenga administrador. No cambia cuentas existentes. Desde la interfaz de administrador podrás generar códigos para otras cuentas.

## Dominio y HTTPS

Apunta un dominio o subdominio al Droplet. Las cookies de producción requieren HTTPS, por lo que `http://IP:puerto` no es una dirección válida para usar la sesión de producción.

Antes de editar el proxy existente, identifica dónde está montado el archivo Nginx de ArchViz y guarda una copia. El proxy debe distinguir el dominio de TraderUSA del sitio de ArchViz y terminar TLS con un certificado válido. Un Nginx que corre dentro de Docker no llega a la aplicación del host mediante su propio `127.0.0.1`: debe configurarse una conexión mediante una red compartida o un gateway del host. La regla exacta depende de la red y del dominio del servidor; no se incluye una sustitución automática del archivo de ArchViz.

Verifica `nginx -t` antes de recargar y comprueba ambos sitios después. La instalación local por sí sola no configura DNS, emite certificados ni publica la aplicación en Internet.

## Actualización posterior

Con el árbol de Git limpio y una copia reciente de la base:

```sh
cd /opt/traderusa
git pull --ff-only origin main
docker compose --env-file .env.production.local -f compose.production.yml up -d --build
```

Inspecciona las migraciones incluidas en cada actualización antes de aplicarlas. No elimines el volumen para actualizar. Los secretos se conservan en `.env.production.local`; perder ese archivo y recrearlo con otras claves no cambia las contraseñas del volumen existente.
