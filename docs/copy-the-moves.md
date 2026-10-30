# Copy the moves (`video.performance-transfer`)

A clip supplies the motion (a dance, a stunt, a gesture) and one of your Characters performs it, in the clip's own place or in one of your Locations. It is a revision mode, so it opens from the front page or the revision studio like the others, and the original clip stays beside the result.

The idea comes from Higgsfield's "Genjutsu" and the open-source [Open Photon](https://github.com/WojciechJelen/open-photon) take on it. We did not copy either. Higgsfield sells "Genjutsu" and "Genjutsu Lite" under its own names; they are reported to be Seedance 2.5 and Wan 3.0 renamed. Open Cinema names the model that runs instead, every time:

- **Before the run**, the studio's engine choice shows each model by its own name, who makes it, whether its weights are open, and where it runs. The summary above the button repeats it with the price.
- **On the result**, "Made with" names the model the job recorded, its maker, open or hosted, and where it ran.
- **In Activity**, every job, in every mode, reads like "Wan 3.0 by Alibaba (Tongyi Wan), hosted, via Comfy Router" (`modelCredit` in `packages/contracts/src/model-cards.ts`).

## How it works

| Step         | What happens                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The moves    | Up to 10 seconds. A longer clip shows a band under the player; drag it to choose the stretch (4, 6, 8 or 10 s). The stretch is cut in the browser with Mediabunny and saved to the library as its own clip, so only that stretch is sent and billed and the compare view lines up. Browsers without an H.264 encoder (open-source Chromium) copy from the keyframe before the stretch instead. |
| Who performs | A Character with approved references (required). Their close portrait and sheet go to the model as images.                                                                                                                                                                                                                                                                                     |
| Whose moves  | Optional words such as "the dancer in the middle" when the clip has several people. Everyone else stays. Or tag people on the frame (below).                                                                                                                                                                                                                                                   |
| New place    | An optional Location. Without one, the clip's own place, light and people stay.                                                                                                                                                                                                                                                                                                                |
| Model        | Wan 3.0 (default) or Wan Animate 2, and the output size.                                                                                                                                                                                                                                                                                                                                       |

## Tagging people on the frame

For clips with several people, nobody has to describe who is who:

1. Pause on a frame where someone (or something, such as the ball) is clear and click them. They become `@person1` (then `@person2`, up to four), pinned on that frame.
2. The pose model already used by Recast's shot check (MoveNet in a worker, `cutOutPerson` in `shot-checks-client.ts`) looks for a person under the click and shows their cut-out in the People list. When it finds one, their box goes with the run.
3. The words gain "Replace @person1 with @", with the caret after the `@`, so the Character list opens straight away. `@person1` is offered in the same list, and so are your Things once something is tagged.
4. The words decide the pairs, in either order ("Replace @person1 with @Cal", "@Cal takes over from @person1"). `castFromWords` in `clip-people.ts` reads them, and the People list shows how they were read ("Becomes Cal", or "Stays as filmed").

The run sends each swap as `cast` (`castSwapSchema`): the tag, the Character or Thing, the click (moved into the time of the stretch that is sent) and the pose model's box when it found a person. Nothing else about tracking reaches the studio. Tagging is Wan 3.0 only; Wan Animate 2 copies one person.

### SAM 3.1 tracks who is who (Comfy Cloud)

Tagged runs are one Comfy Cloud graph, `comfy-cloud/sam3-wan3-cast` (`packages/comfy/src/workflows/wan3-cast.ts`, exported as `workflows/cloud/moves/sam3-wan3-cast.api.json`), recorded as "SAM 3.1 + Wan 3.0":

1. **Segment.** SAM 3.1 (`sam3.1_multiplex_fp16.safetensors`, Comfy's core `SAM3_Detect`) segments each tag on the frame it was tagged on, from the click and, for a person, their box. A click alone segments only what is under it: on a defender's back it took the shirt number. The box makes it the whole person; a ball needs only the click. A pose box can stop at the chin, though, and then SAM still takes only the shirt (2026-10-30, a chest click on a footballer). For recasts the studio therefore also sends a second click on the person's head, found by the pose model on the clicked frame; click plus head gave the whole person in every combination tried, with or without a box.
2. **Lock.** `SAM3_VideoTrack` follows each of them through the clip, forwards from that frame and, on the reversed frames, back to the start, so every tag keeps one track for the whole stretch. People tagged on the same frame share a pass each way. Tracking runs at about 0.4 megapixels.
3. **Name.** The tracks become a "who is who" video: the clip with each tagged subject filled in its own flat colour (red, blue, yellow, magenta, in the order of the swaps). That colour is the stable identifier the prompt uses ("Person 1, filled in red in Video 2, becomes Cal"), in place of a cut-out from one frame (`wan3TrackedCastPrompt` in `moves.ts`). The prompt says the colours only show who is who.
4. **Swap.** Comfy's own Wan 3.0 partner node (`Wan3ReferenceToVideoApi`) runs inside the graph with the clip as Video 1, the tracks as Video 2 and up to six reference images. With no cut-outs, each Character gets up to three views. Cloud uploads the media and polls Wan itself; the graph is submitted with the Comfy key as `extra_data.api_key_comfy_org`, which partner nodes bill.
5. **Sound.** The clip's audio goes under Wan's frames in the same graph, so there is no `dub` stage.

The partner node takes at most 15 s of reference video in all, so the tracks cover what the clip leaves, centred on the tags: all of a clip of 7 s or less, 4.7 s of a 10 s clip. Wan bills those seconds as read too.

Compared with the Router path it replaces, a tagged run is one Cloud job instead of a Router request plus a `dub` stage. The cut-outs are no longer uploaded before the run, which removes a step that could fail. Nobody is named by a single still, and Wan's long wait happens inside Cloud rather than on one Router request (Router timed out every three-swap run that sent nine images inline on 2026-10-22).

### Wan 3.0 (hosted, Comfy Router)

`wan/wan3.0-video` in reference mode. The clip goes as `reference_video` by URL, the Character's references (up to 3) and the Location's (up to 2) as `reference_image`s, and our own prompt refers to them as "Video 1", "Image 1" and so on (`wan3MovesPrompt` in `packages/comfy/src/workflows/moves.ts`). `prompt_extend` is off because Wan's rewriting drifted from the clip; Wan's own audio is off because a second stage, `dub`, lays the clip's own sound under the result on Comfy Cloud (`media-graphs.ts`). A silent clip skips that stage.

Pricing is published: 10.55, 21.1 or 42.2 credits per second at 480p, 720p or 1080p, billed on the seconds Wan reads **and** the seconds it makes. An 8-second stretch at 720p is 337.6 credits, $1.60.

### Wan Animate 2 (open weights, Comfy Cloud)

Our graph in `packages/comfy/src/workflows/wan-animate.ts`, built after Comfy's `video_wan_animate2` template:

1. FLUX 3 Klein makes the opening frame: the performer in frame 0 becomes the Character in the same pose, in the same place or in the Location.
2. Wan Animate 2 (int8, with Lightx2v's step-distill LoRA at 6 steps) moves that frame through the clip's frames in 81-frame windows that overlap by one frame. The first window is shortened so no window starts past the end of the clip, which `WanAnimate2ToVideo` refuses.
3. The clip's audio is laid under the frames.

It frames the result exactly as the clip and works best with one person in frame. Cloud bills it by GPU time; no per-run price is published.

All its weights are Apache 2.0 (Wan Animate 2, the distill LoRA, UMT5-XXL, Wan VAE) or MIT (CLIP ViT-H), plus FLUX 3 Klein under the FLUX licence, so it meets [third-party-ip.md](third-party-ip.md).

## Sound

The result keeps the clip's own soundtrack, untouched and in step:

- **The cut** copies the stretch's audio packets as they are (no re-encode), so a 12.3 to 20.3 s stretch carries exactly that sound. A browser pass that would drop the audio is never used.
- **Wan 3.0** makes silent video. The `dub` stage then lays the stretch's audio under Wan's frames on Comfy Cloud, at Wan's frame rate and length. Checked on 2026-10-22: 8.0 s of video and 8.0 s of audio, correlating 0.998 with the source's sound. Wan makes whole seconds only, so the studio cuts a clip of 7.6 s to 7 s rather than let Wan stretch it to 8 s out of step with the sound.
- **Wan Animate 2** renders exactly the stretch's frames and muxes its audio in the same graph (8.0 s and 8.0 s on the live run).
- A silent clip skips the `dub` stage and gives a silent result.

## Runs (2026-10-22)

All with Cal from the starter world. TikTok clips were downloaded with `scripts/tiktok-download.py` for internal testing only; they belong to their creators and are kept out of the repository ([footage-sources.md](footage-sources.md)).

| Clip                                                                                                                                   | Engine                                                 | Result                                                                                                                                                                                                                                                                                                                                             | Time              | Cost                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| Solo dancer on a terrace, 8 s                                                                                                          | Wan 3.0, 720p                                          | Cal is recognisable from his references and copies every step with the same timing and framing; the terrace stays. 720 × 1280 at 30 fps.                                                                                                                                                                                                           | 352 s             | 16 s billed, $1.60      |
| Same clip                                                                                                                              | Wan Animate 2                                          | Cal in the same pose and place from the Klein keyframe, every step followed, framed exactly as the source. 544 × 960 at 24 fps.                                                                                                                                                                                                                    | 165 s on Cloud    | GPU time                |
| Three dancers, 8 s, "the man in the middle", Location: a lighthouse                                                                    | Wan 3.0, 720p                                          | Only the middle dancer became Cal; the other two kept their faces and clothes and moved as filmed, now on the lighthouse rocks. Wan also dropped the clip's burnt-in caption.                                                                                                                                                                      | 382 s             | 16 s billed, $1.60      |
| A dancer generated with Wan 3.0 text-to-video, 8 s, Location: the Tide Mill                                                            | Wan 3.0, 720p, from the studio                         | Cal dances the routine step for step in front of the Tide Mill, the same beat and camera. 1280 × 720 at 30 fps.                                                                                                                                                                                                                                    | About 8 min       | 16 s billed, $1.60      |
| The viral vertical clip (a player in pink beating defenders), tagged: the player in pink, and two defenders who come in from the right | Wan 3.0, 720p, in 0–6, 4–10 and 9–15 s stretches       | Cal took the player in pink's place in every run. The defenders were less reliable: one run turned the defender who chases her into Chef Bruno and the sliding one into Grandma Dot, as tagged; another gave the sliding defender Dot's curlers on a white kit and left Bruno out. Tag people on a frame where they are large and clear of others. | 4.5 to 6 min each | 12 s billed, $1.20 each |
| Each clip above                                                                                                                        | Seedance 2.5 (`byteplus/dreamina-seedance-2-5-260628`) | Refused three times with `content_policy_violation`: the real clip with portrait and sheet, the real clip with the sheet only, and an AI-generated dancer. Seedance refuses references of real-looking people, so it is not offered.                                                                                                               | 13–19 s           | Not charged             |

### Tracked run (2026-10-23)

The football clip, 0 to 6 s, at 720p: the player in pink tagged as Cal, the defender as Chef Bruno and the ball as the Storm Lantern, all on the frame at 1.5 s.

- **Tracks** (SAM 3.1 on Cloud, prompt `61adcebe`, 19 s): all three kept one track for the whole stretch, including the ball in the air and the defender before the frame he was tagged on.
- **Swap**: this cloud container cannot hand a Comfy key to a Cloud graph, so the Wan step was sent by hand with the same request the partner node sends (`/proxy/wan/...` through api.comfy.org, the clip and the tracks as reference videos). It finished in 513 s. Cal took the player's place for the whole stretch with the same timing and framing. The ball was the Storm Lantern while the tracks covered it (they then stopped at 5 s, which is why they now cover all of a short clip). The defender gained Bruno's toque and neckerchief but kept his kit. No flat colour reached the result.
- The whole graph, with Wan inside, has not run end to end on Cloud yet: that needs a deployment (or a local `.dev.vars` key) whose key reaches `extra_data`.

## What we found on the way

- **Comfy Cloud renamed FLUX 3 Klein** to `flux3-image-klein-int8-convrot.safetensors` on 2026-10-22. Cloud then reported Object Swap, Restyle and the Wan Animate keyframe as "success" while silently skipping every node after the missing model. All graphs now use the new name, and `scripts/validate-workflows.ts` checks it.
- **Wan 3.0 takes a 31-bit seed.** Our usual 32-bit seed hash made Router answer 422; the moves request now keeps the seed below 2³¹.
- **LTX 2.3 Union Control**, the previous attempt at this ([performance-transfer.md](performance-transfer.md)), stays in the code for runs made with it but is no longer offered: faces drifted once the head turned.

## Limits

- 2 to 10 seconds per run. Longer clips need several runs, one stretch each. Wan 3.0 itself takes 15 s, but Router timed out both 15 s runs with three swaps (2026-10-22), so the studio stays at 10.
- Up to four tagged people and three swaps per run. A pin marks one frame; tag someone where they are clear, not mid-blur.
- Wan 3.0 is a hosted model with closed weights; its output follows Alibaba's terms.
- Wan Animate 2 copies one performer; in a group clip the others can soften.
- Use clips you have the rights to. The studio says so above the button.
