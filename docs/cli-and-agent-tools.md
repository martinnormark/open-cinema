# CLI and agent tools

Verified **2026-10-16**. Sources: [agent-tools overview](https://docs.comfy.org/agent-tools), [Comfy CLI](https://docs.comfy.org/comfy-cli/getting-started), and [Comfy MCP](https://docs.comfy.org/agent-tools/mcp).

## Comfy CLI

`comfy-cli` supports installing, launching, updating, and inspecting ComfyUI; managing nodes and models; calling hosted partner models; and running Cloud workflows. It supports local/cloud routing and use in scripts, batch jobs, and CI. Interactive setup uses browser sign-in; API keys support headless use. The `comfy generate` interface is marked beta. [CLI getting started](https://docs.comfy.org/comfy-cli/getting-started).

The Build and Deploy commands also package environments and operate managed endpoints. [Deployment quickstart](https://docs.comfy.org/development/serverless/quickstart).

- [CLI command reference](https://docs.comfy.org/comfy-cli/reference)
- [CLI troubleshooting](https://docs.comfy.org/comfy-cli/troubleshooting)

## Comfy MCP

MCP exposes Comfy capabilities to compatible AI agents, including media generation, model/node/template discovery, and workflow execution. Cloud and local connections are available; the local connection is open source. The hosted endpoint is `https://cloud.comfy.org/mcp`. [MCP setup and capabilities](https://docs.comfy.org/agent-tools/mcp).

Cloud runs against its supported environment and GPUs. A local connection operates against your own installation, files, models, and nodes. The agent-tools overview describes Cloud subscription requirements, while the more specific MCP page also advertises five trial runs for new users; consult that page for current access conditions. [Agent-tools comparison](https://docs.comfy.org/agent-tools), [MCP access](https://docs.comfy.org/agent-tools/mcp).

## Comfy Agent

The in-app assistant helps users understand, build, edit, and run workflows while viewing the canvas. The overview lists it as generally available on Cloud, with Desktop support coming soon as of this research date. [Comfy Agent documentation](https://docs.comfy.org/agent-tools/in-app-agent).

These tools can accelerate development and workflow authoring. The competition still requires an app built using Comfy API, Router, and/or SDK; see [competition details](competition.md).
