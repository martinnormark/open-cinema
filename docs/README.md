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
- [Character sheets](character-sheets.md): the three-panel sheet, close portraits with and without a smile, states as sheets of their own, and how heads are removed from the full-body panels.
- [Camera moves, Object Swap and Restyle](revision-modes.md): the FLUX and LTX graphs on Comfy Cloud, their guardrails, check runs and limits.
- [Third-party IP](third-party-ip.md): every model and LoRA the app uses, its provider and licence, and what the no-borrowed-IP rule removed.
- [Reuse a performance](performance-transfer.md): the LTX 2.3 Union Control pose graph on Comfy Cloud, its limits and the live run.
- [Sequences](sequences.md): planning shots from an idea, keyframe and motion approval per shot, continuing from the last frame, playback and the shot list.
- [World bundles](world-bundles.md): saving Elements, recipes, a project's look and its sequences as one file, and bringing it into another studio.
- [Media library and uploads](library.md): upload path, limits, the picker and how other features use uploads as sources and references.
- [Phase 0: background replacement](phase0-background.md): evaluation results, supported envelope, turnaround, cost and the MVP release-bar call.
- [Background replacement job](background-job.md): the staged job (Kling edit, matte, foreground lock and conform as Comfy Cloud graphs), its variants, and how to check the graphs locally.
- [Router model catalog](comfy-router-catalog.md): every Router model and the inputs of those our workflows use.
