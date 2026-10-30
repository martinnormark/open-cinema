# Deployment and hosting

Verified **2026-10-16**. Primary source: [Deploying ComfyUI](https://docs.comfy.org/development/deploy/overview).

## Available paths

| Path | What Comfy offers | What the developer manages |
| --- | --- | --- |
| Comfy Cloud | Managed ComfyUI environment, browser editor, and SDK execution | Workflow and inputs; no separate Build/deployment creation |
| Comfy API deployment | Packaged environment running as a managed, autoscaling endpoint | Build contents, release, compute/region selection, worker bounds |
| Self-hosted ComfyUI | Engine and server runnable on owned hardware, rented GPUs, or containers | Infrastructure, models, node dependencies, access, and operations |

All three run API-format workflows. Official SDKs can target all three, with API Proxy added for self-hosting. [Deployment comparison](https://docs.comfy.org/development/deploy/overview).

## Managed Comfy API endpoints

A Build packages the local environment's models, custom nodes, and pinned dependencies. The CLI supports initializing and pushing a Build, producing a Linux/NVIDIA release, choosing deployment compute and region, and running workflows against the endpoint. Desktop snapshots and workflow JSON are alternative starting points through the Build Wizard. [Comfy API quickstart](https://docs.comfy.org/development/serverless/quickstart).

- [Build sources](https://docs.comfy.org/development/serverless/build-sources)
- [Deployment lifecycle, scaling, billing, and troubleshooting](https://docs.comfy.org/development/serverless/overview)

## Comfy Cloud

SDK access requires a paid Cloud subscription, API key, and API-format workflow. Its managed environment is available without creating a separate Build. Check the current concurrency and credit limits. [Cloud quickstart](https://docs.comfy.org/development/deploy/cloud), [usage and limits](https://docs.comfy.org/development/deploy/cloud-usage).

## Self-hosting

Run locally, on GPU providers such as Runpod/Vast.ai, or in community containers. ComfyUI does not provide an official Docker image according to the current guide. The raw server has no authentication by default; protect remote access. Use either its native REST/WebSocket API or API Proxy for SDK/v2 access. [Self-hosting options](https://docs.comfy.org/development/deploy/self-hosting).

- [Server startup flags](https://docs.comfy.org/development/comfyui-server/startup-flags)
- [API Proxy](https://docs.comfy.org/development/comfyui-server/api-proxy)
- [Workflow clients](workflow-apis-and-sdks.md)
