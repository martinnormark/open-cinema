# Elements: the default path

Characters, Locations and Things are authored the same way, so a creator learns it once. Implemented on 2026-10-17. The per-type detail is in [character-sheets.md](character-sheets.md) and [location-references.md](location-references.md); this page is the shared path and the Thing sheet.

## One step at a time

Every sheet has an **anchor view** that the rest is made from:

| Type      | Anchor (made first) | Then, in one step                       | Optional                                       |
| --------- | ------------------- | --------------------------------------- | ---------------------------------------------- |
| Character | Close portrait      | Smiling close-up, Character sheet       | none                                           |
| Location  | Establishing view   | Moving reference (push-in), Landmarks   | Atmosphere and materials, drift, rise, reverse |
| Thing     | Hero view           | Turnaround sheet, Materials and details | Front, side, back, top as single views         |

The Element page shows one **next step** above the checklist (`nextStep` in `apps/web/src/features/elements/model.ts`):

1. **Make the anchor.** Creating an Element from a description generates only the anchor. Views made from words alone are each their own design: before this, a new Thing generated its hero and front views side by side, and a new Location its push-in (LTX 2.5) and establishing still (FLUX 3) independently, so nothing tied them to one object or one place.
2. **Choose the anchor.** Approve the result that looks right, or **Try another**.
3. **Finish the sheet.** One button makes every missing essential view at once, each guided by what is approved. A Location's moving reference continues from the approved establishing still on FLUX 3 Video, so the clip shows the same place, and costs about the same as an LTX 2.5 clip from words.
4. **Review the new views**, then the sheet is **ready**: **Use @Name in Studio** opens the Studio with the mention written in (on video for a Location with a moving reference, where References is the default).

A state follows the same path. A Character's state is a full sheet of its own; a Location's or Thing's state needs only its anchor view in that state, and identity fills in the rest.

The checklist below the next step still lets a creator make any single view, and lists the optional views under their own heading.

## Defaults the app decides

- **Starting images replace exploring.** On the create page, adding images or clips turns off "Explore looks from the description" until the creator turns it back on, so a photo of the real object is not met by a competing invented one.
- **Uploads arrive tagged.** A file whose name says what it shows keeps that view (`lantern-side.jpg`). Otherwise it takes the next view the sheet still needs, anchor first: a Character's close portrait, a Thing's hero view and then its details, a Location's establishing view and then its landmarks. A clip of a place is its moving reference. Panel views (a Character sheet, a Thing turnaround) and the smile are never guessed from one photo. The tag shows on the tile and can be changed.
- **A Location takes clips from the start.** The create page accepts MP4, MOV and WebM for Locations, since a short clip of the empty place with the camera moving is its best reference.
- **One approved anchor per view.** Approving a second close portrait, smile, sheet, hero view, turnaround, establishing view or move replaces the first; the button says **Use instead** and the earlier one returns to the explorations, where it can be restored. Landmarks, details and other views can sit side by side.

## Framing

- **Close-ups lead with the framing.** A detail or materials view is written framing first ("Extreme macro close-up: one small part of it fills the whole frame … Of this: …") and guided by the approved views only for materials and finish. Written subject first, FLUX 3 drew the whole object again, or a collage of details; a request also says it wants one photograph, no panels or grid, unless it is a panel view.
- **A Location's stills are 16:9.** The establishing, landmark and alternate viewpoint stills are wide frames, the shape of the shots they feed and of the moving reference that continues from the establishing view, and the sheet shows them as wide tiles.

## Thing sheets

A Thing's turnaround is one 21:9 image of three equal panels, front, side and back, on the plain grey backdrop, generated at 1.5k and guided by the approved hero view (`THING_TURNAROUND` in `model.ts`). Made together in one image, the three panels share one design, the same reason a Character's front and back share one sheet. Unlike a Character sheet, nothing is removed from it after generation. Older Things keep their single front, side, back and top views, which still count as optional views and still reach the models.

## Which references a mention sends

`approvedReferences` (contracts) orders an Element's approved stills by `LEAD_VIEW_ORDER`: a Character's close portrait, a Thing's hero view and a Location's establishing view first, details last, with a state's own views ahead of the identity's. Approval order no longer decides it.

- **Models that take one image per Element** (Kling reference shots take one image for each Thing and Location without a move) get that lead view, so a Thing arrives as its hero view rather than whichever detail was approved first.
- **FLUX 3 with several mentions** shares 10 reference images. They are filled in turns: every Element's lead view, then every Element's second view, and so on (`mentionReferences` in `packages/comfy/src/workflows/definitions.ts`). Before, a Location with four stills and two Characters mentioned first used all ten, and a Thing written last reached the model as words only.

## Cost

At Router prices on 2026-10-17, a Thing's hero view is about 6 credits, its turnaround about 9 to 12 and its detail about 6, so a full Thing sheet is about 22 credits. A Location's establishing view and landmark are about 6 each and its moving reference about 158 (FLUX 3 Video, 5 s at 720p).
