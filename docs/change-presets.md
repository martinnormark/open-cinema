# Change presets

Tested starting points for each way of changing a take, offered in the revision studio under **Start from a preset**. Recorded on 2026-10-24.

## Where they come from

Scenario's [ALTER exploration](https://www.scenario.com/explorations/alter/) changes one eight-second take eleven ways (a product swap, three outfits, two recasts, snow and night, anime, claymation) and ships the method as a free Claude skill, `scenario-alter` (MIT). Its core is 36 presets in `references/presets.json`, grouped by use (Products and props, Wardrobe and look, Cast and character, World and time, Restyle, Ads and repurposing) across three modes:

| ALTER mode      | Keeps                          | Changes                              | Our modes                                              |
| --------------- | ------------------------------ | ------------------------------------ | ------------------------------------------------------ |
| Swap            | everything as shot             | one element: product, prop, outfit   | Swap an object (a Thing), Fix an area (painted)        |
| Motion transfer | the performance and the camera | who performs it, or where it happens | Recast, Copy the moves, Replace background, Add effect |
| Restyle         | motion and composition         | the whole rendering                  | Restyle                                                |

Each ALTER preset is a fill-in-the-gaps change line (`{object}`, `{colour}`, `{place}`) placed between a mode's fixed opening ("Edit @video1. Keep absolutely everything…") and a fixed close ("No text, no letters, no logos"). Every one ran on Seedance 2.5 edit mode through the Scenario MCP, drafted at 480p and checked against the source before finalising.

**Scenario's API is not a source.** Scenario does expose workflows ("apps") in its API (`/v1/workflows`, workflow search with `public=true`) and MCP, but every call needs a Scenario key, and ALTER's presets are not workflows there: they live only in the skill's ZIP. So the catalogue here is our own, adapted from the MIT preset file where a preset fits a mode we run, plus a few of ours (Recast in new clothes, Empty the set, Vertical for social).

## How a preset works here

A preset is content, not a workflow. It runs on its mode's existing Comfy graph (`replacementKinds[kind].workflowKind`), and our server already writes each mode's opening and close, so a preset supplies only ALTER's middle: the change line. Choosing one fills the studio's own fields: the words, the effect (Night, Rain, Empty the set), the wardrobe choice (Recast) or the aspect (Vertical). One or two short gaps take the creator's words; a gap left empty uses its example, so a preset runs before anything is typed. The words stay editable; once edited, the gaps fold away with an offer to restore the preset's words.

Two rules carried over from ALTER's testing:

- **Restyles name the background as art** ("the background, the harbour, is hand-painted anime background art"). ALTER found a restyle that only described the people drew the people and left sea and sky photographic.
- **A swap never guesses the object.** SAM 3.1 looks for the named object in every frame, so an example that is not in the take changes nothing. Swap presets only suggest an example as the placeholder of "What is replaced".

The catalogue is `apps/web/src/features/revision/presets.ts`; `apps/web/test/change-presets.test.ts` fails when a template has a gap without a slot, a slot is unused, or a swap preset fills in the object.

## Not carried over

- **Target frames.** ALTER's biggest finding: a still of this shot with the change already photographed in, made by an image model first, makes a swap look photographed instead of pasted. Our Swap an object already makes a FLUX 3 Klein keyframe from the Thing's views; showing that keyframe for approval before the video runs is the closest equivalent and the next step.
- **Presets that need two references** (label redesign, market variant with a new person and a new place): one run takes one Element.
- **Clips over four seconds** for the LTX modes, and ALTER's draft-at-480p-then-finalise step, which our pipelines do not have yet.

## Next

Show each preset on the kitchen table take, as ALTER plays every version on the same clip. A restyle preset's look is its FLUX keyframe, so one image job per preset on the take's first frame would give the chips real thumbnails at low cost.
