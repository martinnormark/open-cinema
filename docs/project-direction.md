# Project direction, combined states and recipes

This covers roadmap issues #8 and #9 (Phase 2 of #2): a persistent look per project with per-shot overrides, richer Element states, and recipes that keep direction worth reusing.

## Direction

- **Project look.** Palette, lighting, lens, texture, pacing and free notes. It is edited on the project page and stored in `Project.look`.
- **Shot direction.** Framing, focus and performance, chosen per shot in the studio under "Direct this shot". A shot can also override any look field for itself; overrides are tinted and counted ("1 changed"), and the project is never changed from the studio.
- **Snapshot.** Each request carries `inputs.direction` (`directionSnapshotSchema`): the project and its look as of submission, the overrides, the shot choices and the recipe used. On submit, the server re-reads the project look from D1 and checks the project belongs to the caller (`apps/web/src/server/direction.ts`). Shots already made keep the look they were made with, and the project's Shots grid flags "Made with an earlier look".
- **Prompting.** `withDirection` appends camera language after the creator's words: the shot's phrases first, then the look's. Pacing only applies to video. Background replacement keeps only palette, lighting and texture, because framing and lens belong to the source take. Recast adds none. Camera moves (LTX-2 camera LoRA) carry direction too.
- **Video wording.** LTX draws the camera it is told about, so lens and film-stock presets carry a separate `video` phrase that describes the picture ("wide-angle perspective", "fine film grain") without naming lenses, millimetres, halation or vignetting. `LTX_FRAME_ARTEFACT` lists the words to keep out and `apps/web/test/direction.test.ts` checks every preset against it; the Cloud LTX graphs also add "vignette, dark corners, circular frame, keyhole mask, fisheye" to their negative prompt. Router's LTX takes no negative prompt. A creator's own words are passed through as written.
- **Revisions.** `submitRevision` stamps the same snapshot, so direction is kept across generation and revisions.

## States and combinations

- Each state has a kind: emotion, wardrobe, condition, weather, time of day, season, era, in use, or other.
- One state per kind can be combined in a mention, up to three: `@Cal:wet+frightened`. Two conditions clash and the composer says so. `other` never clashes.
- References: approved references for any of the combined states are used, and the first state that claims a view keeps it. State descriptions are joined into the expanded prompt ("Cal (…; wet, frightened: soaked hair…; wide eyes…)").
- How much of an Element's description goes into the prompt depends on how much the model can see. FLUX without references and LTX text-to-video get the full description. FLUX with references and LTX from a first frame get only the state wording. Everything else gets the name.

## Recipes

- A recipe has a template with `{slot}` placeholders (Character, Location or Thing), optional `[groups]` that drop out when their slot is empty, a look, shot choices, a frame or length, building blocks and notes.
- Personal recipes live in the D1 `Recipe` table. Changing the spec or name bumps the version and moves the previous one to `history` (newest first, at most 20) with the creator's "what changed" note. Restoring saves the old version as a new one. Updates check the version, so two tabs cannot overwrite each other.
- **Save as recipe** under any finished shot (project Shots grid or studio results) turns its prompt into a template: each mentioned Element becomes a slot and the shot's effective look and direction are kept. The result becomes the recipe's cover.
- **Built-in examples** (`apps/web/src/features/recipes/collection.ts`) each show the treatment on one subject plus alternatives on the same subject. "Make it my own" copies one into your recipes.
- **Applying** a recipe means choosing Elements for its slots, with their states. You also choose whether to use the recipe's look or the project's. Compatibility notes say what is missing, which building blocks are not in the studio yet, and how each Element will be carried (references or description only). Generate submits directly; Open in studio hands the prompt and direction to the studio.
- **Building blocks** (`packages/contracts/src/capabilities.ts`) name each model, adapter and technique with its purpose, influence, media, what it reads and its limits. Only Lightricks' own LTX adapters are listed; per the competition rule, no community LoRA is used.

## Tested differences (live, 2026-10-17)

Made with `scripts/recipe-examples.ts` through Comfy Router. The images ship in `apps/web/public/recipes/`; logs and the first video attempts are kept under `artifacts/recipe-examples/`.

| Comparison                                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framing: `shot-wide` vs `shot-close-up` (same fisherman prompt)                           | Clearly different. The wide shot shows the full figure and the harbour; the close-up shows head and hands.                                                                                                                                                                                                                                                                                             |
| Focus: `shot-deep` vs `shot-shallow`                                                      | Visible. Deep focus keeps the boats sharp; shallow blurs them behind him.                                                                                                                                                                                                                                                                                                                              |
| Palette and lighting: the window-light, rain-noir, hero-object and landscape alternatives | Each alternative reads as its label: low-key black and white, golden hour, teal and orange, blue hour, pastel. Without references the face drifts between alternatives (rain noir changes the man); the portrait held.                                                                                                                                                                                 |
| Combined states plus direction in the app                                                 | `@Cal:wet+frightened … at @Harbour`, close-up, deep focus, blue-hour override on the Saltwater look: wet hair and oilskin, frightened expression, blue dusk, Cal's face from his one approved portrait.                                                                                                                                                                                                |
| Lens and texture on LTX 2.5 Fast                                                          | The first three video runs added a round, keyhole-shaped lens mask. Two-second reruns of the Arrival prompt without the lens phrase, and without the film phrase, were both clean; the mask came from naming the camera hardware ("shot on a 24mm lens" with "35mm film grain and halation"). Video now gets phrases that describe the picture instead (see below), and the rerun with them was clean. |

Spend: about 19 FLUX images (about 5–6 credits each) and 3 four-second LTX 2.5 Fast clips (about 109 credits each), roughly 430 credits in all.

## Not done

- Production-build performance traces. A dev-build trace of rapid alternative switching on a recipe page shows no main-thread task over 10 ms apart from the profiler's own start-up (`artifacts/phase2/trace-recipe-alternatives.json`).
- LTX Pose Control, Union Control and Detailer are listed but not offered in recipes. Union Control runs in performance transfer, which has no composer yet.

## Idea: a custom IC-LoRA

Router's LTX is text-only, so a Character's face cannot carry into text-to-video. Training our own LTX IC-LoRA on a project's approved Element references and look would fix that, and the weights would be our own IP under the competition rule. For example, condition on a reference sheet and generate the Character in motion. A smaller first step would be a project-look LoRA trained on the shots a creator approves.
