# Rebased Studio refinement — 2026-10-19

Rebased onto `a8be184` after upstream main advanced by 188 commits. The current dark design, Start page and `/studio` route, navigation, working Elements/Sequences/Library, mention-aware composer, image/video workflows, project direction, cost estimates, job rendering and original StudioOrb shader are preserved. The obsolete placeholder page remains deleted.

Carried forward: prompt suggestions and disclosure/icon motion, clear and character count, Ctrl/Command+Enter submission, session setup in the primary action position, accurate unconnected status, deferred shader initialization when unconnected or using reduced motion, and mobile activity placement in the header. The session and generation handlers retain the current workflow inputs and Element/project reloads.

Rebase validation:

- Full workspace type checking and production build passed.
- All 117 backend tests across 24 files and all 61 frontend tests passed.
- Production Studio inspected at 1440 × 1000 and 390 × 844. Prompt selection and focus, clear, image/video switching, camera choices, and mobile layout remain functional. No generation was submitted.
- Mobile disclosure trace: 154 sampled frame intervals, maximum 16.8 ms, zero intervals above 25 ms and zero dropped-frame events during the marked interaction window. No horizontal overflow.
- Axe found one existing best-practice issue in upstream `MentionTextarea`: `role="combobox"` on a textarea (`aria-allowed-role`). The shared mention component and its semantics are unchanged by this rebase. The earlier scaffold's clean accessibility report below does not apply to the newer mention component.
- Current artifacts are `artifacts/ui-design/rebased-desktop.png`, `rebased-mobile.png`, `rebased-main-final.webm`, `rebased-a11y.json`, `rebased-frames.json` and `rebased-trace.json`. The first rebase recording overloaded its encoder during concurrent integration tests; the final short recording was captured afterward.

The records below describe the original scaffold and its recordings, not the newer upstream visual identity. Full physical-device, loaded-media and live-generation performance remains unverified.

---

# Original scaffold verification — 2026-10-18

The existing light studio identity is preserved. The prompt composer now groups its input, tools, format, cost context and primary action. An unconnected browser can start its local session directly from that action; connecting preserves the prompt. Five existing sample prompts are selectable through a disclosure. Clear, character count, keyboard submission and visible focus support editing. Navigation identifies planned spaces, and Activity and placeholder pages explain their current state.

Mobile activity now sits in the sticky header so it cannot cover prompt suggestions. Unconnected and reduced-motion states use the existing static orb fallback without initializing WebGPU. Connected sessions retain the shader orb. A missing session no longer remains indefinitely in a syncing state.

## Motion

The transitions-dev accordion and icon-swap recipes live in `apps/web/src/motion.css`, including their reduced-motion guards. React event handlers drive their state. The closed disclosure is inert. A scoped override removes blur after mobile traces exposed GPU filter setup stalls. The reversible height, opacity and icon-scale transitions remain.

## Validation

- Web TypeScript check, production build, changed-file Prettier checks and `git diff --check` passed.
- Rendered at 1440 × 1000, 820 × 1180 and 390 × 844 in Chromium through agent-browser. No horizontal overflow at the checked intermediate and mobile sizes.
- Verified prompt selection/focus, session connection with prompt preservation, enabled generation after connection, navigation, mobile drawer and keyboard disclosure activation. No paid generation request was submitted.
- Axe reported zero violations for desktop, mobile and reduced-motion checks. This is automated coverage, not a full accessibility certification.
- Reduced-motion mode reports a zero-second disclosure transition. Components introduce no direct `useEffect`.

## Performance evidence

Measurements use the local production build, without video recording during the final traces. Each interaction window contains 12 disclosure toggles spaced 320 ms apart. Chrome traces accompany requestAnimationFrame samples; video frame rate alone is not used as performance evidence.

| Check | Sampled intervals | Median | Maximum | Dropped-frame trace events during interaction |
| --- | ---: | ---: | ---: | ---: |
| Desktop, before the additional blur removal | 230 | 16.7 ms | 16.8 ms | 0 |
| Mobile, final rebuilt production CSS | 230 | 16.7 ms | 16.8 ms | 0 |

The earlier mobile trace showed GPU-thread stalls and dropped frames when blur began. Removing blur eliminated those stalls in the repeated test. Desktop layout and paint events in the measured interaction window peaked at 0.252 ms and 0.162 ms respectively. A trace-start renderer task outside the desktop interaction window is excluded from the interaction result.

These bounded local checks do not establish the full release requirement. Representative physical devices, other browsers, large media libraries, active generation updates, populated success/error output galleries and sustained connected-shader performance remain unverified.

## Artifacts

Artifacts are local and ignored by Git under `artifacts/ui-design/`:

- `before.webm`: baseline walkthrough, cursor visible, 60 fps capture.
- `after-final.webm`: final walkthrough, cursor visible, 60 fps capture.
- `before-desktop.png`, `before-mobile.png`, `after-desktop.png`, `after-mobile.png`, `after-tablet.png`: rendered inspections.
- `desktop-trace-final.json`, `mobile-trace-production.json`: Chrome performance traces.
- `desktop-frames.json`, `mobile-frames-production.json`: interval samples summarized above.
- `a11y-desktop.json`, `a11y-mobile-final.json`, `a11y-reduced-motion.json`: accessibility reports.

The system FFmpeg installation had a missing x265 dependency. Capture used an already available standalone FFmpeg from `/private/tmp/open-cinema-capture/node_modules/ffmpeg-static/`; no system package was changed.
