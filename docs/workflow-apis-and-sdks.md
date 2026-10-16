# Workflow APIs and SDKs

Verified **2026-10-16**.

## Official clients

Comfy provides Python `comfy-sdk` and TypeScript `@comfyorg/sdk` packages. Their workflow clients handle inputs/assets, graph submission, job monitoring, live progress/previews, and output retrieval. These support external creative apps, integrations, and batch pipelines. [SDK documentation](https://docs.comfy.org/development/api-development/sdks).

The same packages also expose Router clients, but these call a different service. In TypeScript, lowercase `comfy.models` is the Router interface; the `Comfy` class is the workflow client. Workflow-job and Router-request retry contracts differ, so consult the corresponding guide before implementing retries. [SDK surface comparison](https://docs.comfy.org/development/api-development/sdks).

## API choices

| Interface | Targets | Protocol and role |
| --- | --- | --- |
| Comfy API v2 + SDKs | Managed Comfy API deployments, Cloud, self-hosted with API Proxy | Versioned workflow execution; REST and SSE |
| Raw ComfyUI Server API | Self-hosted ComfyUI | REST and WebSocket; queue, node information, execution, and local control |
| Legacy v1 Cloud API | Comfy Cloud | Deprecated; relevant to existing integrations |

The official guidance favors v2 for new integrations. Raw Server API compatibility is not guaranteed across releases. Self-hosted SDK access requires the additional API Proxy. [Compatibility matrix](https://docs.comfy.org/development/run-workflows/overview).

## Workflow format

Export an executable graph with **File → Export Workflow (API)**. Normal editor-save JSON contains layout and editing metadata and is a different format. API JSON identifies nodes, their types, inputs, and connections. Retain an editor-save copy when you also want a convenient editable canvas. [Workflow API format](https://docs.comfy.org/development/api-development/workflow-api-format).

## References

- [First workflow quickstart](https://docs.comfy.org/development/api-development/quickstart)
- [API v2 reference](https://docs.comfy.org/api-reference/v2/overview)
- [Self-hosted API Proxy](https://docs.comfy.org/development/comfyui-server/api-proxy)
- [Raw Server API overview](https://docs.comfy.org/development/comfyui-server/comms_overview)
- [HTTP routes](https://docs.comfy.org/development/comfyui-server/comms_routes) and [WebSocket messages](https://docs.comfy.org/development/comfyui-server/comms_messages)
- [Server API examples](https://docs.comfy.org/development/comfyui-server/api-examples)
- [Workflow metadata](https://docs.comfy.org/development/api-development/workflow-metadata)
