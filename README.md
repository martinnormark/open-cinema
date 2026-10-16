# Open Cinema

A creative studio for images, films, and reusable worlds. This Bun monorepo includes a local generation MVP: prompt input, durable job orchestration, live updates, and an activity Orb. Account authentication is not implemented yet. See [generation MVP](docs/generation-mvp.md) for setup, lifecycle details, and validation limits.

## Local development

Use **Bun 1.4.2** and **Node.js 24+**. Node is required by the development tools; production runs on Cloudflare Workers.

```sh
bun install --frozen-lockfile
bun run setup
bun run dev
```

Open the URL printed by Vite. The web Worker and jobs Worker run together, with local D1 and Durable Object bindings. No Cloudflare account is needed for local development. Generation needs Comfy Router API credentials and a local test session; see [setup](docs/generation-mvp.md#run-locally). Both Workers share the local state directory at `.wrangler/state`; remote bindings are disabled in Vite.

The UI includes a responsive shadcn sidebar, a Studio prompt form with five sample prompts, live Activity, and placeholder Projects, Elements, Recipes, Library, and Settings pages. The Studio introduction uses TanStack Start's experimental React Server Components path. Generation uses the Router model `bfl/flux-3-image`; the existing credential has been verified against its queued request API.

## Workspace layout

| Workspace            | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `apps/web`           | TanStack Start, Tailwind, shadcn, server functions, public HTTP routes           |
| `apps/jobs`          | Private Worker and SQLite-backed `GenerationCoordinator` Durable Object          |
| `packages/contracts` | Browser-safe runtime schemas, job states, event and RPC contracts                |
| `packages/database`  | Prisma client, schema, D1 migrations, queries, mutations, DO persistence helpers |
| `packages/assets`    | Server-only R2 archival and authenticated streaming delivery                     |
| `packages/comfy`     | Server-only adapter for the official TypeScript Comfy SDK                        |

Applications import shared packages through their declared exports. All database access lives in `packages/database`; Prisma delegates remain private. The web app must not import the Comfy adapter. Read [ARCHITECTURE.md](ARCHITECTURE.md), [GOALS.md](GOALS.md), and [PRODUCT.md](PRODUCT.md) before extending the scaffold.

## Commands

| Command                    | Effect                                                               |
| -------------------------- | -------------------------------------------------------------------- |
| `bun run setup`            | Generate Prisma/Worker types and apply local D1 migrations           |
| `bun run dev`              | Run both Workers with Vite and hot reload                            |
| `bun run typecheck`        | Regenerate types and check all workspaces                            |
| `bun run test`             | Run integration tests in `workerd` with isolated test storage        |
| `bun run build`            | Generate Prisma and build client, SSR/RSC, and jobs Worker artifacts |
| `bun run preview`          | Serve the production build locally                                   |
| `bun run build:jobs`       | Independently validate jobs Worker packaging with Wrangler dry run   |
| `bun run check`            | Type-check, test, and build                                          |
| `bun run db:migrate:local` | Apply committed migrations to local D1                               |
| `bun run format`           | Format scaffold code and configuration                               |
| `bun run format:check`     | Check formatting                                                     |

Generated Prisma code is ignored and recreated by setup/build/typecheck. Worker binding declarations and the router's generated route tree are checked in; regenerate them when bindings/routes change. The build currently emits upstream RSC source-map warnings, which do not prevent compilation.

## Database changes

Keep schema edits and migrations inside `packages/database`. Prisma CLI/client/adapter are pinned together at 7.10.1; the registry's Prisma 8 release candidate is deliberately not used.

To create the next migration, first apply existing migrations locally, edit `packages/database/prisma/schema.prisma`, and use the pinned `prisma migrate diff` tooling against the prior schema/local D1 state. Review the generated SQL, save it under the next ordered filename in `packages/database/migrations`, then run:

```sh
bun run db:generate
bun run db:migrate:local
bun run test
```

Do not use `prisma migrate deploy` for D1. Do not regenerate the initial migration from an empty database for an incremental change. Both Worker configurations reference the same migration directory; migration application is a single release step.

## Runtime boundaries

- The web Worker owns validation and signed local sessions. Public deployments fail closed until real authentication is configured.
- The private jobs Worker owns all Comfy SDK calls, durable submission, polling, cancellation, and output archival into R2.
- A per-owner Durable Object accepts idempotent commands, persists alarms/checkpoints, and broadcasts authoritative snapshots over hibernatable WebSockets.
- Database queries, mutations, migrations, and checkpoint/alarm operations live in `packages/database`.
- R2 stores generated bytes; each `JobOutput` stores its key, size, ETag, and content type. Ready means every output is saved. The web Worker serves authorized R2 streams without consulting Comfy.

See [generation MVP](docs/generation-mvp.md) for exact limits and recovery behavior.

## Deployment preparation

The all-zero D1 IDs in `apps/*/wrangler.jsonc` are **local placeholders**, not provisioned Cloudflare resources. Before deploying, provision a private R2 bucket for each environment, bind the same bucket to both Workers as `GENERATED_ASSETS`, and create the intended D1 database and set its actual ID in both configurations. Disable automatic expiry for completed R2 objects; configure cleanup of incomplete multipart uploads. Local R2 data shares the `.wrangler/state` directory with D1 and DO data. Configure distinct resources and secrets for preview/production; this scaffold does not deploy either environment automatically.

After applying the intended database migrations and building, deploy the jobs Worker before the web Worker. Vite emits their configurations to `apps/web/dist/open_cinema_jobs/wrangler.json` and `apps/web/dist/server/wrangler.json`. Use those generated configs for deployment so the RSC child environment and client assets are included. No remote resources were created by scaffolding.

## Remaining implementation work

- Replace local test sessions with account authentication before public deployment.
- Add provider-wide capacity, archival, and operator reconciliation for submissions without receipts.
- Add user-directed asset deletion, backup/recovery policy, and the creative authoring flows.
- Resolve Orb29's upstream non-commercial shader restriction before commercial use.
- Verify sustained 60 fps on representative devices with realistic media and live traffic.

[Generation implementation and verification notes](docs/generation-mvp.md) describe what is tested and what remains unverified. The earlier [scaffold report](docs/scaffold-verification.md) is historical.
