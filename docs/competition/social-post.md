# Launch post drafts

Drafts for the #OpenSourceHiggsfield post the [entry form](../competition-submission.md) needs a link to. Pick one, edit, and post it with the video uploaded natively (not as a link), then paste the post's URL into the form. Written 2026-10-17 against the state of `main`; re-read the claims below if the app changes before posting.

**Attach:** the demo cut [`docs/media/open-cinema-demo.mp4`](../media/open-cinema-demo.mp4) (1:58, captioned, silent). For a 30-second cut, see [The 30-second viral cut](../competition-submission.md#the-30-second-viral-cut); it is not made yet.

**Link:** https://github.com/martinnormark/open-cinema

**Stills for a carousel or replies** (all in [`docs/media/examples/`](../media/examples/), the same as the README's [example outputs](../../README.md#example-outputs)):

1. `revisions-source-background-recast.webp`: source, new background, recast
2. `alpha-gen-before-matte-after.webp`: take, Alpha Gen matte, composite
3. `compare-viewer-wipe.jpg`: the wipe comparison
4. `character-sheets-by-state.jpg`: @Cal, wet and injured
5. `elements-theo-in-cottage.jpg`: @Theo at @KeepersCottage
6. `performance-transfer.webp`: source, pose, new character

## Claims checked

Every sentence below rests on one of these. Do not add others without evidence.

| Claim                                                                          | Evidence                                                                                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Elements (Characters, Locations, Things) are made once and mentioned with `@`. | Live MVP journey, 2026-10-17: @Theo and @KeepersCottage made and mentioned together ([README](../../README.md#example-outputs)).                       |
| A mention carries approved references, not just a name.                        | "@Theo at @KeepersCottage" rendered from four approved references with FLUX 3 Image.                                                                   |
| Background replaced and character recast on the same take; performance kept.   | Kling 3.0 Omni through Comfy Router, kept and exported in the live MVP journey ([results](../media/examples/revisions-source-background-recast.webp)). |
| The LTX background path never repaints the actors.                             | The Alpha Gen graph composites the take's own pixels through a generated matte (`workflows/cloud/background/`); ran on Comfy Cloud.                    |
| LTX for video, FLUX 3 for images.                                              | LTX 2.5 Fast text-to-video in Studio; LTX 2.5 Alpha Gen, LTX 2.3 and LTX-2 graphs on Cloud; FLUX 3 Image for stills and Element references.            |
| Original and result compare with a wipe.                                       | The revision viewer ([compare-viewer-wipe.jpg](../media/examples/compare-viewer-wipe.jpg)).                                                            |
| Open source, MIT, runs on your own Comfy key.                                  | [LICENSE](../../LICENSE), [README](../../README.md#run-it-locally).                                                                                    |
| The ComfyUI workflows are in the repo.                                         | [`workflows/`](../../workflows/README.md), generated from the app's code.                                                                              |

Avoid: "Higgsfield killer", "production-ready", "one click", any speed or price claim, "consistent characters, guaranteed", and any claim that recast runs on LTX (it runs on Kling 3.0 Omni; the LTX recast is an experiment that did not hold identity). Performance transfer, Object Swap, Restyle, Re-stage and camera moves have only had short check runs: mention them as experimental or not at all.

## A. Short (X, Threads, Bluesky)

> Open Cinema: an open-source Cinema Studio on @ComfyUI.
>
> Build your cast and places once, mention them with @, then swap a shot's background or actor while the performance stays as shot.
>
> FLUX 3 stills, LTX video, MIT licensed.
>
> github.com/martinnormark/open-cinema
> #OpenSourceHiggsfield

273 characters as X counts them (a link counts as 23), inside the 280 limit.

**Alternative hook lines** (swap for the first line):

- "Same take. New background. New actor. Nothing else moved."
- "What if you could re-shoot one decision instead of the whole shot?"
- "Your cast and your places, saved once, mentioned anywhere."

## B. Thread (X), 6 posts

1/ I built Open Cinema, an open-source Cinema Studio on @ComfyUI, for #OpenSourceHiggsfield.

The idea: build your world once, then direct it. And when a shot is almost right, change one decision without losing the rest. 🎬 [video]

2/ Elements are the vocabulary. A Character, a Location or a Thing gets a curated reference sheet. Write "@Theo at @KeepersCottage" and FLUX 3 renders from the approved references, not from a description. [elements-theo-in-cottage.jpg]

3/ Characters have states. @Cal, @Cal:wet and @Cal:injured each carry their own sheet, so a scene asks for exactly the look it needs. [character-sheets-by-state.jpg]

4/ Then revise. Replace the background with a Location, or recast a person with a Character. The performance, timing and camera move stay as shot, and the original is one click away in a wipe viewer. [revisions-source-background-recast.webp]

5/ For backgrounds there is also an LTX path that never repaints the actors: LTX 2.5 with Lightricks' Alpha Gen IC-LoRA pulls a matte, and the take's own pixels go over a new FLUX 3 plate. It runs as a ComfyUI graph on Comfy Cloud. [alpha-gen-before-matte-after.webp]

6/ It's MIT, runs on your own Comfy key, and every ComfyUI workflow it uses is in the repo, generated from the same code the app runs.

github.com/martinnormark/open-cinema

Built with TanStack Start on Cloudflare Workers, Comfy Router and Comfy Cloud. #OpenSourceHiggsfield

## C. Carousel (Instagram, LinkedIn)

**Slides** (one image each, short caption burned in or as alt text):

1. Cover: a frame from the recast, text "Change one decision. Keep the shot."
2. `elements-theo-in-cottage.jpg`: "Build your cast and places once. Mention them with @."
3. `character-sheets-by-state.jpg`: "One character, every state."
4. `revisions-source-background-recast.webp`: "Same take. New background. New actor."
5. `alpha-gen-before-matte-after.webp`: "The LTX path never repaints the actors."
6. `compare-viewer-wipe.jpg`: "Compare before you keep."
7. End card: "Open Cinema. Open source on GitHub. #OpenSourceHiggsfield"

**Caption:**

> Open Cinema is an open-source Cinema Studio I built on ComfyUI for the #OpenSourceHiggsfield competition.
>
> You make your characters, places and props once as Elements, with reference sheets you approve. You mention them by name with @ when you generate. When a shot is nearly right, you change one decision, like the background or who is in it, and the performance, timing and camera move stay as they were shot.
>
> FLUX 3 makes the stills and references. LTX is the video model, including a background-replacement workflow built on Lightricks' Alpha Gen IC-LoRA that keeps the actors' original pixels. Recasting uses Kling 3.0 Omni through Comfy Router.
>
> It's MIT licensed, runs on your own Comfy key, and the ComfyUI workflows are in the repo. Link in bio / in the comments: github.com/martinnormark/open-cinema
>
> #OpenSourceHiggsfield #ComfyUI #FLUX #LTX #AIfilmmaking

For LinkedIn, drop the last hashtags except #OpenSourceHiggsfield and #ComfyUI, and put the link in the post body.

## D. Reddit (r/comfyui, r/StableDiffusion)

**Title:** I built an open-source Cinema Studio on ComfyUI: reusable characters and places, then replace a shot's background or recast an actor while the performance stays put (#OpenSourceHiggsfield)

**Body:**

> Open Cinema is a web studio on top of Comfy Router and Comfy Cloud, MIT licensed: github.com/martinnormark/open-cinema
>
> What it does today:
>
> - **Elements.** Characters, Locations and Things with curated reference sheets, and states (wet, injured). `@Theo at @KeepersCottage` renders with FLUX 3 from the approved references.
> - **Video.** LTX 2.5 from the Studio, plus camera moves with Lightricks' LTX-2 camera-control LoRAs on Comfy Cloud (short check runs so far).
> - **Revise a shot.** Replace the background with a Location, or recast a person with a Character (Kling 3.0 Omni through Router), then a Comfy Cloud graph re-times the result onto the take's exact frame grid (and, for an as-shot background, puts the original performers back over it). A wipe viewer compares original and result.
> - **An LTX background path** that never regenerates the actors: LTX 2.5 + Lightricks' Alpha Gen IC-LoRA makes a matte and the take's own pixels are composited over the new plate.
>
> For this sub: every graph the app runs on Comfy Cloud is in `workflows/cloud/` as API-format JSON, generated from the same TypeScript the app submits, with a test that fails if they drift. They load in the ComfyUI editor. Only Lightricks' own LoRAs are used.
>
> Known limits: recast on LTX alone did not hold the face past a second in our tests, so recast uses Kling; Re-stage only reaches small camera moves; performance transfer has run as a graph but has no composer yet.
>
> Two-minute demo attached. Feedback welcome.

## Hashtags and mentions

- Required: **#OpenSourceHiggsfield**
- Accounts to tag, if Martin wants: @ComfyUI (X), @bfl_ml (Black Forest Labs, X), @LTX_model or @Lightricks (check the current handle before posting).
