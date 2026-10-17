# Location references and reference shots

A Location's primary reference is a few seconds of the empty place with the
camera moving through it, not a frontal still. A still shows one face of a
room; a move shows how its walls, openings and depth sit around the camera, so
the model can infer the architecture beyond the frame and a later shot whose
camera moves keeps the same place.

The shot then follows one rule: **the references carry the picture, the words
carry everything else, including the geometry**. Faces, wardrobe and the place
come from approved references; who stands where, which side the camera is on
and what the light does come from the shot's wording.

## Moving references

A Location's sheet has three moving views (`LOCATION_MOVES` in
`packages/contracts/src/elements.ts`):

| View      | Label            | Move                                            |
| --------- | ---------------- | ----------------------------------------------- |
| `push-in` | Moving reference | Glides forward into the space at walking height |
| `drift`   | Lateral drift    | Slides sideways, so near and far separate       |
| `rise`    | Rising view      | Rises, showing the layout from above            |

`push-in` is required and comes first in the guidance; the other two are
optional. The establishing view is still required, as a still.

**Generate** makes a 5 s, 1280×720 clip with no sound
(`moveRequest` in `apps/web/src/features/elements/model.ts`):

- From the description alone it runs on **LTX 2.5** text-to-video on Router.
  The prompt says the place is empty (no people, animals or moving things
  except light, weather and foliage) and states the move in plain words. Lens
  and camera-gear words stay out, as for every LTX prompt (`LTX_FRAME_ARTEFACT`).
- When the Location (or the state) has an approved establishing, reverse or
  landmark still, the move continues from that still on **FLUX 3 Video**,
  because Router's LTX reads text only. This is how a creator's own photos of
  a place become its moving reference.

The clip is also large and long enough for a reference video (3–10 s, at
least 720 px on the short side), which is why the camera-control LoRA graph on
Cloud, at 1280×704, is not used here.

Creators can also upload or pick a clip. On a Location sheet the upload
accepts MP4, MOV and WebM, and a clip is tagged as a moving view from its file
name (`drift`, `crane`, `push`…) or as `push-in` when the name says nothing.
A clip can only be tagged as a moving view and a still never can.

Moving references are kept apart from stills: `approvedReferences` returns
stills only, so FLUX, the Kling edits and the LTX alpha composite never
receive a video as an image. `approvedMotionReferences` returns the moves with
the same state rules (a state's own move replaces the base move). A resolved
mention carries them as `motion`.

### Checklist

The guidance counts the moving reference as an essential view. While a
Location has approved stills and no move, it warns: "Only still frames so far.
A still shows one face of the place, so a shot whose camera moves has to
invent the rest. Add a moving reference." A state of a Location that already
has a base move is not warned. The Elements index notes "no moving reference"
under a Location without one, and a Location's tile plays its move under the
pointer.

On the sheet a move loops silently while at least half of it is on screen. With
reduced motion it holds its first frame and shows the controls.

## Reference shots

`video.reference` is text-to-video from references
(`packages/comfy/src/workflows/reference-video.ts`). It runs on **Kling 3.0
Omni**, the only Router model that takes reference images and a reference video
together without a first frame. Each request sends:

- the first mentioned Location's move as the reference video
  (`refer_type: "feature"`), or its best still as an image when it has no move;
- each Character's close portrait, then its sheet, so the face comes from the
  portrait; then Things and Locations without a move. Four images at most
  beside a video;
- no first frame.

The prompt replaces each mention with its name and the reference that shows
it: `Mara (as in <<<image_1>>>) stands at the end of Harbor (the place shown in
<<<video_1>>>)`. A mention whose references do not reach the model is
described in words, as for LTX. One sentence closes the prompt
(`REFERENCE_RULE`): the references show only what people and places look like;
positions, the camera's side and movement, and the light come from the words.
720p standard mode, no sound.

### In Sequences

A shot has a **Staging** field: where everyone stands, which side the camera is
on, where the light comes from. `composeShotPrompt` puts it right after what
the frame shows, before framing and camera. The planner fills it.

When a shot mentions Elements with references, **Shoot from references** makes
a motion take straight from the shot's words, with no keyframe. It is the
primary action when a mentioned Location has a moving reference and the shot
has no approved motion yet. **Make keyframe** and **Animate** stay: the FLUX
keyframe path is still how a continuation picks up from the previous shot's
last frame, so a continuing shot does not offer references.

### In the Studio

With **Video** chosen and a mention that has references, **Picture from**
offers References or Words only. References is the default once a mentioned
Location has a moving reference. Words only is LTX 2.5 text-to-video, where
each mention is described in text, and is where the camera-move LoRAs live.

## Trade-offs

- **Model.** Router's LTX 2.5 is text-only and LTX-2's open weights have no
  reference-video input, so reference shots run on Kling 3.0 Omni, not LTX. LTX
  stays the default everywhere a Location has no move, and makes the moving
  references themselves. Bringing reference shots to LTX needs an in-context
  adapter of our own (an IC-LoRA trained on empty-location moves paired with
  shots in the same place); no third-party LoRA is used.
- **The reference move steers the camera.** In the first live reference shot
  (Tide Mill, 5 s), the place, the added character and the light ("low sun
  behind the mill house", where the reference was overcast) all came through,
  but Kling followed the reference video's camera path almost frame for frame
  and ignored "the camera stays low on the far bank". With `refer_type:
"feature"` the words carry the light, the people and their actions; the
  camera's path comes from the move. A shot gets the camera it asks for when
  the Location has a move that matches it (push-in, drift, rise), or when the
  place is sent as stills instead of a video, at the cost of weaker
  architecture.
- **Keyframe or references.** A FLUX keyframe fixes the exact first frame the
  creator approved and makes continuity cuts exact. A reference shot composes
  from words, so the frame is less predictable, but nothing is pinned to one
  still and the camera can move through space the model has seen from more
  than one side.
- **Cost.** A reference shot bills Kling's per-second rate (about 27 credits a
  second at 720p, heuristic); a moving reference costs one LTX 2.5 clip (about
  136 credits for 5 s at 720p) or one FLUX 3 Video clip.
