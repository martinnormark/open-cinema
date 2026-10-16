# Registry, packaging, and publishing

Verified **2026-10-16**. Sources: [Registry overview](https://docs.comfy.org/registry/overview) and [publishing guide](https://docs.comfy.org/registry/publishing).

The Comfy Registry distributes custom-node packages through ComfyUI-Manager. Developers can publish releases, manage semantic versions, deprecate versions, and track package metrics. Published versions are immutable, and package identifiers are globally unique. [Registry overview](https://docs.comfy.org/registry/overview).

## Publishing workflow

1. Create a Registry account and publisher identity.
2. Generate a publisher API key.
3. Initialize package metadata with `comfy node init` and fill in `pyproject.toml`.
4. Declare the package's identity, version, license, dependencies, repository, and publisher.
5. Publish using `comfy node publish` or the documented GitHub Actions workflow.

Use `.comfyignore` to omit tracked development assets from the distribution. Follow the packaging specification for explicit inclusions. These are reference steps; no package has been published by this documentation task. [Publishing guide](https://docs.comfy.org/registry/publishing).

## Additional distribution capabilities

- [Package metadata specification](https://docs.comfy.org/registry/specifications)
- [Quality and security standards](https://docs.comfy.org/registry/standards)
- [Custom-node CI/CD](https://docs.comfy.org/registry/cicd)
- [Node help pages](https://docs.comfy.org/custom-nodes/help_page)
- [Bundled example workflows](https://docs.comfy.org/custom-nodes/workflow_templates)
- [Reusable subgraph blueprints](https://docs.comfy.org/custom-nodes/subgraph_blueprints)
- [Registry API](https://docs.comfy.org/registry/api-reference/overview)

Registry publishing is an optional distribution path for a competition project. It does not replace the required GitHub repository, license, workflows, or local setup instructions in the [competition checklist](competition.md).
