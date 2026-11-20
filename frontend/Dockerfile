# Production image for the frontend (Phase 8). Two stages: build the static Vite bundle with
# Node/pnpm, then serve it with nginx as a non-root user, proxying /api and /health to the
# backend (see docs/DEPLOYMENT.md for the full story and docker-compose.frontend.yml for how this
# plugs into the backend's own docker-compose.yml without editing it).
#
# Build (from the frontend/ directory):
#   docker build -t farmland-frontend:local .
# Any VITE_* value that should be baked into the bundle (the map style/key vars; VITE_API_PROXY_TARGET
# is dev-server-only and never bundled, see vite.config.ts) is a build arg, since Vite reads
# import.meta.env only at build time, never at container start:
#   docker build --build-arg VITE_MAP_STYLE_SATELLITE_URL=https://... -t farmland-frontend:local .

# ---- deps: install with the lockfile frozen, cached separately from the rest of the source ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build: the static bundle (dist/) ----
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Declared so `docker build --build-arg NAME=...` can set them; every one is optional (see
# .env.example) and Vite's own `lib/env.ts` validates whatever ends up set.
ARG VITE_ENABLE_DEV_TOKEN_LOGIN=false
ARG VITE_TOKEN_TTL_MINUTES=480
ARG VITE_MAP_STYLE_URL=
ARG VITE_MAP_STYLE_SATELLITE_URL=
ARG VITE_MAP_API_KEY=
ENV VITE_ENABLE_DEV_TOKEN_LOGIN=${VITE_ENABLE_DEV_TOKEN_LOGIN} \
    VITE_TOKEN_TTL_MINUTES=${VITE_TOKEN_TTL_MINUTES} \
    VITE_MAP_STYLE_URL=${VITE_MAP_STYLE_URL} \
    VITE_MAP_STYLE_SATELLITE_URL=${VITE_MAP_STYLE_SATELLITE_URL} \
    VITE_MAP_API_KEY=${VITE_MAP_API_KEY}
RUN pnpm build

# ---- runner: nginx, already non-root (uid 101), listening on 8080 ----
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
# Only this one placeholder in the template is substituted at container start; nginx's own
# $host/$remote_addr/... variables in the template must survive untouched (see the template).
ENV NGINX_ENVSUBST_FILTER=^API_PROXY_TARGET$ \
    API_PROXY_TARGET=http://api:8000
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
# Checks nginx itself (the static shell it serves), not the backend through the /health proxy:
# this container is healthy whenever it can serve the app, independent of the backend's own state.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
