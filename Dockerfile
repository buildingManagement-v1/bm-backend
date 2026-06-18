# Multi-stage build for the NestJS + Prisma 7 backend.
# Runtime is Alpine + prod-only deps. No native Prisma query engine is needed
# (the `prisma-client` generator + @prisma/adapter-pg use the JS query path),
# so the final image stays small.

############################################################
# Stage 1 — deps: full install incl. devDeps + toolchain to
# compile bcrypt against musl.
############################################################
FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

############################################################
# Stage 2 — build: generate Prisma client + compile Nest.
############################################################
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run db:generate \
 && npm run build

############################################################
# Stage 3 — prod-deps: drop devDependencies (keeps the
# already-compiled bcrypt binary). Then strip the `prisma dev`
# embedded Postgres (pglite, ~25MB) — unused when running against a
# real database. NOTE: @prisma/studio-core CANNOT be removed; the
# Prisma CLI eagerly requires it at load, even for `migrate deploy`.
############################################################
FROM deps AS prod-deps
WORKDIR /app
RUN npm prune --omit=dev \
 && rm -rf node_modules/@electric-sql

############################################################
# Stage 4 — runtime: lean image that actually ships.
############################################################
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8000
# openssl is required by the Prisma schema engine used for `migrate deploy`.
RUN apk add --no-cache openssl
WORKDIR /app

# --chown at copy time avoids a second full copy-on-write layer that a
# later `chown -R` would create (saved ~400MB).
# Production deps already include the Prisma CLI + schema engine (they are in
# the production graph), so `migrate deploy` works without copying them again.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build     --chown=node:node /app/dist ./dist
COPY --from=build     --chown=node:node /app/generated ./generated
COPY --from=build     --chown=node:node /app/prisma ./prisma
COPY --chown=node:node prisma.config.ts package.json docker-entrypoint.sh ./

# Local upload storage — mount a volume here in prod (ephemeral otherwise).
RUN mkdir -p /app/uploads \
 && chmod +x ./docker-entrypoint.sh \
 && chown node:node /app/uploads

USER node
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
# Entry is dist/src/main.js (not dist/main.js): the root-level prisma.config.ts
# is compiled too, so TypeScript nests the source output under dist/src/.
CMD ["node", "dist/src/main"]
