# Repository guidance

Applies throughout the repository. Start here, then read the task-specific references below; do not load every guide for every task.

## Current system

Open Cinema runs in **one Docker container with Bun**, serving the TanStack Start app and persistent job coordinators. SQLite catalogs/checkpoints and private media live on the `/data` volume. Run one process per volume. Cloudflare Workers, D1, R2 and Durable Objects are no longer the deployment architecture; older research may still describe them.

Comfy Router and Comfy Cloud provide external GPU execution through `@open-cinema/comfy` (`packages/comfy`). `apps/jobs` is an in-process server library, not a separate Worker. App hosting and Comfy workflow endpoint deployment are separate tasks.

## Read for your task

| Task                                                 | Read first                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Product behavior, scope or terminology               | [GOALS.md](GOALS.md), [PRODUCT.md](PRODUCT.md)                                                              |
| Runtime, package boundaries, persistence or jobs     | [ARCHITECTURE.md](ARCHITECTURE.md)                                                                          |
| Local setup and commands                             | [README.md](README.md#local-development)                                                                    |
| Docker, secrets, public hosting, backups or upgrades | [Deployment](docs/deployment.md), [authentication](docs/auth.md), [.env.example](.env.example)              |
| Comfy requests, graphs or workflow exports           | [Workflows](workflows/README.md), [`packages/comfy/src/workflows`](packages/comfy/src/workflows)            |
| Character sheets and reference generation            | [Character sheets](docs/character-sheets.md), [reference graphs](workflows/cloud/character-sheet/README.md) |
| UI implementation, review or browser automation      | [UI development rules](docs/ui-development.md); for UI work also [DESIGN.md](DESIGN.md)                     |
| Other feature details or provider research           | [Documentation index](docs/README.md), then the relevant guide                                              |

Current code and architecture take precedence over historical implementation notes. Product goals and exported graphs alone are not evidence of working or deployed capabilities.

## Implementation boundaries

- Keep authentication and authorization in `apps/web`, orchestration/retries in `apps/jobs`, database access in `packages/database`, private file storage in `packages/assets`, and configuration/auth transport in `packages/runtime`. Keep `packages/contracts` browser-safe. See architecture before crossing boundaries.
- Keep provider secrets server-only and runtime-configured (`NAME` or `NAME_FILE`), never in `VITE_*` variables or image build arguments. The app must start without Comfy credentials; generation requires the relevant key.
- Preserve persisted receipts, idempotency and restart recovery. Archive output bytes before success; uncertain provider acceptance must not cause a second paid submission. Keep historical SQL migrations unchanged; add a migration and regenerate Prisma for schema changes.
- React components must never import or call `useEffect`, including aliases. Read the [no-use-effect skill](.agents/skills/no-use-effect/SKILL.md) for any React work; reusable synchronization hooks have only its narrow exception.
- UI work must preserve design tokens, the Impeccable hook, reduced-motion/accessibility support and **sustained 60 fps**. Follow the linked UI guide's required skills and production performance-trace verification; report blocked measurements honestly.

## Comfy workflows

`packages/comfy/src/workflows` owns Router request builders and Cloud graphs; it does not own persistence or retry policy. Edit builders, then run `bun scripts/export-workflows.ts` to regenerate `workflows/cloud/` JSON and its manifest. Never hand-edit generated JSON. Character sheets now run as Cloud graphs, including face masking; see the reference-graph guide before changing that path.

Check exports with `bun scripts/export-workflows.ts --check`. For graph changes, use `bun scripts/validate-workflows.ts` against the target node catalogue (Cloud by default; accepts a local URL or saved catalogue). Catalogue validation queues nothing and does not prove output quality; inspect representative results for capability claims.

Only when packaging a dedicated API endpoint on `platform.comfy.org`, install/update `comfy-cli` with `pip install -U comfy-cli`, then read `comfy skills show comfy-build` and `comfy skills show comfy-deploy`. Follow them to pin/package the environment in `comfy-build.yaml`, validate, release and deploy; load additional skills they reference as needed. Existing graphs/build files do not establish a deployed endpoint. Normal Router/Cloud execution needs no new endpoint.

## Verification

Use the root [package scripts](package.json): `bun run check` type-checks, tests and builds; `bun run format:check` checks formatting. Run checks appropriate to the change and the full checks before release. For deployment changes, also build the Docker image and run `bun scripts/docker-smoke.ts <image-tag>` as described in the deployment guide. The smoke check uses fixtures and submits no paid generation. UI changes additionally require the UI guide's rendered and performance verification.
