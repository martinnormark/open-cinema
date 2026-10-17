# Comfy competition and developer reference

Researched on **2026-10-16** from official Comfy sources. These files summarize the source material; they are not verbatim archives. Rules, availability, API behavior, and pricing can change, so follow the linked documentation before submitting or implementing.

## Competition

- [Open Source Higgsfield competition](competition.md): dates, prizes, eligibility, submission checklist, events, and source notes.
- [Our submission plan](competition-submission.md): prize targets, the two-minute demo script, and submission status.

## Developer capabilities

| Capability | Local reference | What it enables |
| --- | --- | --- |
| Platform overview | [Developer overview](developer-overview.md) | Choose an integration path |
| Workflow execution | [Workflow APIs and SDKs](workflow-apis-and-sdks.md) | Run graphs from an application and retrieve results |
| Hosted model access | [Comfy Router](comfy-router.md) | Invoke partner models through one API |
| Hosting and deployment | [Deployment](deployment.md) | Cloud, managed endpoints, or self-hosted execution |
| Backend extensions | [Custom nodes](custom-nodes.md) | Add Python processing and model integrations |
| Editor extensions | [Frontend extensions](frontend-extensions.md) | Add UI behavior, panels, commands, and widgets |
| Distribution | [Registry and publishing](registry-and-publishing.md) | Version and distribute reusable node packages |
| Automation and agents | [CLI and agent tools](cli-and-agent-tools.md) | Script operations or connect an AI agent |

Primary entry points: [developer documentation](https://docs.comfy.org/development/overview), [developer index](https://docs.comfy.org/_llms/en/developers.txt), and [full documentation index](https://docs.comfy.org/llms.txt).

## Project internals

- [Foundation](foundation.md): contracts, persistence, workflow dispatch, and how to add a workflow kind.
- [Media library and uploads](library.md): upload path, limits, the picker and how other features use uploads as sources and references.
- [Phase 0: background replacement](phase0-background.md): evaluation results, supported envelope, turnaround, cost and the MVP release-bar call.
- [Background replacement job](background-job.md): the staged job (Kling edit, matte, foreground lock and conform in a media container), its variants, and how to run the media container locally.
- [Router model catalog](comfy-router-catalog.md): every Router model and the inputs of those our workflows use.
