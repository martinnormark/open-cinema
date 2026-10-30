# Docker deployment

The application is built from the root `Dockerfile`. Docker Compose is supplied for a persistent volume and configuration; it runs one application container and requires no database or storage services. GPU generation runs externally on Comfy Router and Comfy Cloud.

## Start locally

```sh
cp .env.example .env
# Edit .env to add COMFY_API_KEY when you want to generate.
docker compose up --build -d
```

Open http://localhost:3000. The default port is bound to `127.0.0.1`. Local mode creates a signed browser session from the studio's existing session action. A signing secret is generated once inside the data volume. Missing Comfy credentials do not prevent startup, library use, or configuration inspection.

Without Compose:

```sh
docker build -t open-cinema .
docker run -d --name open-cinema \
  -p 127.0.0.1:3000:3000 --env-file .env \
  -v open-cinema-data:/data --restart unless-stopped open-cinema
```

Both commands require only Docker, not a host Bun or Node installation. The image runs as the unprivileged `bun` user. For a bind-mounted data directory, grant that user write access first; a named volume is initialized automatically.

## Secrets and provider access

| Setting                | Purpose                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `COMFY_API_KEY`        | Common key for Router and Cloud                                                   |
| `COMFY_ROUTER_API_KEY` | Optional Router-specific override                                                 |
| `COMFY_CLOUD_API_KEY`  | Optional Cloud-specific override                                                  |
| `MAX_ACTIVE_JOBS`      | Concurrent generations per creator, 1–4, default 1                                |
| `LOCAL_SESSION_SECRET` | Optional 32+ character signing secret; generated and persisted when omitted       |
| `MEDIA_SIGNING_SECRET` | Optional separate signing key for provider media links                            |
| `MEDIA_PUBLIC_ORIGIN`  | Optional public HTTPS studio origin for signed input-media links                  |
| `AUTH_MODE`            | `local` or `password`                                                             |
| `BASIC_AUTH_USER`      | Hosted studio username, default `studio`; keep stable to retain account ownership |
| `BASIC_AUTH_PASSWORD`  | Required in password mode                                                         |
| `APP_ORIGIN`           | Public origin, e.g. `https://cinema.example.com`, when behind a reverse proxy     |
| `DATA_DIR`             | Persistent storage path, fixed to `/data` by Compose                              |

All settings accept a `_FILE` suffix. File contents take precedence; unreadable files fail instead of silently ignoring a missing secret. Keys are read only on the server. Never place keys in `VITE_*` variables or Docker build arguments.

For mounted secrets, add a local Compose override, for example `compose.secrets.yaml`:

```yaml
services:
  studio:
    environment:
      COMFY_API_KEY_FILE: /run/secrets/comfy_api_key
      BASIC_AUTH_PASSWORD_FILE: /run/secrets/studio_password
      AUTH_MODE: password
    secrets:
      - comfy_api_key
      - studio_password
secrets:
  comfy_api_key:
    file: ./secrets/comfy_api_key
  studio_password:
    file: ./secrets/studio_password
```

Create those two files with your key and a strong password, then run:

```sh
docker compose -f compose.yaml -f compose.secrets.yaml up --build -d
```

The `secrets/` directory is ignored by Git and excluded from the image. Alternatively mount a file with `docker run --mount type=bind,src=/absolute/path/to/key,dst=/run/secrets/comfy_api_key,readonly -e COMFY_API_KEY_FILE=/run/secrets/comfy_api_key ...`.

Router credits and Cloud access are governed by your Comfy account. A workflow may need both services: for example, a Router generation followed by a Cloud media step. No GPU or ComfyUI image is run in this deployment.

`COMFY_BASE_URL`, `COMFY_ROUTER_BASE_URL` and `COMFY_CLOUD_BASE_URL` remain optional development-only loopback relay overrides. Production calls use the official service endpoints. Direct provider access is the default; no relay is required.

## Public hosting

Set `AUTH_MODE=password`, a strong `BASIC_AUTH_PASSWORD`, and `APP_ORIGIN` to the public HTTPS origin. Put the container behind a TLS reverse proxy that supports WebSocket upgrades and streaming uploads. Configure its upload limit and timeout for the media sizes you use. The app intentionally ignores arbitrary forwarded-origin headers and uses the explicit public origin.

Leave the Compose host binding on loopback when the proxy runs on the host. For a proxy in another container, connect it to the studio's Compose network and proxy to `studio:3000`. Only expose the proxy publicly. Password mode is one shared studio identity; it does not implement individual accounts or SSO.

Signed provider-media links, if enabled, must reach `/api/media/:id` without additional proxy-level login. The app verifies their signature, owner, path and expiry. All other application requests still require the studio password. If this cannot be arranged, omit `MEDIA_PUBLIC_ORIGIN` and the app uses Comfy storage uploads instead.

## Persistence, upgrades and backups

The named `studio-data` volume holds the catalog, job checkpoints, media and generated signing secret. Restarting or rebuilding a container preserves those files. `docker compose down` preserves the volume; **`docker compose down -v` deletes it**.

Run one replica per volume. This is a single-process deployment; do not point two studios at the same data directory. Back up while stopped so media, catalog and execution state are consistent:

1. Run `docker compose stop`.
2. Snapshot or copy the entire named volume using your Docker host's volume backup mechanism.
3. Run `docker compose start`.

Restore the complete volume, not only the catalog. Startup applies pending SQL migrations and resumes jobs from saved provider receipts and wake times. After a failed upgrade, restore the backup before running an older image whose schema may be incompatible.

Legacy world bundles remain importable; the `r2Key` metadata field is retained as a storage-neutral compatibility field. Existing hosted databases and buckets are **not automatically migrated**. Use the app's world export/import for reusable creative assets, or plan a separate full data transfer if old generation history must also move. Never copy runtime emulation directories into the new data volume.

`GET /healthz` reports server readiness after migrations. Inspect logs with `docker compose logs -f studio`. On shutdown, the scheduler drains in-flight work until the container's stop deadline; persisted watchdogs recover interrupted work on the next start.

## Verify a built image

Run `bun scripts/docker-smoke.ts open-cinema:your-tag` from the repository. It creates disposable containers and volumes, uses fixture secret files, and verifies authentication, SSR, private uploads, byte ranges, WebSockets, public-origin handling and restart persistence. It never submits a paid generation. The same check runs in CI.
