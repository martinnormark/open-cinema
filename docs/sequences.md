# Sequences

A sequence turns an idea into shots that belong together. Each shot keeps the
project's cast, places and look, and is approved on its own, so continuity is
built one decision at a time rather than hoped for in one long generation.

Creators find it under **Sequences** in the sidebar (`/sequences`).

## Planning

The creator writes a few sentences or a rough script, optionally with
`@Element` or `@Element:state` mentions, and chooses a project.

- **Plan the shots** asks a model on Comfy Router
  (`packages/comfy/src/shot-planner.ts`, through the jobs Worker's
  `planSequence` RPC) for up to six shots: title, beat, what the frame shows,
  framing, camera and length. It is told which Elements and states exist and
  may only mention those; `readPlan` strips any handle it invents and clamps
  enums and lengths. The Router rejects a forced `tool_choice`, so the prompt
  asks for exactly one `propose_shots` call instead.
- When the model is unreachable or answers without the tool,
  `splitIdeaIntoBeats` turns each sentence into a shot and the board says the
  plan came from the sentences.
- **Start empty** creates the sequence with no shots.

Nothing is generated while planning; every field can be edited first.

## Shots

A shot (`packages/contracts/src/sequences.ts`) has a title, beat, what the
frame shows, staging (who stands where, which side the camera is on, where
the light comes from), framing, camera move, length (2–10 s) and continuity. Shots can be
inserted after any shot, moved earlier or later, and deleted.

Each shot is made in two approved steps, each with its own takes:

1. **Keyframe**: FLUX 3 Image with the mentioned Elements' approved references
   (`image.flux-reference`, 16:9). The prompt is composed by
   `composeShotPrompt` from the frame description, a framing phrase and the
   project's look, which the server also applies from the project id.
2. **Motion**: `video.ltx` from the approved keyframe as its first frame, with
   the camera phrase added.

A shot that mentions Elements with references can skip the keyframe:
**Shoot from references** makes the motion take with `video.reference`, where
the references carry the picture and the shot's words carry the staging. It
leads when a mentioned Location has a moving reference; continuing shots keep
the keyframe path. See [location-references.md](location-references.md).

A take is a candidate until approved or rejected; approving one demotes the
other approved take of that role. Only a finished take can be approved, and a
take can only point at media the creator owns.

**Pick up where shot N ends** marks a shot as a continuation. Its keyframe is
then taken from the last frame of the previous shot's approved motion
(`features/sequences/last-frame.ts`: decoded in the browser, saved as an
upload and approved as a `continued` take), so the cut has no jump.

A shot's approved motion can be revised in the revision studio; finished
revisions of it are offered on the shot as **Use in shot**.

## Watching and exporting

- The filmstrip shows each shot's approved picture and its state.
- **Play sequence** plays the approved takes in order with hard cuts, holding
  stills for shots that only have a keyframe.
- **Shot list** downloads `open-cinema.shot-list` JSON with every shot's
  direction and approved media.
- Sequences travel in world bundles with their approved takes
  ([world-bundles.md](world-bundles.md)).

## Limits

- The last-frame step needs a browser that decodes the take; Router video is
  H.264, which open-source Chromium builds (including headless test browsers)
  cannot decode. The shot then says the take could not be read.
- Router's first-frame video model sets its own minimum length, so a 3 s shot
  can come back at 5 s.
- Planning sends the idea and Element names and descriptions to the planner
  model on Comfy Router; no images are sent.
