# Open Cinema — Product Context

<!-- impeccable:product-schema 1 -->

Confirmed on 2026-10-16 from [GOALS.md](GOALS.md) and [ARCHITECTURE.md](ARCHITECTURE.md). This record summarizes durable product context; GOALS.md contains the full vision and ARCHITECTURE.md owns implementation decisions. The repository currently contains planning and research documents, not an implemented application. Capabilities below describe the intended product, not shipped functionality.

## Platform

web

## Stack

The agreed target is a strict TypeScript monorepo using Bun workspaces, TanStack Start with React and TanStack Router, Tailwind CSS, and shadcn/ui. Cloudflare Workers host the application; Durable Objects coordinate generation and stream job updates over WebSockets. Cloudflare D1 and Prisma provide application persistence through a dedicated database package. The official Comfy TypeScript SDK connects to external GPU workflow execution. Bun is the development toolchain, not the production runtime.

These choices are established, but the application is not scaffolded. Runtime and dependency compatibility gates remain in ARCHITECTURE.md.

## Users

Filmmakers, visual storytellers, designers, and artists who want to develop ideas and direct images and video without becoming generation-infrastructure experts. The initial complete journey serves an individual creator. Creative attention is scarce: core tasks must not require learning workflow graphs, node wiring, or model configuration.

## Product Purpose

Give an individual creative the continuity and control of a production studio with the immediacy of expressing an idea. Help creators turn ideas into useful images, films, and reusable worlds, retaining the decisions that make subsequent work coherent.

The north-star outcome is creators repeatedly completing work they choose to keep using Elements they have already established. Success includes a first saved result, meaningful Element and recipe reuse, recognizable continuity across views and states, coherent shot sequences, and selective revisions that preserve approved work.

## Positioning

Open Cinema is an open creative studio grounded in ComfyUI's workflow ecosystem. Its intended differentiator is a persistent creative world: named Elements, curated reference sheets, saved states, reusable recipes, and project direction that carry across image and video generation. Natural creative direction and `@` mentions connect that world to suitable workflows behind the scenes.

Continuity and selective revision must be demonstrated through supported workflows; they are product goals, not proven performance claims.

## Operating Context

The creative loop is: express an idea → explore directions → choose what works → save reusable Elements and creative recipes → direct and refine images and videos.

Creators can start from text, uploaded images or videos, or an existing Element. Exploration is provisional; saving references is an intentional approval decision. The first complete journey is one creator authoring a Character, a Location, and a Thing, curating their reference sheets, mentioning them together, exploring saved states, and producing related images and a short video with recognizable continuity.

Images and video belong to one directing workflow. A still can establish a look or become a shot; discoveries in video can become references. Creators should compare alternatives, revise shot plans, and approve results while retaining authorship.

Generation is asynchronous and must continue across navigation, closed tabs, and disconnected sockets. Creators need understandable cost and time expectations, useful progress, actionable failure recovery, and access to their prior results and inputs.

## Capabilities and Constraints

- **Elements:** named reusable entities with identity, curated reference sheets, and optional states. Foundational types are Characters, Locations, and Things; Things include props, vehicles, clothing, and products. `@` mentions carry selected identity and references, not merely a name inserted into a prompt.
- **Reference authoring:** guidance depends on Element type. Creators approve consistent views and details and can identify missing or contradictory references.
- **Identity, state, and portrayal:** keep these separate. A temporary shot direction must not silently change an Element, approved references, or project defaults. Project direction carries a shared visual treatment across shots with deliberate overrides.
- **Creative building blocks:** named LoRA adapters and other capabilities should explain their contribution, influence, and compatibility. Saved recipes retain useful combinations of direction, references, workflows, and adapters. Supported controls must produce a visible, tested difference.
- **Initial model focus:** Flux for images and LTX for video. Model independence is a longer-term goal; additional support must earn its place through proven creative outcomes and preserve the conceptual Element library.
- **Selective revision:** video background replacement and whole-character replacement are explicit early priorities for uploaded and generated footage. Preserve performance, timing, camera movement, and everything outside the intended change; keep originals available for comparison, branching, and reversal. Prove replacement quality and preservation separately, including moving cameras, multiple people, and occlusion.
- **Durable creative history:** preserve input and Element versions, references, recipes, project direction, shot overrides, capabilities, workflows, models, settings, and revision sources. Reproducibility means retaining creative context; exact pixel replay is not guaranteed.
- **Job activity:** the agreed application shell includes a floating shadercn Orb29 indicator opening the activity panel. Its state aggregates all active jobs for the authenticated user. Connection health, unresolved jobs, and synchronization status must remain distinguishable from idle or completed work.
- **Openness:** publicly runnable and extensible is the intended direction. Creators should retain access to their media and reusable assets. No specific licensing, pricing, or production deployment claim is established here.
- **Initial exclusions:** a general-purpose node editor, comprehensive film-editing suite, and marketplace are outside the initial focus. Quality of the complete creative journey takes priority over breadth of presets, effects, or models.

### Open decisions and implementation gates

- Authentication and session implementation, provider-wide capacity, and the selected Comfy hosting target need resolution.
- Application-owned long-term media storage, retention, and delivery policy remain undecided; database records hold metadata, not media bytes.
- Validate the selected TanStack server-component/Vite/Cloudflare and Prisma/D1 combinations and Comfy SDK execution in the Workers runtime before treating scaffolding as complete.
- Generation continuity, performance reuse, shot extension, and selective replacement require representative workflow demonstrations before being exposed as reliable capabilities.

## Brand Commitments

The product name is **Open Cinema**. Use the established vocabulary: Elements, Characters, Locations, Things, states, reference sheets, creative recipes, and project direction. Keep creator-facing language about ideas, taste, direction, and outcomes; technical controls should become available as needed without becoming prerequisites.

No visual identity, palette, typography, or additional voice rules were selected during initialization.

## Evidence on Hand

- [GOALS.md](GOALS.md): agreed audience, creative loop, product priorities, terminology, and success criteria.
- [ARCHITECTURE.md](ARCHITECTURE.md): selected technology, target package boundaries, execution lifecycle, reliability requirements, accessibility requirements for job activity, and unresolved implementation gates.
- [docs/README.md](docs/README.md) and linked local research: Comfy developer capabilities and competition context, researched on 2026-10-16. Verify changing external details before implementation or submission.

The repository has no implemented application, verified generation demonstrations, customer testimonials, benchmarks, or shipped product imagery. Do not invent these. The intended decisive demonstration is a short film with recognizable Elements across shots, followed by background replacement and character recasting that preserve the remaining approved work. Competition participation is an opportunity to demonstrate the product, not its enduring purpose.

## Product Principles

1. Preserve creative attention: make intent and recognizable visual concepts the primary interface.
2. Make useful work compound: every successful session should strengthen the creator's reusable world.
3. Keep approval deliberate: separate experiments, identity, state, and project direction; make revisions inspectable and reversible.
4. Earn creative control through evidence: prove continuity, preservation, and the effects of supported controls before expanding breadth.
5. Make progress durable: retain provenance, communicate execution honestly, and recover without losing approved work or duplicating generation.

## Accessibility & Inclusion

Job activity must provide accessible text, respect reduced motion, and remain usable when shader rendering is unavailable. Do not communicate job state through animation alone. Broader product-specific accessibility requirements or a conformance standard have not yet been established.
