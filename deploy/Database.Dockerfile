FROM mariadb:11.8
COPY --chmod=0444 deploy/schema.sql /docker-entrypoint-initdb.d/001-schema.sql
COPY --chmod=0444 deploy/002-paper-trading.sql /docker-entrypoint-initdb.d/002-paper-trading.sql
