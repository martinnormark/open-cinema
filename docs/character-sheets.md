# Character sheets

## ComfyUI generation and edits (2026-10-30)

Character sheet, neutral portrait and smile requests now use `image.character-sheet` on Comfy Cloud. The actual JSON graphs are in [`workflows/cloud/character-sheet`](../workflows/cloud/character-sheet/README.md), including generation, state and edit examples. The UI sends the raw identity text, separate state direction, and approved references; `StringFormat` inside the graph inserts them into the template before the native FLUX 3 Image node expands and renders the prompt. A separate language model is unnecessary.

The saved sheet contains front and rear full-body views and a large face close-up. The workflow blanks the **front face**, preserving hair/head outline where outside the mask. Its face detector is limited to the top quarter of the first panel. The output is ready to approve directly as a job output; it no longer needs a browser upload to finish processing.

“Edit this reference” is available for generated and uploaded sheets and portraits, both approved and exploratory. Enter a targeted change; its source remains available while a new version arrives for review. Approval replaces only that view in that state. Each edit retains its source asset and instruction in the generation request. State generation uses the state's own approved face, falling back to the base portrait, and excludes base wardrobe-bearing reference images. The template retains default clothing unless the state explicitly overrides it.

Local Bun credentials go in root `.env.local`: `COMFY_CLOUD_API_KEY`, or `COMFY_API_KEY` as fallback. Docker Compose reads root `.env`. No additional LLM/BFL key is needed. See the workflow README for local ComfyUI setup.

### Live checks

| Check                                                        | Cloud receipt                          | Observed result                                                                     |
| ------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------- |
| Generate a complete sheet                                    | `61c2b772-7623-4d87-93e3-2aa6a1ab8a0a` | Three views, front face blanked, recognizable close-up, rear face hidden            |
| Change only navy sweater to forest green                     | `3188e4fd-ec0e-473f-a16d-3fe930a5a585` | Green sweater in all three panels; visually retained face, pose, trousers and boots |
| Burgundy sweater edit submitted and approved through the app | `3ee5d264-6105-4ed1-82d5-96ac841fed2a` | New image persisted, reviewed and approved; source remained in explorations         |
| Wet state, first prompt                                      | `3dcb1b5b-d9b8-46df-874e-6009633ffa3f` | Wetness worked, but outfit changed: rejected and template corrected                 |

The second wet-state run retained the navy sweater, tan trousers and boots. It revealed a false-positive face mask on clothing. Restricting detection to the upper front panel fixed it; mask-only replay `1f1261b9-b983-4db9-800d-fdea73b2d1c9` on the saved FLUX output verified the correction. Pixel comparisons found **zero changed pixels** in the rear/close-up panels and the front body below row 256 after masking. This establishes preservation by compositing, not pixel-identical preservation by the generative model.

Local images, receipts and diagnostic graphs are in gitignored `artifacts/character-sheet/`. Review `generate.png`, `edit.png` and `state-final.png`. Detection can still miss faces; do not approve a sheet unless the blank front face and all requested views are visibly correct.

Production UI checks covered editing, submission, live progress, approval and original retention, at desktop and 390px width (no horizontal overflow). Desktop trace: 1,138 frames, median 16.673 ms, p95 17.553 ms, no intervals above 25 ms. The trace spanning the switch to a narrow viewport included a 33.246 ms interval; sustained 60 fps on representative physical devices and large libraries is **not established** by these checks. Traces are saved beside the images. Cursor recording was blocked by the installed FFmpeg's missing `libx265.216.dylib`; no 60 fps video claim is made.

The browser head-removal worker, its preview cache and the approval-time image re-upload have been removed. Every generated reference is reviewed and approved directly from its saved job output. Older unapproved Router outputs are shown as originally generated; regenerate them with the current workflow if their front face needs masking. Previously approved uploads remain unchanged.

The browser no longer builds character prompts. The ComfyUI workflow owns the template and face mask. The `@vladmandic/human` package and its model-copying build step remain necessary for the separate recast quality checks in `features/revision/shot-detector.ts`; they were not used by the removed masking code.

A Character has one reference set per look: a three-panel sheet and two close portraits.

## The format

| View                            | What it shows                                                                                                         | Why                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Close portrait (`face-closeup`) | Head and shoulders in three-quarter view, neutral, mouth closed, 3:4                                                  | The only face a model should learn from. Made first; everything else is guided by it.                                                          |
| Smiling close-up (`smile`)      | The same portrait with an open smile, 3:4                                                                             | Without it the model invents the teeth and jaw the first time the Character laughs, and the smile arrives as somebody else's mouth.            |
| Character sheet (`sheet`)       | Three equal panels on one 21:9 image: full body from the front, full body from behind, a large three-quarter portrait | Body, build, hair from behind and the whole outfit. The front face is blanked by the workflow, so facial detail comes from the close portrait. |

The backdrop is solid neutral grey with soft even light, no hard shadows and no blown-out highlights. Prompts never contain "studio" (the model draws a photo studio with stands and lamps and bakes its key light into later shots), any lamp, key, overhead or rim light (drawn into the frame, or dragged into scenes that do not have it). They say "no studio, no equipment, no walls" instead. Hands stay empty: a prop born inside a sheet can never be dropped, thrown or taken away, so every object is its own Thing. The template lives in `packages/comfy/src/workflows/character-sheet.ts` and the exported workflow JSONs. The UI passes the creator's description and state text into that template without a separate browser prompt-building pass.

## States are sheets

A Character has as many sheets as states it goes through: Cal at the start, Cal wet after the fall into the Thames, Cal injured in the third act. Each state is its own set of three references, not one sheet with a note. The checklist asks every state for its own close portrait, smile and sheet.

- `approvedReferences` (contracts) returns a state's own views first, and leaves out a base view the state has replaced. Mentioning `@Cal:wet` sends wet Cal's sheet, not dry Cal's jacket as well.
- A state's views are guided by its own close portrait, or the base portrait until it has one. A state's sheet is never guided by the base sheet or other base views that carry clothing (`WARDROBE_VIEWS` in `model.ts`).
- Prompts for a state lead with the change ("changed for this state: …; keep only the face, age, skin tone and build from the reference"). Live, a guided portrait whose prompt only appended the state came back looking exactly like the base reference.

The Character page shows "Sheets by state", one row per look with its sheet, portrait and smile. The Elements index lays the cast out as a board: a column per Character with its looks stacked in film order.

## Where references go

- **Recast (Kling 3.0 Omni):** close portrait first, then the sheet, then the smile, at most four images. The prompt says which image tags hold the face and that the sheet's heads are left out on purpose (`referenceGuide` in `character-replace.ts`). Keeping the source wardrobe sends face views only.
- **Images with @mentions (FLUX 3 with references):** a Character's references go portrait first, and when a sheet is among them the prompt adds that the sheet's bodies are headless on purpose and faces come only from the close portraits.
- **Recast result checks** compare faces against the close portrait, smile and the older full-body views, never the sheet.

## Historical Router cost

At Router prices on 2026-10-17, a close portrait (1k, 3:4) is about 6 credits and a sheet (1.5k, 21:9) about 9 to 12. A full set for one look is about 20 credits. Building Cal with three looks, including the prompt experiments and retries described above, used roughly 130 credits (about $0.60).

## Known limits

- FLUX 3 keeps a guided close portrait very near its reference. Injured Cal came out clearly changed; wet Cal only lightly wet, even with a vivid description, while his wet sheet (whose layout differs from the reference) came out soaked. Describe a state head to toe and concretely.
- FLUX 3 refuses some injury wording under its content policy ("beaten up", "dried blood"); "a plaster across the eyebrow, a faint bruise, dark stains on the T-shirt" passed.
- Workflow masking assumes the front view occupies the first third of the sheet, with its face near the top. Review the output for missed faces or false detections.
