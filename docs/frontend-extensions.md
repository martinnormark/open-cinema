# JavaScript frontend extensions

Verified **2026-10-16**. Primary source: [JavaScript extension guide](https://docs.comfy.org/custom-nodes/js/javascript_overview).

Extend the ComfyUI editor with UI features and behavior. A node package exposes a JavaScript directory through `WEB_DIRECTORY`; JavaScript files register a uniquely named extension with `app.registerExtension` and implement supported hooks.

This is useful for tools inside ComfyUI. An independent web app instead calls the [workflow APIs or SDKs](workflow-apis-and-sdks.md).

## Extension surfaces

| Surface | Official documentation |
| --- | --- |
| Lifecycle and node hooks | [JavaScript hooks](https://docs.comfy.org/custom-nodes/js/javascript_hooks) |
| Frontend objects and widgets | [Comfy objects](https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking) |
| User preferences | [Settings API](https://docs.comfy.org/custom-nodes/js/javascript_settings) |
| Prompts and confirmations | [Dialog API](https://docs.comfy.org/custom-nodes/js/javascript_dialog) |
| Notifications | [Toast API](https://docs.comfy.org/custom-nodes/js/javascript_toast) |
| Custom panels | [Sidebar tabs](https://docs.comfy.org/custom-nodes/js/javascript_sidebar_tabs), [bottom-panel tabs](https://docs.comfy.org/custom-nodes/js/javascript_bottom_panel_tabs) |
| Actions and shortcuts | [Commands and keybindings](https://docs.comfy.org/custom-nodes/js/javascript_commands_keybindings) |
| Menus and selection actions | [Topbar menus](https://docs.comfy.org/custom-nodes/js/javascript_topbar_menu), [selection toolbox](https://docs.comfy.org/custom-nodes/js/javascript_selection_toolbox) |
| Reusable graph groups | [Subgraph integration](https://docs.comfy.org/custom-nodes/js/subgraphs) |
| Localization | [Custom-node i18n](https://docs.comfy.org/custom-nodes/i18n) |

See the [annotated examples](https://docs.comfy.org/custom-nodes/js/javascript_examples) and [context-menu migration guide](https://docs.comfy.org/custom-nodes/js/context-menu-migration) for implementation patterns and updates to older extensions.
