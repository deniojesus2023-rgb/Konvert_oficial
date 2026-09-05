# syntax=docker/dockerfile:1

# ---- deps: install once, cached separately from source changes ----
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm ci
RUN npm ci --prefix web

# ---- build: compile backend (tsc) and frontend (vite) ----
FROM deps AS build
COPY . .
RUN npm run build
RUN npm run build --prefix web

# ---- runtime: production deps only + compiled output ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/db/schema.ts ./src/db/schema.ts
COPY drizzle.config.ts ./

# Railway (and most PaaS) inject PORT at runtime; env.ts already reads
# it, falling back to 3000 for local `docker run` without -e PORT.
EXPOSE 3000

# Migrations run on every boot before the server starts — safe because
# drizzle-kit only applies migrations not yet recorded in
# __drizzle_migrations. drizzle-kit is a runtime dependency (not dev)
# specifically so this works in the pruned production image.
CMD ["sh", "-c", "npm run db:migrate && npm start"]
