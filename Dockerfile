FROM node:24-alpine AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=512
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmjs.org --replace-registry-host=always --no-audit --no-fund --maxsockets=8 --fetch-retries=1 --fetch-timeout=60000 --loglevel=http
COPY . .
RUN npm run build
RUN ./node_modules/.bin/esbuild scripts/create-admin.ts scripts/init-database.ts --platform=node --bundle --format=esm --outdir=dist --banner:js="import { createRequire } from 'node:module';const require = createRequire(import.meta.url);"
RUN cp deploy/schema.sql dist/schema.sql

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=192
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/trpc/ping').then(async r=>{const d=await r.json();process.exit(r.ok&&d.result?.data?.json?.ok===true?0:1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/boot.js"]
