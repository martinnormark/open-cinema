# Repository guidance

These instructions apply throughout the repository. Read [GOALS.md](GOALS.md), [PRODUCT.md](PRODUCT.md), and [ARCHITECTURE.md](ARCHITECTURE.md) for product direction and implementation context.

## Comfy workflow API deployment

When workflows need to be packaged and deployed as APIs on `platform.comfy.org`, use `comfy-cli` and read its current bundled skills:

```sh
pip install -U comfy-cli
comfy skills show comfy-build
comfy skills show comfy-deploy
```

Follow `comfy-build` to package the local ComfyUI environment, models, custom nodes, and dependency pins into `comfy-build.yaml`, validate it, and cut a release. Follow `comfy-deploy` to run a deployable release as a serverless endpoint. Read the additional authoring, pinning, and failure skills when those guides call for them. This is the procedure to use when deployment is needed; it does not establish that a build or endpoint already exists.

## UI quality: 60 fps is non-negotiable

The UI must feel butter smooth. Sustained 60 fps during interaction and animation is a release requirement, not a polish task to defer. At 60 Hz, the total frame budget is approximately 16.7 ms, including JavaScript, layout, paint, and compositing.

- Keep typing, scrolling, dragging, resizing, navigation, transitions, and video comparison controls responsive, including while generation jobs report progress.
- Prefer compositor-friendly motion using transforms and opacity. Avoid unnecessary renders, layout thrashing, and expensive work on the main thread. Profile blur, large animated surfaces, and layout animations before accepting them.
- Keep motion purposeful, interruptible, and responsive to rapid input. Do not delay an action or access to a ready result just to finish an animation.
- Respect `prefers-reduced-motion` while preserving clear feedback, keyboard operation, and focus behavior.
- Verify affected interactions in a production build on representative supported devices and viewport sizes, with realistic media, library sizes, and live updates. Use browser performance traces to assess frame timing and dropped frames; visual inspection alone does not establish 60 fps.
- Fix performance regressions before considering UI work complete. If measurement is blocked, report what remains unverified rather than claiming the requirement passed. This UI frame-rate requirement is independent of source or generated video's frame rate.

## React: no direct `useEffect`

Apply the [no-use-effect skill](.agents/skills/no-use-effect/SKILL.md) whenever writing, editing, or reviewing React code. Components must never import or call `useEffect`, including through aliases or `React.useEffect`.

Follow [React's “You Might Not Need an Effect” guidance](https://react.dev/learn/you-might-not-need-an-effect):

- Derive values from props and state during render; use `useMemo` for expensive pure calculations when warranted.
- Put user-triggered work in event handlers.
- Use framework data-loading facilities or a data-fetching library for server data.
- Use `useSyncExternalStore` for external store subscriptions and keys for intentional state resets.
- Use callback refs for DOM attachment and cleanup; use `useMountEffect` only for genuine mount-time synchronization with an external system.

The skill's narrow exception permits direct `useEffect` only inside reusable custom hooks that genuinely require external synchronization. Do not hide derived state, event logic, or effect chains inside a wrapper to evade the rule. Such hooks must clean up correctly and tolerate remounting. Do not substitute `useLayoutEffect` or ref guards merely to bypass the ban.

The component-level ban is a repository policy stricter than React's general guidance. Where a skill example uses a direct effect in a component, adapt it to this policy.

## Design identity: follow DESIGN.md

[DESIGN.md](DESIGN.md) is the source of truth for the Open Cinema identity: the mark and lockup, colour roles, type scale, radii, shadows and motion. Read it before any UI work and do not drift from it.

- Use tokens only. Never hard-code a colour, Tailwind palette colour (`bg-black`, `text-amber-400`), arbitrary type size or tracking in a component; use the role tokens (`bg-surface`, `text-muted-foreground`, `bg-scrim/85`, `text-title`) or `var(--token)` in CSS.
- Use `BrandLockup` and `BrandMark` from `apps/web/src/components/brand-mark.tsx` wherever the logo appears.
- A new token goes into DESIGN.md's frontmatter and `apps/web/src/styles.css` in the same change. `apps/web/test/design-tokens.test.ts` fails on drift between the two and on off-token values in components; do not weaken it or add exemptions for UI colour.

## Required design and motion skills

For UI work, read and apply the relevant local skills before implementation:

| Work                                                     | Required skill                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Designing, building, reviewing, or refining an interface | [Impeccable](.agents/skills/impeccable/SKILL.md)                               |
| Adding interaction motion or transitions                 | [Transitions dev](.agents/skills/transitions-dev/SKILL.md)                     |
| Reviewing and refining existing motion                   | [Transitions polish](.agents/skills/transitions-polish/SKILL.md)               |
| Deliberate AI-generated UI reveal experiences            | [Transitions UI generation](.agents/skills/transitions-ui-generation/SKILL.md) |

Use Impeccable for hierarchy, layout, typography, accessibility, responsive behavior, and rendered verification. Use the transition skills for appropriate motion patterns and consistent timing, easing, and other motion tokens. Match tokens to the interaction's purpose rather than the nearest numeric value.

The Impeccable design hook is already applied. Preserve it and address relevant findings; do not disable it or suppress findings to make a change pass. The hook complements reading the skill and inspecting the rendered result.

Choose motion that supports the creative task. Generation reveals are for appropriate moments, not every list item or navigation. All skill-provided patterns remain subject to the 60 fps requirement, reduced-motion support, and the React effect policy above.

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

### Screenshots and video recordings

Use a visible cursor and human-like pointer movement for screenshots and recorded walkthroughs:

- Start or restart recordings with `--cursor`. For UI motion reviews, also use `--fps 60`.
- Use `--human` on `click`, `drag`, and `mouse move` actions during capture and when preparing a screenshot. These are interaction flags; do not append `--human` to `record` or `screenshot`.
- Take screenshots while a `--cursor` recording is active so they include its cursor overlay. For a screenshot-only task, use a short temporary recording around the capture; `--cursor` is a recording option, not a screenshot option.
- Refresh snapshot refs after page changes, position the cursor deliberately, and capture the intended state. Always stop recording to flush the video and remove the overlay.

Example after opening the target page and ensuring the output directory exists:

```sh
agent-browser record start ./artifacts/walkthrough.webm --cursor --fps 60
agent-browser snapshot -i
agent-browser click @e1 --human
agent-browser snapshot -i
agent-browser mouse move 600 400 --human
agent-browser screenshot ./artifacts/result.png
agent-browser record stop
```

Use refs and pointer coordinates appropriate to the current page. Recording requires `ffmpeg`; use `agent-browser doctor` to diagnose capture prerequisites. A 60 fps video file does not prove the UI rendered 60 distinct frames per second; retain the performance-trace requirement above.

References: [video recording](https://agent-browser.dev/recording) and [pointer commands](https://agent-browser.dev/commands).
