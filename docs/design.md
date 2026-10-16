# Open Cinema design system

The studio is a screening room: calm, dark and quiet so the creator's images and films carry all of the colour. The interface is an Operate surface, so ambition shows as precision and restraint rather than decoration. Tokens live in [`apps/web/src/styles.css`](../apps/web/src/styles.css); components in [`apps/web/src/components/ui`](../apps/web/src/components/ui) are adapted shadcn/ui primitives that read those tokens.

## Principles

- **The work is the brightest thing on screen.** Surfaces are warm graphite, close to neutral (OKLCH hue 70, chroma ≤ 0.007), so they do not tint judgement of a generated image.
- **One accent, used as a signal.** Tungsten (`--tungsten`) marks focus, live and in-progress state, selection and the brand mark. Never use it for large fills or decoration. Primary actions are bone white, not tungsten.
- **Dark only, on purpose.** Creators review footage in dim rooms for long sessions. `color-scheme: dark` themes native controls and scrollbars. A light theme is not planned; add one by redefining the `:root` tokens, never by hard-coding colours in components.

## Colour tokens

| Token                               | Use                                                           |
| ----------------------------------- | ------------------------------------------------------------- |
| `background`                        | App canvas                                                    |
| `sidebar`                           | Navigation rail                                               |
| `surface` (`card`)                  | Panels, cards, empty frames                                   |
| `elevated` (`popover`)              | Menus, dialogs, floating Orb                                  |
| `secondary`/`muted`                 | Quiet fills, tab lists, tracks                                |
| `accent`                            | Hover and highlighted rows (shadcn semantics)                 |
| `border`, `input`                   | Hairlines; `input` is a step brighter for form controls       |
| `foreground`                        | Primary text (bone white)                                     |
| `muted-foreground`                  | Secondary text; ≥ 4.5:1 on every surface                      |
| `subtle-foreground`                 | Icons and decoration only, not body text                      |
| `primary`                           | Main action fill (bone), with `primary-foreground` text       |
| `tungsten`                          | Focus ring, live state, progress, selection, brand mark       |
| `success`, `warning`, `destructive` | Job and validation states. Pair with text, never colour alone |

Use them through Tailwind utilities (`bg-surface`, `text-muted-foreground`, `ring-ring`, `bg-tungsten`). Badges have `success`, `warning` and `destructive` variants; alerts have `warning` and `destructive`.

## Type

Inter Variable with optical sizing, self-hosted through `@fontsource-variable/inter`, with `cv11` (single-storey a) and `ss03` features. One family carries everything. Fixed rem steps, ratio about 1.2:

| Role          | Size / weight                                  |
| ------------- | ---------------------------------------------- |
| Page title    | 1.75rem, 600, tracking -0.025em (`PageHeader`) |
| Section title | 1.125rem–1rem, 500                             |
| Body          | 0.9375rem–0.875rem, 400, leading 1.6           |
| Meta          | 0.75rem, `text-muted-foreground`               |

Use the `tabular` class for costs, durations, seeds, percentages and anything that updates live. Monospace (`font-mono`) is for keys, paths and identifiers only.

## Shape and depth

Radii: 6px controls, 12px cards and dialogs (`rounded-xl`), full pills only for small chips and the Orb. Declare elevation once: either a border (panels) or a soft offset shadow (floating layers), not both at full strength.

## Empty states

Every empty surface uses [`EmptyState`](../apps/web/src/components/empty-state.tsx): a 2.39:1 frame with crop marks, the place the work will appear. It always names what will live there and offers one next step. [`PageHeader`](../apps/web/src/components/page-header.tsx) gives pages a consistent title block with optional actions.

## Motion

Motion tokens follow the transitions.dev scale (`--duration-*`, `--ease-smooth-out`) and are matched by purpose, not nearest number:

- Dialogs, menus and selects open in `--duration-fast` (250ms) and close in `--duration-quick` (150ms); dialogs scale from 0.96, menus from 0.97.
- The mobile sidebar sheet opens in `--duration-slow` and closes in `--duration-medium`.
- Progress fills move with `transform` only, so live job updates stay on the compositor.
- `prefers-reduced-motion: reduce` removes animation and transition globally; state must still read from text.

All motion is subject to the 60 fps requirement in [AGENTS.md](../AGENTS.md).

## Browser surfaces

Selection is tungsten at 35% opacity, the caret is tungsten, scrollbars are thin `input`-coloured, links underline with a 0.2em offset, and focus rings use `--ring`. Theme new native surfaces the same way rather than leaving browser defaults.
