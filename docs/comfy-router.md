# Comfy Router: hosted model calls

Verified **2026-10-16**. Sources: [Router quickstart](https://docs.comfy.org/development/comfy-router/quickstart) and [API overview](https://docs.comfy.org/development/comfy-router/api).

Router gives applications one API entry point for hosted partner models at `https://api.comfy.org`. Use the official Python/TypeScript SDKs or direct HTTP. It is useful when an app needs a model invocation without constructing and deploying a ComfyUI workflow graph.

## Main capabilities

- Discover models and inspect individual catalog entries.
- Retrieve each model's input/output schema.
- Invoke a model synchronously through `POST /v2/models/{provider}/{model}`.
- Submit longer jobs to a queue, poll status, retrieve results, and request cancellation.
- Inspect pricing, billing, retry behavior, and request limits.

The routing and authentication pattern is shared, but model payloads and results retain their model-specific shapes. Do not assume every model accepts the same prompt, image, or video fields. [API overview](https://docs.comfy.org/development/comfy-router/api).

Router normally charges per request from workspace credits and does not require a subscription. Keep credentials in a server or local environment. Consult the live catalog for available models and prices. [Quickstart](https://docs.comfy.org/development/comfy-router/quickstart).

## References

- [Model discovery](https://docs.comfy.org/development/comfy-router/discover-models)
- [Schemas and results](https://docs.comfy.org/development/comfy-router/schemas)
- [Queued execution](https://docs.comfy.org/development/comfy-router/queue)
- [Errors and retries](https://docs.comfy.org/development/comfy-router/errors)
- [Model catalog](https://docs.comfy.org/development/comfy-router/models)
- [Pricing](https://docs.comfy.org/development/comfy-router/pricing) and [billing](https://docs.comfy.org/development/comfy-router/billing)
- [Capabilities and limits](https://docs.comfy.org/development/comfy-router/limitations)
- [Full API reference](https://docs.comfy.org/development/comfy-router/reference)

Competition relevance: Router is explicitly accepted as a platform integration. Partner-model calls conflict with the additional Open Weights Only restriction; see [competition details](competition.md).
