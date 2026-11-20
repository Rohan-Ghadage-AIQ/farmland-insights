# Deployment

Phase 8. Covers the production Docker image, the env vars it needs, the reverse-proxy setup it
depends on, and the CORS note that explains why a reverse proxy rather than a direct browser call.

## Why a reverse proxy (the CORS note)

The backend has no CORS middleware (`BACKEND_REQUESTS.md` #3), so a browser on a different origin
cannot call it directly — there is no `Access-Control-Allow-Origin` header to make that legal. The
frontend never tries: it calls `/api/v1/...` and `/health` as **relative, same-origin paths**
(`src/api/client.ts`), same as the Vite dev server's own proxy (`vite.config.ts`) does locally. In
production, something in front of the static files has to proxy those same two paths to the real
backend so the browser only ever talks to one origin. That something is nginx, built into the
image this phase adds (`Dockerfile`, `docker/nginx.conf.template`) — not a separate reverse proxy
you have to stand up yourself. If `BACKEND_REQUESTS.md` #3 is ever fixed (the backend adds
`CORSMiddleware` with an explicit origin allow-list), this proxy step becomes optional, not wrong;
nothing about the frontend's own code changes either way, since it always called relative paths.

## Build the image

From `frontend/`:

```sh
docker build -t farmland-frontend:local .
```

Two stages: `node:22-alpine` installs with `pnpm install --frozen-lockfile` and runs `pnpm build`;
`nginxinc/nginx-unprivileged:1.27-alpine` serves the result. The runtime image is already
non-root (that image's whole purpose: nginx as uid 101, listening on 8080, no capabilities needed
to bind the port), and a `HEALTHCHECK` hits `/` (the static shell nginx itself serves, so the
container reports healthy independently of whether the backend is up).

### Build-time vs. runtime configuration

This matters because the two are configured completely differently:

- **`VITE_*` variables are build-time only.** Vite inlines `import.meta.env.VITE_*` into the
  bundle when `pnpm build` runs (see `src/lib/env.ts`); nothing reads them again once the files
  are built. Set the ones you want baked in as Docker **build args**:

  ```sh
  docker build \
    --build-arg VITE_MAP_STYLE_SATELLITE_URL=https://example.com/satellite/{z}/{x}/{y}.png \
    --build-arg VITE_MAP_API_KEY=your-key \
    -t farmland-frontend:local .
  ```

  `VITE_API_PROXY_TARGET` is **not** one of these: it is read only by `vite.config.ts` for the dev
  server's own proxy and is never bundled (see the comment there). It has no equivalent at
  runtime because production doesn't need a dev-server proxy — see the next point.

- **`API_PROXY_TARGET` is a runtime, container-start env var**, read by nginx's own templating
  (`docker/nginx.conf.template`, substituted by `NGINX_ENVSUBST_FILTER` at container start — see
  the comments in the `Dockerfile` and the template for exactly how). It is the one setting that
  changes between environments without rebuilding the image:

  ```sh
  docker run -p 8080:8080 -e API_PROXY_TARGET=https://api.staging.example.com farmland-frontend:local
  ```

  Default: `http://api:8000`, which matches `docker-compose.frontend.yml`'s service name.

| Variable                       | When it's set         | Effect                                                                                                                                                                    |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_ENABLE_DEV_TOKEN_LOGIN`  | build arg             | Bake in the passwordless dev sign-in tab. **Leave this `false` (the default) for any real deployment** — see `BACKEND_REQUESTS.md` #1/#3 and the spec's own §2.2 warning. |
| `VITE_TOKEN_TTL_MINUTES`       | build arg             | Requested token lifetime baked into the bundle.                                                                                                                           |
| `VITE_MAP_STYLE_URL`           | build arg             | Optional custom vector style.                                                                                                                                             |
| `VITE_MAP_STYLE_SATELLITE_URL` | build arg             | Optional satellite style/tiles.                                                                                                                                           |
| `VITE_MAP_API_KEY`             | build arg             | Optional key the map style needs.                                                                                                                                         |
| `API_PROXY_TARGET`             | container runtime env | Where nginx proxies `/api` and `/health`. Default `http://api:8000`.                                                                                                      |

## Run it alongside the backend

`docker-compose.frontend.yml` (inside `frontend/`, this phase) adds a `frontend` service without
touching the repo root's `docker-compose.yml` at all. Same Compose project name (`farmland`), so
running both files together merges into one project and one network: `frontend` reaches the
backend's `api` service by that name, which is exactly what the default `API_PROXY_TARGET` above
expects.

From the **repository root**:

```sh
docker compose -f docker-compose.yml -f frontend/docker-compose.frontend.yml up --build
```

The app is then at `http://localhost:8080`, proxying to the backend's `api` service at `:8000`
internally (the backend's own `docker-compose.yml` still also publishes `:8000` on the host,
unchanged by any of this).

Pointing the frontend at a backend that isn't this Compose project's own `api` service (already
running elsewhere, a different host or port, a staging deployment) means overriding
`API_PROXY_TARGET` and dropping the `depends_on: [api]` line; do that with your own third override
file (`docker compose -f docker-compose.yml -f frontend/docker-compose.frontend.yml -f
my-override.yml up`) rather than editing `docker-compose.frontend.yml` itself.

## Outside Docker

The image is the supported path, but the contract is just "serve `dist/` as static files, proxy
`/api` and `/health` to the backend, same origin as the static files". Any static host plus any
reverse proxy that can do that works: `docker/nginx.conf.template` is a complete, working example
to adapt (Caddy, Apache, a cloud load balancer's own path-based routing, a CDN's edge functions,
...). The two genuinely load-bearing behaviours to keep are:

- `try_files $uri /index.html` (or equivalent): the SPA has client-side routes (`/`, `/login`,
  `/dev/ui` in dev builds only), so a hard reload on `/login` must still serve `index.html`.
- The `/analyze` request can take tens of seconds (API_CONTRACT.md §7): whatever proxies `/api/`
  needs a read/send timeout generous enough for that (the template uses 190s, just above the
  frontend's own 180s `ANALYZE_TIMEOUT_MS`).

## Verifying this phase's own Docker work

This Dockerfile and compose file were reviewed carefully (multistage build, the non-root base
image, the `NGINX_ENVSUBST_FILTER` mechanism, `docker compose config` to confirm the merged
project is valid — see below) but **the actual `docker build`/`docker run` was not run**: this
session's sandbox has the Docker CLI but no running daemon (`docker info` never came up, even
after starting Docker Desktop and waiting). `docker compose -f docker-compose.yml -f
frontend/docker-compose.frontend.yml config` _was_ run successfully (no daemon needed for that),
confirming the two compose files merge into one valid project with `frontend` resolving `api` by
service name. Building and running the image for real is the first thing to do with a working
Docker daemon, before trusting this in a real deployment.
