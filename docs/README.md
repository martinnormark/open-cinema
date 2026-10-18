# Comfy competition and developer reference

Researched on **2026-10-16** from official Comfy sources. These files summarize the source material; they are not verbatim archives. Rules, availability, API behavior, and pricing can change, so follow the linked documentation before submitting or implementing.

## Competition

- [Open Source Higgsfield competition](competition.md): dates, prizes, eligibility, submission checklist, events, and source notes.
- [Our submission plan](competition-submission.md): prize targets, the two-minute demo script, and submission status.

## Developer capabilities

| Capability             | Local reference                                       | What it enables                                     |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| Platform overview      | [Developer overview](developer-overview.md)           | Choose an integration path                          |
| Workflow execution     | [Workflow APIs and SDKs](workflow-apis-and-sdks.md)   | Run graphs from an application and retrieve results |
| Hosted model access    | [Comfy Router](comfy-router.md)                       | Invoke partner models through one API               |
| Hosting and deployment | [Deployment](deployment.md)                           | Cloud, managed endpoints, or self-hosted execution  |
| Backend extensions     | [Custom nodes](custom-nodes.md)                       | Add Python processing and model integrations        |
| Editor extensions      | [Frontend extensions](frontend-extensions.md)         | Add UI behavior, panels, commands, and widgets      |
| Distribution           | [Registry and publishing](registry-and-publishing.md) | Version and distribute reusable node packages       |
| Automation and agents  | [CLI and agent tools](cli-and-agent-tools.md)         | Script operations or connect an AI agent            |

Primary entry points: [developer documentation](https://docs.comfy.org/development/overview), [developer index](https://docs.comfy.org/_llms/en/developers.txt), and [full documentation index](https://docs.comfy.org/llms.txt).

## Project internals

- [Foundation](foundation.md): contracts, persistence, workflow dispatch, and how to add a workflow kind.
- [Generation MVP](generation-mvp.md): the first image pipeline, its job lifecycle, consistency rules and local verification.
- [Sign-in and public deployment](auth.md): the `AUTH_MODE` options and how to put a deployment behind Cloudflare Access.
- [Design system](design.md): tokens, typography, colour and motion rules for the studio.
- [Project direction, combined states and recipes](project-direction.md): the project look, per-shot direction, state kinds and recipes.
- [Elements: the default path](elements.md): the anchor-first next step shared by Characters, Locations and Things, the defaults the app decides, Thing turnarounds, and which references a mention sends.
- [Character sheets](character-sheets.md): the three-panel sheet, close portraits with and without a smile, states as sheets of their own, and how heads are removed from the full-body panels.
- [Character recast on LTX 2.5](recast-ltx.md): an all-Lightricks open-weights recast graph, its live comparison with Kling, and the proposal for our own recast IC-LoRA.
- [Character recast on MiniMax H3](recast-minimax-h3.md): H3 Reference to Video as a recast engine for the MiniMax H3 prize, measured against Kling on the two real takes.
- [Camera moves, Object Swap, Restyle and re-staging](revision-modes.md): the FLUX and LTX graphs on Comfy Cloud, their guardrails, check runs and limits.
- [Effects on a real take, built on LTX](vfx-ltx.md): the LTX VFX survey, the three effects (clear the set, add water, day for night), the graph, check runs and limits; our VFX-with-LTX entry.
- [Third-party IP](third-party-ip.md): every model and LoRA the app uses, its provider and licence, and what the no-borrowed-IP rule removed.
- [Re-stage IC-LoRA](restage-ic-lora.md): the plan for training our own re-staging adapter on LTX 2.3: data, trainer, compute and reach.
- [Location reference IC-LoRA](location-reference-ic-lora.md): the plan for our own LTX adapter that takes a Location's moving reference, so reference shots can leave Kling: data, pilot, trainer and cost.
- [Recasting and relocating a moving scene](moving-scenes.md): the app's Kling recast, Seedance 2.5 relocation and Wan Animate on a fast-moving street take, and what the app lacks.
- [Known limitations](known-limitations.md): capabilities deferred because they are not good enough yet, starting with character performance transfer and replacement.
- [Reuse a performance](performance-transfer.md): the LTX 2.3 Union Control pose graph on Comfy Cloud, its limits and the live run.
- [Location references and reference shots](location-references.md): empty-location moves as a Location's primary reference, the checklist that prefers them, and text-to-video from references with the staging in words.
- [Sequences](sequences.md): planning shots from an idea, keyframe and motion approval per shot, continuing from the last frame, playback and the shot list.
- [World bundles](world-bundles.md): saving Elements, recipes, a project's look and its sequences as one file, and bringing it into another studio.
- [Media library and uploads](library.md): upload path, limits, the picker and how other features use uploads as sources and references.
- [Phase 0: background replacement](phase0-background.md): evaluation results, supported envelope, turnaround, cost and the MVP release-bar call.
- [Phase 0: character recast](phase0-recast.md): evaluation of Kling recasting against the shared rubric.
- [Background replacement job](background-job.md): the staged job (Kling edit, matte, foreground lock and conform as Comfy Cloud graphs), its variants, and how to check the graphs locally.
- [Router model catalog](comfy-router-catalog.md): every Router model and the inputs of those our workflows use.
- [Comfy capabilities](comfy-capabilities.md): a historical record of the first Router checks for image and short video (2026-10-16).
- [Scaffold verification](scaffold-verification.md): the checks run on the initial scaffold (2026-10-17).
