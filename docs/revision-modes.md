# Camera moves, Object Swap, Restyle and re-staging

Four revision and generation modes run as open-weights FLUX and LTX graphs on Comfy Cloud. Router offers none of them. Implemented and check-run on 2026-10-17.

| Mode                | Where                         | Workflow kind             | Graph                                                                           |
| ------------------- | ----------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| Camera move         | Studio, Video, **Camera** row | `video.ltx` with `camera` | LTX-2 19B distilled + a Lightricks camera-control LoRA                          |
| Swap an object      | Revise a shot                 | `video.object-swap`       | FLUX.2 Klein 9B keyframe → LTX 2.3 union IC-LoRA → SAM 3 composite              |
| Restyle             | Revise a shot                 | `video.restyle`           | FLUX.2 Klein 9B keyframe → LTX 2.3 union IC-LoRA                                |
| Re-stage the camera | Revise a shot                 | `video.restage`           | MoGe-2 geometry → per-frame re-projection → LTX 2.3 In-Outpainting IC-LoRA fill |

Graph builders are pure functions in `packages/comfy/src/workflows/`: `ltx-graph.ts` (shared loaders, sampler and save nodes), `ltx-camera.ts` (camera moves), `ltx-restage.ts` (re-staging) and `ltx-edit.ts` (swap and restyle). `revision-modes.ts` turns typed inputs into a `CloudWorkflowRequest`. Each graph keeps the take's frame count, frame rate and audio, and trims the source to at most 97 frames (about 4 s at 24 fps) at up to 768 px on the long side.

## How each mode works

- **Camera move.** The prompt describes the scene; the LoRA makes the move (`CAMERA_MOVES` in `packages/contracts/src/camera.ts`: locked off, push in, pull back, track left and right, crane up and down). A first frame, when given, is placed with `LTXVImgToVideoInplace`. Without a move, `video.ltx` stays on Router.
- **Object Swap.** The creator names the object in the take ("table lamp") and picks a Thing. FLUX.2 Klein edits the first frame with up to three of the Thing's approved views (front and three-quarter first). LTX 2.3 carries that keyframe through the take while the union-control IC-LoRA reads the take's depth (MoGe-2, rendered per frame as normalised disparity by `MoGeRender`), so motion and camera match. SAM 3.1 then tracks the original object in the take and the new one in the result (`SAM3_VideoTrack`, grown 12 px). Only the union of those masks comes from the generation; every other pixel is the take's own.
- **Restyle.** The same keyframe-then-carry approach with a style image, a Location's approved references, or words alone. Everything restyles, people included, so the composer warns about likeness.

- **Re-stage.** Our own graph, no borrowed LoRA. MoGe-2 (MIT) estimates the lens from the first frame and then every frame's metric geometry with that lens. Each frame becomes a textured mesh, with triangles across depth edges dropped, and is ray-cast (`RenderMesh`) from the new camera in `RESTAGE_ANGLES`: a move of 15 cm sideways or up and down, or 30 cm in or out, still aimed at a point 2 m ahead. What the original camera never saw is left as a hole; Lightricks' In-Outpainting IC-LoRA on LTX 2.3 fills the holes from the rest of the take, and `LTXVLaplacianPyramidBlend` keeps the re-projected pixels everywhere else. The mesh and render nodes are one per frame, so the take is padded to 97 frames and the result trimmed back. A bigger reach needs a re-staging IC-LoRA of our own ([restage-ic-lora.md](restage-ic-lora.md)).

## Guardrails

- Estimates before submission come from `CLOUD_GRAPH_ESTIMATES` (time only; Cloud bills GPU time and reports no per-job cost).
- After a swap or restyle loads, the on-device face checks (`checkPeople` in `apps/web/src/features/revision/shot-checks.ts`) compare each face in the take with the face in the same place in the result and flag anyone who changed. The result is stored like a recast's checks. Re-staging moves everyone in frame, so it gets no same-spot check.

## Check runs

All through the development relay, at 768×432 or smaller, two-second clips. Times are wall clock on a warm worker; the first swap on a cold worker took about 500 s.

| Run                                                          | Time        | Result                                                                                                                                                                           |
| ------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swap a table lamp for a brass lantern                        | 55 s        | Lantern in place and lit; about 5% of pixels differ from the take, faces identical (checks: 98%)                                                                                 |
| Same swap through the app's job worker                       | under 3 min | Same result, stored and shown in the wipe viewer                                                                                                                                 |
| Restyle a daytime cafe to lamp-lit evening (style image)     | 21 s        | Look follows the reference; faces drift slightly, as the composer warns                                                                                                          |
| Re-stage the couple-at-a-wall take, swing left (2 s, 512 px) | 63 s        | A new viewpoint with the same performance; the man's back and the background behind him are filled in cleanly. The woman is partly hidden behind him, as she would be from there |
| Push in, harbour at dawn, 2 s, 512 px                        | 49 s        | A clean dolly-in                                                                                                                                                                 |

An earlier swap used the AILab `SAM3Segment` node, which marked about 78% of the frame as the object and let the people drift. Core `SAM3_VideoTrack` with the `sam3.1_multiplex_fp16` checkpoint finds the object in about 11 s for 49 frames.

`scripts/ltx-graph.ts` runs any of the graphs without the job worker; `apps/jobs/test/revision-modes.test.ts` checks the requests and their wiring.

## Limits and licences

- Only the first four seconds of a take are revised.
- Every LoRA is Lightricks' own; models and licences are listed in [third-party-ip.md](third-party-ip.md).
- Object Swap depends on SAM 3 finding the object by a short noun. If it finds nothing, the result is the take unchanged.

## Custom IC-LoRA ideas

- An object-swap IC-LoRA conditioned on the take, the object's mask and a reference image, to drop the separate keyframe and composite steps.
- A restyle IC-LoRA that reads a style reference directly, so faces keep their likeness while the look changes.
- A re-staging IC-LoRA of our own on LTX 2.3 for orbits and reverse shots, beyond what re-projection reaches ([restage-ic-lora.md](restage-ic-lora.md)).
