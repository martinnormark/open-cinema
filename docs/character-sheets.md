# Character sheets

A Character's references are made the way a video model learns from them best: one set per look the Character has in the film, each set a three-panel sheet and two close portraits. Implemented on 2026-10-17.

## The format

| View | What it shows | Why |
| --- | --- | --- |
| Close portrait (`face-closeup`) | Head and shoulders in three-quarter view, neutral, mouth closed, 3:4 | The only face a model should learn from. Made first; everything else is guided by it. |
| Smiling close-up (`smile`) | The same portrait with an open smile, 3:4 | Without it the model invents the teeth and jaw the first time the Character laughs, and the smile arrives as somebody else's mouth. |
| Character sheet (`sheet`) | Three equal panels on one 21:9 image: full body from the front, full body from behind, a large three-quarter portrait | Body, build, hair from behind and the whole outfit. The front figure has its head removed (below), so the small, soft face of a wide panel is never copied into a wide shot. |

The backdrop is solid neutral grey with soft even light, no hard shadows and no blown-out highlights. Prompts never contain "studio" (the model draws a photo studio with stands and lamps and bakes its key light into later shots), any lamp, key, overhead or rim light (drawn into the frame, or dragged into scenes that do not have it). They say "no studio, no equipment, no walls" instead. Hands stay empty: a prop born inside a sheet can never be dropped, thrown or taken away, so every object is its own Thing. The rules live in `apps/web/src/features/elements/sheet-prompt.ts`, which also strips those words from the creator's description and state text before they reach the prompt.

## States are sheets

A Character has as many sheets as states it goes through: Cal at the start, Cal wet after the fall into the Thames, Cal injured in the third act. Each state is its own set of three references, not one sheet with a note. The checklist asks every state for its own close portrait, smile and sheet.

- `approvedReferences` (contracts) returns a state's own views first, and leaves out a base view the state has replaced. Mentioning `@Cal:wet` sends wet Cal's sheet, not dry Cal's jacket as well.
- A state's views are guided by its own close portrait, or the base portrait until it has one. A state's sheet is never guided by the base sheet or other base views that carry clothing (`WARDROBE_VIEWS` in `model.ts`).
- Prompts for a state lead with the change ("changed for this state: …; keep only the face, age, skin tone and build from the reference"). Live, a guided portrait whose prompt only appended the state came back looking exactly like the base reference.

The Character page shows "Sheets by state", one row per look with its sheet, portrait and smile. The Elements index lays the cast out as a board: a column per Character with its looks stacked in film order.

## Headless full-body panels

FLUX 3 Image ignores "headless" in a prompt and draws the head anyway, and refused (content policy) an edit asking it to remove the head. Cropping the frame at the neck by prompt left a chin. So the head is removed after generation, in the browser, by `removeHead` in `headless.ts`:

1. In the first third of the image (the front panel), estimate the backdrop per row from the panel's left and right edges and mark pixels that differ from it as the figure.
2. From the figure's width per row: the torso sets the shoulder width, the head is the widest row in the top tenth of the figure, the neck is the narrowest row between the head and the shoulders, and the cut is where the neck widens into the collar.
3. Repaint everything above the cut, across the head's columns plus generous padding for light hair on grey, with the backdrop interpolated from either side of the patch and a little grain. The bottom rows fade into the original backdrop so no edge shows beside the shoulders.

It runs in a Web Worker on an `OffscreenCanvas` when a sheet job finishes, so the review shows the headless sheet, and approving uploads that PNG as the reference (it appears in the Library as an upload). A figure with no head above its shoulders is left untouched. Uploaded sheets are used as they are.

## Where references go

- **Recast (Kling 3.0 Omni):** close portrait first, then the sheet, then the smile, at most four images. The prompt says which image tags hold the face and that the sheet's heads are left out on purpose (`referenceGuide` in `character-replace.ts`). Keeping the source wardrobe sends face views only.
- **Images with @mentions (FLUX 3 with references):** a Character's references go portrait first, and when a sheet is among them the prompt adds that the sheet's bodies are headless on purpose and faces come only from the close portraits.
- **Recast result checks** compare faces against the close portrait, smile and the older full-body views, never the sheet.

## Cost

At Router prices on 2026-10-17, a close portrait (1k, 3:4) is about 6 credits and a sheet (1.5k, 21:9) about 9 to 12. A full set for one look is about 20 credits. Building Cal with three looks, including the prompt experiments and retries described above, used roughly 130 credits (about $0.60).

## Known limits

- FLUX 3 keeps a guided close portrait very near its reference. Injured Cal came out clearly changed; wet Cal only lightly wet, even with a vivid description, while his wet sheet (whose layout differs from the reference) came out soaked. Describe a state head to toe and concretely.
- FLUX 3 refuses some injury wording under its content policy ("beaten up", "dried blood"); "a plaster across the eyebrow, a faint bruise, dark stains on the T-shirt" passed.
- The headless pass assumes the front view fills the first third of the image and stands on a plain backdrop; it leaves anything else untouched rather than guess.
