# ComfyUI developer capabilities

Verified **2026-10-16**. Sources: [developer overview](https://docs.comfy.org/development/overview), [developer documentation index](https://docs.comfy.org/_llms/en/developers.txt), and [custom-node entry point](https://docs.comfy.org/custom-nodes/intro).

ComfyUI is a modular generative-media engine. Developers can call it from an external application, host an execution environment, extend the engine and editor, distribute extensions, or automate it with CLI and agent tools.

| Need | Main capability | Detail |
| --- | --- | --- |
| Call a hosted model directly | Comfy Router | [Router](comfy-router.md) |
| Run a multi-node workflow from Python or TypeScript | Official SDKs and Comfy API v2 | [Workflow APIs](workflow-apis-and-sdks.md) |
| Package workflows, models, and nodes into an endpoint | Comfy API managed deployments | [Deployment](deployment.md) |
| Use an existing managed ComfyUI environment | Comfy Cloud | [Deployment](deployment.md) |
| Control your own GPU environment and server | Self-hosting and raw Server API | [Deployment](deployment.md), [workflow APIs](workflow-apis-and-sdks.md) |
| Add new processing or model support | Python custom nodes | [Custom nodes](custom-nodes.md) |
| Change the ComfyUI editing experience | JavaScript extensions | [Frontend extensions](frontend-extensions.md) |
| Share reusable, versioned node packages | Comfy Registry | [Publishing](registry-and-publishing.md) |
| Automate operations or connect an agent | Comfy CLI, MCP, and Comfy Agent | [Automation](cli-and-agent-tools.md) |

## Terminology

- **Comfy API deployment** is a managed execution environment; **Comfy API v2** is the workflow HTTP interface used by the SDKs.
- **Comfy Router** invokes individual hosted models. Workflow APIs execute graphs.
- **SDKs** call services from an external application. **Custom-node APIs** extend ComfyUI internally.
- **Comfy Cloud** is a managed environment; it is distinct from deploying your own packaged environment through Comfy API.

See [Running Workflows](https://docs.comfy.org/development/run-workflows/overview) for compatibility and [Getting an API Key](https://docs.comfy.org/development/api-development/getting-an-api-key) for platform credentials.

For this competition, the explicit platform requirement is Comfy API, Router, and/or SDK. The other capabilities can support the implementation, but should not be assumed to satisfy that requirement by themselves. See the [competition requirements](competition.md).
