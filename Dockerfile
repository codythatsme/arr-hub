FROM oven/bun:1.3 AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN NITRO_PRESET=node-server bun run build

FROM node:22-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/arr-hub.db
ENV PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/package.json ./package.json
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm rebuild better-sqlite3 --build-from-source \
  && rm -rf .output/server/node_modules/better-sqlite3 \
  && cp -R node_modules/better-sqlite3 .output/server/node_modules/better-sqlite3 \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/* /root/.npm
RUN mkdir -p /data
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "const port=process.env.PORT||3000; fetch('http://127.0.0.1:'+port+'/api/system/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["sh", "-c", "node_modules/.bin/drizzle-kit migrate && node .output/server/index.mjs"]
