---
name: Open Cinema
description: Build a world once. Direct every shot.
colors:
  brand-tungsten: "#f2a945"
  brand-ink: "#2a1c08"
  brand-bone: "#f1ece2"
  brand-graphite: "#151311"
  background: "oklch(0.155 0.004 70)"
  sidebar: "oklch(0.172 0.004 70)"
  surface: "oklch(0.19 0.005 70)"
  elevated: "oklch(0.225 0.006 70)"
  secondary: "oklch(0.245 0.006 70)"
  hover: "oklch(0.27 0.007 70)"
  border: "oklch(0.29 0.006 70)"
  input: "oklch(0.34 0.007 70)"
  foreground: "{colors.brand-bone}"
  muted-foreground: "oklch(0.72 0.012 80)"
  subtle-foreground: "oklch(0.6 0.01 80)"
  primary: "{colors.brand-bone}"
  primary-foreground: "oklch(0.17 0.004 70)"
  tungsten: "{colors.brand-tungsten}"
  tungsten-foreground: "{colors.brand-ink}"
  destructive: "oklch(0.7 0.17 28)"
  success: "oklch(0.77 0.13 155)"
  warning: "oklch(0.82 0.13 80)"
  letterbox: "oklch(0 0 0)"
  scrim: "{colors.brand-graphite}"
  on-media: "{colors.brand-bone}"
typography:
  wordmark:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.02em (interface) / -0.055em (display)"
    fontFeature: "normal"
  display:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "clamp(2.25rem, 4vw + 1rem, 3.5rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  section:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
  body:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    fontFeature: "'cv11' 1, 'ss03' 1"
  label:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  caption:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: "1rem"
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  mark: "25%"
  pill: "999px"
spacing:
  unit: "0.25rem"
  page-x: "1.5rem / 3rem (md)"
  page-y: "2.5rem / 3.5rem (md)"
  page-max: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "2.25rem"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
  media-caption:
    backgroundColor: "{colors.scrim}"
    textColor: "{colors.on-media}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
  end-card:
    backgroundColor: "{colors.tungsten}"
    textColor: "{colors.tungsten-foreground}"
    typography: "{typography.display}"
    rounded: "{rounded.2xl}"
  end-card-action:
    backgroundColor: "{colors.tungsten-foreground}"
    textColor: "{colors.tungsten}"
    rounded: "{rounded.pill}"
---

# Design System: Open Cinema

This file is the source of truth for how Open Cinema looks and moves. The tokens above are normative; the CSS that implements them is [`apps/web/src/styles.css`](apps/web/src/styles.css), and [`apps/web/test/design-tokens.test.ts`](apps/web/test/design-tokens.test.ts) fails when the two disagree or when a component hard-codes a colour, shadow or type size. Change a token here and in `styles.css` together, in the same commit.

The identity comes from the feature showcase film (`showcase/hyperframes-project` in the project files): the lit-frame mark, the heavy Inter wordmark, tungsten on graphite, and beat-driven, exponential motion. The four `brand-*` colours are the film's hex values exactly.

## Overview

**Creative North Star: "The Screening Room"**

The studio is a screening room: calm, dark and quiet, so the creator's images and films carry all of the colour. One lamp is lit. Tungsten marks what is live, focused or chosen, and the brand itself; everything else is warm graphite and bone. The interface is an Operate surface, so ambition shows as precision and restraint rather than decoration. The brand gets loud only where the reel ends: the end card, and the not-found page that borrows it.

**Key characteristics:**

- Dark only, on purpose. Creators review footage in dim rooms for long sessions.
- The work is the brightest thing on screen.
- One accent, used as a signal.
- One family, Inter, from 0.6875rem captions to a 900-weight wordmark.
- Exponential ease-out arrivals, quicker exits, and nothing that makes the creator wait.

## Colors

Warm graphite surfaces close to neutral (OKLCH hue 70, chroma ≤ 0.007) so they never tint judgement of a generated image, bone type, and a single tungsten lamp.

### Brand primitives

- **Tungsten** (`#f2a945`): the lamp. The mark's tile, focus rings, live and in-progress state, progress fills, selection, the caret, and the end-card flood.
- **Lamp Ink** (`#2a1c08`): type and shapes on tungsten. The mark's letterbox bar, text on a tungsten fill, the end card's words and its pill.
- **Bone** (`#f1ece2`): primary type and the primary action fill. Also type laid over footage.
- **Graphite** (`#151311`): the film's ground. In the app it is the scrim behind captions and controls laid over a picture.

Components never use the primitives directly; they use the roles below, which alias them.

### Neutral (surfaces, darkest to lightest)

`background` (app canvas and the top bar) → `sidebar` (the navigation sheet on phones and tablets) → `surface` (`card`: panels, cards, empty frames) → `elevated` (`popover`: menus, dialogs, the floating Orb) → `secondary`/`muted` (quiet fills, tab lists, tracks) → `hover` (`accent`: hover and highlighted rows) → `border`, `input` (hairlines; `input` is a step brighter for form controls).

### Type colours

- `foreground` (bone): primary text.
- `muted-foreground`: secondary text, at least 4.5:1 on every surface.
- `subtle-foreground`: icons and decoration only, not body text.

### Signals

- `primary` / `primary-foreground`: main action, a bone fill with near-black text. Primary actions are bone, not tungsten.
- `tungsten` / `tungsten-foreground`: see Tungsten and Lamp Ink above.
- `success`, `warning`, `destructive`: job and validation states. Always paired with text, never colour alone.

### Over footage

- `letterbox` (true black): behind a frame, so letterboxing and pillarboxing read as the picture's own edge.
- `scrim` (graphite): captions, counters and pins laid on a picture, at 85% (`bg-scrim/85`), as in the film's caption pill.
- `on-media` (bone): text and handles on top of a picture.

### Named rules

**The One Lamp Rule.** Tungsten is the only accent. It never fills a large area inside the studio, and it never decorates. The one exception is the end card (below).

**The Work Is Brightest Rule.** No surface, gradient or glow may compete with the creator's pictures. New colour comes from their media, not from the chrome.

**The No Literals Rule.** Components never contain a colour literal (hex, `rgb()`, `oklch()`, `black`, `white`) or a Tailwind palette colour (`bg-black`, `text-amber-400`). Use the role tokens through Tailwind (`bg-surface`, `text-muted-foreground`, `bg-scrim/85`, `ring-ring`) or `var(--token)` in CSS. Pixels that are data rather than UI (a canvas mask, a shader uniform, a `<meta>` value) carry a `design-token-exempt: reason` comment on the same line.

## Typography

**Family:** Inter Variable with optical sizing, self-hosted through `@fontsource-variable/inter`. One family carries everything.

**Character:** text uses `cv11` (single-storey a) and `ss03`; the wordmark turns features off to keep the film's two-storey a.

### Hierarchy

- **Wordmark** (900, line-height 1): "Open Cinema", only in the lockup. Tracking -0.02em at interface sizes, -0.055em at display sizes (the film's value; the one place tighter than -0.04em is allowed).
- **Display** (`text-display` / `.end-card-title`, 800, clamp 2.25–3.5rem, -0.035em): brand moments only. Never in the working studio.
- **Title** (`text-title`, 600, 1.75rem, -0.025em): page titles (`PageHeader`).
- **Section** (`text-lg`/`text-base`, 500): section titles.
- **Body** (`text-body`, 0.9375rem, leading 1.5rem; `text-sm` for dense lists): running text. Keep measure under about 70ch.
- **Label** (`text-label`, 0.8125rem): chips, compact controls and code in forms.
- **Caption** (`text-caption`, 0.6875rem): counters, badges and captions over media.
- **Meta** (`text-xs`): timestamps and secondary detail, in `text-muted-foreground`.

Use the `tabular` class for costs, durations, seeds, percentages and anything that updates live. Monospace (`font-mono`) is for keys, paths and identifiers only. Arbitrary sizes (`text-[13px]`) and tracking (`tracking-[…]`) are not allowed; add a token here first if the scale truly lacks a step.

## Layout

A sticky 3.5rem top bar on the canvas colour, with page content below in a centred column of at most 72rem (`max-w-6xl`; task pages use 80rem, `max-w-7xl`), padded 1.5rem on phones and 3rem from `md`. Spacing is Tailwind's 0.25rem unit; group tightly inside a component and separate generously between groups, with more space above a heading than below it.

### The top bar

`AppTopBar` groups the workspace into three stable areas using shadcn dropdown menus: **Create** (Studio, Sequences, Recipes), **Revise** (all take changes), and **World** (Elements, Library, Projects, Move your world). Settings stays a labelled link. Do not add generic More menus or expose individual revision tools as top-level navigation.

The current area stays lit with the existing tungsten underline on all its child routes. The selected destination has a filled row and tungsten icon inside its menu. A persistent location row below the header shows area → page, including World → Move your world and Revise → the selected task. This context remains visible on mobile when the main navigation folds into a grouped shadcn Sheet below `md`. The Sheet uses the same destinations and highlights only the actual selected page.

On Start below `lg`, a labelled shadcn Select replaces the long goal list so the selected task and take chooser are visible together. Desktop retains the full explanatory list.

### Task pages

Each take goal has a page (`/revisions/new?kind=…`) that opens with a hero: the goal's icon in tungsten and its title (`text-title`, the page's `h1`), its promise in one sentence, what it keeps, and the goal done on real footage as a 16:9 loop on `bg-letterbox` with a scrim caption. The mode lives in the address, so the top bar, the hero and the studio's "What changes" stay in step; changing it swaps the hero in place (texts reveal, one stagger apart) and keeps the chosen take.

## Elevation & Depth

Depth is tonal first: each surface step is a little lighter. Declare elevation once: either a border (panels) or a soft offset shadow (floating layers), not both at full strength.

- **Raised** (`shadow-raised`, `0 1px 2px` at 30% black): a selected segment in a segmented control.
- **Floating** (`shadow-floating`, `0 8px 24px -8px` at 60% black): the Orb, menus and popovers.
- **On media** (`shadow-on-media`, `0 1px 8px` at 45% black): pins, handles and thumbs laid on footage.
- **Edge** (`shadow-edge`, a 1px 35% black hairline): thin lines over footage, such as the compare divider.

## Shapes

Radii: 6px (`rounded-md`) for controls, 12px (`rounded-xl`) for cards, frames and dialogs, 16px (`rounded-2xl`) for the end card, full pills only for small chips, the Orb and the end-card action. Empty surfaces are 2.39:1 frames with crop marks (`EmptyState`).

### The mark

A lit frame with letterbox bars: a square tile with 25% corner radius, and a bar inset 15% from each side and 35% from top and bottom, with a 5% radius. Two tones only:

- **Lamp** (default): tungsten tile, ink bar. On graphite and every app surface. This is the favicon.
- **Ink**: ink tile, tungsten bar. On a tungsten flood.

### The lockup

Mark plus wordmark, from the film: the mark is 0.83em tall and sits 0.22em from the word, both scaled from the font size. Use [`BrandLockup`](apps/web/src/components/brand-mark.tsx) and size it with a text utility; never rebuild it by hand. Bone wordmark on dark, ink wordmark on tungsten.

Assets: `apps/web/public/favicon.svg` (and `favicon.png`, `apple-touch-icon.png`), `apps/web/public/brand/mark-lamp.svg`, `mark-ink.svg`, `lockup-on-dark.png` and `lockup-on-tungsten.png` for README, social and slides.

## Components

- **Buttons:** adapted shadcn/ui. Primary is a bone fill; secondary, outline and ghost stay graphite. Focus uses `--ring` (tungsten at 70%).
- **Cards and panels:** `bg-surface`, `rounded-xl`, a hairline border and no shadow.
- **Empty states:** [`EmptyState`](apps/web/src/components/empty-state.tsx), a 2.39:1 frame with crop marks that names what will live there and offers one next step. [`PageHeader`](apps/web/src/components/page-header.tsx) gives pages a consistent title block.
- **Captions over media:** `bg-scrim/85 text-on-media text-caption`, `rounded-md` (the film's caption pill).
- **Job state:** `.job-status` with a dot that repeats the word, never replaces it; live state breathes in tungsten, progress fills move by `transform`.
- **End card:** the film's closing frame (`.end-card` in `styles.css`): a tungsten flood with the ink mark, display type in ink, secondary text tinted from the ink (never grey), and an ink pill action with tungsten type. Used where the reel runs out (the not-found page). Not for errors, which stay quiet in `EmptyState`, and never inside the working studio.
- **Real work on screen:** task pages show the creator's own take, not sample footage; where the studio is empty the front page offers the Tide Mill starter world ([`starter-world.ts`](apps/web/src/features/start/starter-world.ts)). Use media the studio actually made; never stock.

### Motion

Two registers, both tokens in `styles.css`:

- **Interface** (transitions.dev scale, `--duration-*`, `--ease-smooth-out`), matched by purpose, not nearest number. Dialogs, menus and selects open in `--duration-fast` (250ms) and close in `--duration-quick` (150ms); dialogs scale from 0.96, menus from 0.97. The navigation sheet opens in `--duration-slow` and closes in `--duration-medium`; the top bar's lamp glides in `--duration-fast`. A chosen option in a list moves as one sliding fill. Pictures still loading resolve in with `img-reveal`; cached pictures never wait.
- **Brand** (from the film): arrivals on `--ease-expo-out` with a short blur-to-sharp resolve, the mark landing on `--ease-back-out` from scale 0.2 and -20°, exits faster than entrances on `--ease-exit`, and choreography on the film's beat, `--duration-beat` (469ms, 128 BPM). Brand motion is for brand moments only: the end card, and any future splash or reveal. One authored moment per screen.

Every animation is `transform`, `opacity`, `filter` or `clip-path`, and is subject to the 60 fps requirement in [AGENTS.md](AGENTS.md). `prefers-reduced-motion: reduce` removes animation and transition globally; state must still read from text.

### Browser surfaces

Selection is tungsten at 35%, the caret is tungsten, scrollbars are thin and `input`-coloured, links underline with a 0.2em offset, and focus rings use `--ring`. Theme new native surfaces the same way rather than leaving browser defaults.

## Do's and Don'ts

**Do**

- Reach for a role token (`bg-surface`, `text-muted-foreground`, `bg-scrim/85`) before writing any colour, and add a token here plus in `styles.css` when none fits.
- Use `BrandLockup` and `BrandMark` for every appearance of the logo.
- Keep tungsten for focus, live state, progress, selection and the mark.
- Put footage on `bg-letterbox` and anything laid over footage on the scrim.
- Run `bun run --cwd apps/web test` after styling work; the token test is part of it.

**Don't**

- Don't hard-code colours, Tailwind palette colours, arbitrary type sizes or tracking in components.
- Don't use tungsten for large fills, gradients, glows or decoration inside the studio, or for a primary button.
- Don't recolour, stretch, outline, add effects to or re-proportion the mark, or set the wordmark in another weight or face.
- Don't add a light theme by overriding colours in components; redefine the `:root` tokens.
- Don't use brand motion (overshoot, flood, beat choreography) on routine interface interactions, and never delay access to a ready result to finish an animation.
- Don't add eyebrows or kicker labels above headings; the heading carries its own weight.
