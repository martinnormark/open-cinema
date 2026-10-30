# Scaffold verification

> Deployment update (2026-10-30): the application now runs entirely in Docker with Bun, SQLite and private file storage. Infrastructure references and earlier verification results below describe the previous implementation. Use [deployment](deployment.md) and [architecture](../ARCHITECTURE.md) for current setup.

Verified locally on 2026-10-17. These checks establish a runnable foundation, not production readiness or complete creative workflows.

## Build and runtime

- Frozen Bun installation succeeds with Bun 1.4.2 and Node 24.19.0.
- Setup generates Prisma and Worker types and applies the initial migration to local D1.
- Strict TypeScript checks pass across all five workspaces.
- The production build includes browser assets, TanStack SSR and experimental RSC, and the auxiliary jobs Worker. The Studio introduction renders through RSC in the production preview.
- Independent Wrangler packaging of the jobs Worker passes with `--dry-run`. No remote deployment or resource provisioning was performed.
- Eight integration tests pass in `workerd`: private Worker routing, coordinator ownership, expired subscription rejection, WebSocket snapshot delivery, aggregate Orb state, protocol validation, SDK construction, and Prisma/D1 ownership isolation.
- Formatting checks pass. No direct `useEffect` or `useLayoutEffect` occurs in application source. Client bundle inspection finds no Prisma client, Comfy credential binding, or Cloudflare runtime imports.

## Browser verification

The production preview was exercised in local headless Chrome at 1440×1000 and 390×844:

- Studio, Projects, Elements, Recipes, Library, Activity, and Settings routes render successfully and are reachable through the sidebar.
- Mobile navigation opens in the shadcn drawer, selects a route, and dismisses. Escape closes the drawer. Reduced-motion emulation disables its animation.
- Automated accessibility checking found duplicate main landmarks in the initial shell. The sidebar inset was changed to a layout `div`; the subsequent mobile Elements check reported zero violations and zero incomplete checks.
- No JavaScript errors were reported by the browser during these checks.
- The health endpoint returns 200, unknown pages return 404, non-upgrade stream requests return 426, invalid origins return 403, and same-origin upgrades without a session return 401.

Screenshots, cursor-visible recordings, and Chrome traces are saved in the ignored `artifacts/scaffold/` directory. The system FFmpeg could not start because a library was missing; capture used a temporary FFmpeg binary outside the repository.

## Performance limits

Desktop and mobile traces were inspected for task durations and frame events. They contain dropped-frame events, and the headless environment reports a failed macOS display-link initialization. Cursor recording also adds rendering overhead. These traces do **not** establish sustained 60 fps; they must not be treated as a release pass.

Desktop sidebar layout changes are immediate, and the mobile drawer uses transform/opacity animation with reduced-motion support. Physical-device profiling with realistic media, large libraries, and live generation updates remains required. Those workloads do not exist in the scaffold yet.

## Integration limits

The Comfy SDK loads and constructs in `workerd`, but real submission, event consumption, cancellation, and asset retrieval against a selected hosting target remain unverified. Authentication fails closed, and no generation endpoint accepts jobs. The durable scheduler, projection synchronization, browser subscription store, and Orb integration remain follow-up work, as listed in the root README.
