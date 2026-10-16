# Python custom nodes and backend extensions

Verified **2026-10-16**. Sources: [custom-node introduction](https://docs.comfy.org/custom-nodes/intro) and [architecture](https://docs.comfy.org/custom-nodes/overview).

Custom nodes add reusable operations to ComfyUI: model integrations, preprocessing, transformations, utilities, or application-specific logic. Python nodes declare inputs and outputs and implement the work performed when a graph executes.

The architecture distinguishes server-only nodes, client-only extensions, independent client/server additions, and tightly connected client/server additions. The architecture guide warns that nodes requiring direct UI/server interaction are incompatible with API execution. This matters when packaging a workflow for an external app. [Node types and API compatibility](https://docs.comfy.org/custom-nodes/overview).

## Main backend facilities

- [Node properties](https://docs.comfy.org/custom-nodes/backend/server_overview): inputs, outputs, execution, and validation in the legacy V1 schema.
- [Loading and registration](https://docs.comfy.org/custom-nodes/backend/lifecycle).
- [Datatypes](https://docs.comfy.org/custom-nodes/backend/datatypes), including [images, masks, and latents](https://docs.comfy.org/custom-nodes/backend/images_and_masks).
- [Hidden and flexible inputs](https://docs.comfy.org/custom-nodes/backend/more_on_inputs).
- [Lazy evaluation](https://docs.comfy.org/custom-nodes/backend/lazy_evaluation), [node expansion](https://docs.comfy.org/custom-nodes/backend/expansion), and [list processing](https://docs.comfy.org/custom-nodes/backend/lists).

## V1 and V3

The docs include both legacy V1 nodes and the newer V3 schema. V3 uses schema objects, `io.ComfyNode`, a class-level `execute` method, and a `ComfyExtension` entry point. The migration guide says future node-feature extensions target V3; it also describes `comfy_api.latest` as under development. Verify the supported API version before choosing imports. [V3 migration guide](https://docs.comfy.org/custom-nodes/v3_migration).

Start with the [node walkthrough](https://docs.comfy.org/custom-nodes/walkthrough). For UI additions, see [frontend extensions](frontend-extensions.md); for distribution, see [Registry and publishing](registry-and-publishing.md).
