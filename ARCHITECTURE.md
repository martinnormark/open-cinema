# Architecture

Open Cinema runs as one self-hosted Docker container. Bun serves the TanStack Start application, its React Server Components, static assets, authenticated media routes, and WebSockets. The same process runs persistent generation coordinators. No hosted infrastructure service is required for application hosting, authentication, scheduling, database storage, or media storage.

Comfy Router and Comfy Cloud remain external GPU providers, configured with runtime secrets. The application can start and manage a library without provider credentials; generation refuses requests until the relevant key is configured.

## Deployment and persistence

The root `Dockerfile` builds and runs the whole application. `compose.yaml` exposes port 3000 on loopback and mounts a named volume at `/data`. No database, queue, or object-storage sidecar is needed. See [deployment](docs/deployment.md) for secrets, public hosting, backups, and upgrades.

| Concern               | Implementation                                                          |
| --------------------- | ----------------------------------------------------------------------- |
| HTTP, SSR and RSC     | TanStack Start on Bun, `apps/web/server.ts`                             |
| Application records   | SQLite catalog, Prisma with `@prisma/adapter-libsql` in local-file mode |
| Execution checkpoints | Separate SQLite WAL, `CoordinatorStore` in `packages/database`          |
| Scheduling            | Persisted wake timestamps, scanned by `JobService` every 100 ms         |
| Media                 | Private files on the data volume, streamed with ETags and byte ranges   |
| Authentication        | Signed loopback sessions or HTTP Basic password protection over HTTPS   |
| Live updates          | Authenticated, same-origin, read-only WebSockets                        |
| GPU execution         | Official Comfy SDK for Router requests and Comfy Cloud graphs           |

Run **one application process per data volume**. This deployment deliberately has no distributed lock or cross-process WebSocket bus; do not scale replicas against the same volume. Use separate volumes for independent studios. SQLite and private media need durable local/block storage, not a shared network filesystem.

`/data/catalog.sqlite` holds the application catalog. `/data/jobs.sqlite` holds checkpoints and scheduling. `/data/assets` holds media. `/data/session-secret` holds the automatically generated signing secret unless supplied explicitly. Back up the entire volume together while stopped, including SQLite WAL files; restoring only the catalog loses active job state and bytes.

## Workspace boundaries

- `apps/web` owns presentation, authentication, authorization, server functions, HTTP routes and browser interactions. Server functions authenticate and validate inputs before calling database operations or coordinator commands.
- `apps/jobs` owns long-running Comfy operations, acceptance, state transitions, retries, cancellation and status delivery. It is a server library in the same process, with no separate public API.
- `packages/database` owns the Prisma model, ordered SQL migrations, all queries/mutations, and transactional checkpoint storage. Application code receives an opaque database context, not ORM delegates.
- `packages/assets` owns file transfer, validation, atomic publishing and streaming delivery. Callers authorize objects before passing their keys. It does not import the database or Comfy SDK.
- `packages/runtime` owns server configuration, secret-file loading, the HTTP authentication boundary, and the request-local WebSocket upgrade adapter.
- `packages/comfy` wraps the SDK and workflow graphs. It maps provider responses into shared contracts without deciding persistence or retry policy.
- `packages/contracts` holds browser-safe schemas and DTOs. It has no database, server-runtime, SDK or React dependency.

Vite leaves server workspace packages external in both SSR and RSC builds. This is essential: the HTTP adapter, server functions and scheduler must share the same coordinator registry and request-local upgrade context. Server-only modules and secrets must never enter the client build.

## Job lifecycle and recovery

Each creator has a coordinator addressed by their authenticated owner ID. A command is accepted only after its checkpoint and next wake timestamp commit atomically. An idempotency key and immutable request hash prevent retries from producing a second generation. A reused key with changed inputs is rejected. The four-job queue and configurable one-to-four active-job limit are retained.

The state machine retains the existing Router and Cloud workflows, stage transitions, saved upload receipts, deadlines, uncertain-submission handling, cancellation races and versioned catalog projections. A successful provider result first enters `persisting`; all output bytes must be saved before the job becomes `succeeded`. A failed archive retries storage without generating again.

The scheduler scans persisted due times even when no browser is connected. It permits at most one wake per owner at a time while allowing independent owners to progress. A wake first persists a watchdog time, then performs external work. Container termination interrupts that work; the next process discovers its saved wake and reconciles the same provider receipt. Uncertain provider acceptance is never treated as permission to submit a new paid job.

Checkpoint changes and pending catalog projections commit together. Catalog writes are idempotent and conditional on job version; delayed writes cannot replace newer state. Pending projections retry until confirmed. There is no transaction spanning SQLite, files and Comfy, so catalog history may briefly lag the authoritative live snapshot.

Checkpoint schema upgrades remain in `packages/database/src/durable`. The legacy serialized field `r2Key` is retained in the database, checkpoint and world-bundle contracts for compatibility; it now identifies a private file-store object and has no service or SDK dependency.

## Asset ownership and delivery

Uploads validate size, file signature and media type. Data is streamed into a temporary file with bounded memory. The completed file contains the media bytes, ownership metadata and ETag and is atomically renamed into place only after syncing. Abandoned partial files are removed at startup. Keys are hashed into filenames, so user-controlled key paths cannot escape the storage directory.

Generated outputs use deterministic keys. If a process dies after publishing an asset but before saving its checkpoint, a retry discovers the existing owned object without downloading it again. Media delivery authenticates ownership and supports HEAD, conditional GET and byte ranges. The file directory is never served as a public static directory.

Providers receive either a short-lived signed media URL or a Comfy storage upload. Signed URLs cover a specific owner, asset, variant and expiry, and never grant arbitrary file access. The HTTP password gate lets signed-media GET/HEAD requests reach the route's signature check so providers do not need the studio password. Session cookies and provider credentials are never forwarded to output download hosts.

## Authentication and secrets

Local mode is confined to loopback URLs and signed cookies. Hosted mode uses a deployment username and password, a stable account owner ID, and TLS supplied by a reverse proxy. It is a single shared studio account, not a multi-user SSO service. Ownership isolation remains enforced in persistence operations. See [authentication](docs/auth.md).

Every setting accepts either `NAME` or `NAME_FILE`; files take precedence. `COMFY_API_KEY` is the common fallback, with optional independent `COMFY_ROUTER_API_KEY` and `COMFY_CLOUD_API_KEY`. Settings report readiness only. Container build inputs exclude local environment files, secrets, runtime data and generated artifacts.

## Migrations and verification

Ordered SQL migrations are applied transactionally on startup, with an applied-migration ledger and foreign-key validation. Keep historical migration files unchanged. Schema changes update the Prisma model and add the next SQL file, then regenerate the client. Run `bun run check` and build the Docker image before release.

Integration tests use real temporary SQLite databases and file stores. Provider responses are fixture-controlled; unmatched requests fail rather than reaching paid services. Tests cover ownership, idempotency, restart recovery, uncertain acceptance, cancellation, delayed projections, partial uploads, ETags/ranges, and WebSocket snapshots. Deployment smoke checks exercise the actual production server and Docker volume across restarts.

The existing UI identity and effect policy remain unchanged. The 60 fps requirement in [AGENTS.md](AGENTS.md) applies to browser interactions independently of the server runtime. Browser traces, rather than video frame rate alone, establish interaction performance.
