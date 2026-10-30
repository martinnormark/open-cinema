# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS node
FROM oven/bun:1.4.2 AS build
# Prisma's CLI uses Node; the deployed application runs on Bun.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/jobs/package.json apps/jobs/package.json
COPY packages/assets/package.json packages/assets/package.json
COPY packages/comfy/package.json packages/comfy/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/runtime/package.json packages/runtime/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build && bun install --production --frozen-lockfile

FROM oven/bun:1.4.2 AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
# Linked workspace packages are server libraries; preserve their relative paths.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/jobs/package.json ./apps/jobs/package.json
COPY --from=build /app/apps/jobs/node_modules ./apps/jobs/node_modules
COPY --from=build /app/apps/jobs/src ./apps/jobs/src
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/apps/web/server.ts ./apps/web/server.ts
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir /data && chown bun:bun /data
USER bun
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e 'const r = await fetch("http://127.0.0.1:" + (process.env.PORT || "3000") + "/healthz"); process.exit(r.ok ? 0 : 1)'
CMD ["bun", "apps/web/server.ts"]
