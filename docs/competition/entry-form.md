# Entry form draft

> Deployment update (2026-10-30): the application now runs entirely in Docker with Bun, SQLite and private file storage. Infrastructure references and earlier verification results below describe the previous implementation. Use [deployment](../deployment.md) and [architecture](../../ARCHITECTURE.md) for current setup.

Answers for the [Open Source Higgsfield entry form](https://form.typeform.com/to/V1dSQrkS), in the form's order, ready to paste. The questions were read from the live form on 2026-10-17; re-check them before submitting. Answers describe `main` on 2026-10-17. **Fields marked "Martin" only Martin can fill in.** One submission per person; deadline **October 30, 2026, 9:00am Pacific** (17:00 Copenhagen).

## Tell us about yourself

| Field                                     | Required | Answer                                                                            |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| Name ("This is how you will be featured") | Yes      | **Martin**                                                                        |
| Comfy app Email                           | Yes      | **Martin**: the email of the Comfy account (results and prize shipping go there). |
| Country                                   | Yes      | **Martin**                                                                        |
| Social handles (X, IG, LI, TT, YT, etc.)  | No       | **Martin**                                                                        |
| Discord username                          | No       | **Martin**                                                                        |
| Reddit username                           | No       | **Martin**                                                                        |

**How familiar were you with ComfyUI before this challenge?** (required, one of: Never used it / Tried a few times / Used it regularly / Use it professionally / I build custom nodes or contribute in other ways): **Martin**.

## Tell us about your project

**Project name/title** (required)

> Open Cinema

**One-line description** (required, 100 characters or less)

> Cinema Studio on Comfy: build your cast once, then recast or reshoot a take and keep the performance

100 characters. Alternatives:

- `Build your world of Elements once, then direct it across stills and video, one decision at a time` (97)
- `Open-source Cinema Studio on Comfy: reusable Elements, LTX video, edits that keep the performance` (97)

## Submission links

| Field                                                                 | Required | Answer                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo URL (public, open-source license, setup)                  | Yes      | https://github.com/martinnormark/open-cinema (MIT; setup in the README). **Confirm the repository is public before submitting.**                                                                                                                                                          |
| Demo video URL (under 2 minutes, the build and how you built it)      | Yes      | **Martin**: upload the final cut (YouTube unlisted or the social post's video) and paste its URL. The current captioned cut is [`docs/media/open-cinema-demo.mp4`](../media/open-cinema-demo.mp4), 1:58; the submission plan wants it re-recorded on the deployed studio with voice-over. |
| Live link to try it (optional, not shared publicly, expect 5–10 runs) | No       | **Martin**: nothing is deployed yet. Once deployed behind Cloudflare Access ([auth.md](../auth.md)), paste the URL and the way judges get in. Leave blank otherwise.                                                                                                                      |
| Social post link tagging #OpenSourceHiggsfield                        | Yes      | **Martin**: post one of the [drafts](social-post.md) and paste its URL.                                                                                                                                                                                                                   |

**Which parts of ComfyUI did you use?** (required, any of: Comfy API, Comfy Router, Comfy SDK, Comfy Cloud Agent, Comfy Local Agent, Comfy MCP)

> Comfy API, Comfy Router, Comfy SDK

Router serves FLUX 3, LTX 2.5, Kling 3.0 Omni, Bria and the shot planner; the jobs Worker uses the official TypeScript SDK (`@comfyorg/sdk`); the open-weights graphs run through Comfy Cloud's API. No agent or MCP product is used.

**List all generative models used?** (required, short text)

> FLUX 3 Image, FLUX 3 Video, LTX 2.5 Fast/Pro, LTX 2.5 22B + Alpha Gen IC-LoRA, LTX 2.3 22B + Union Control and In-Outpainting IC-LoRAs, LTX-2 19B + camera-control LoRAs, Kling 3.0 Omni, Bria video background removal, FLUX.2 Klein 9B, SAM 3.1, MoGe-2, Claude Sonnet 5.5 (shot planning)

The field is a single line; if it is cut short, keep the first nine. Full list with licences: [third-party-ip.md](../third-party-ip.md). SwitchX (Beeble) was measured during the background evaluation but is not the default path; add it only if Martin wants every model ever called listed.

**Other tools or techniques used** (optional, long text; the form says it matters most for Most Innovative)

> **What it is.** Open Cinema is an open-source creative studio in the spirit of Cinema Studio. You build your world once as Elements (Characters, Locations and Things), each with a reference sheet you approve and optional states such as wet or injured. You mention them with @ anywhere you generate, and the mention carries the approved references into the workflow, not just a name in the prompt. Then you direct: stills with FLUX 3, video with LTX, shots planned from an idea into a sequence. When a shot is nearly right you revise one decision, a new background or a different actor, and the performance, timing and camera move stay as shot. Every revision is compared with its original in a synced wipe viewer before you keep it.
>
> **The innovation.** Elements as a reusable vocabulary that flows into any workflow through @ mentions, and selective revision that treats the take as sacred. Background replacement has two paths: Kling 3.0 Omni with a Comfy Cloud graph that re-times the edit onto the take's exact frame grid and locks the original performers back over it with Bria's matte, and an LTX 2.5 graph built around Lightricks' Alpha Gen IC-LoRA that generates a matte and composites the take's own pixels over a new FLUX 3 plate, so the actors are never repainted. Re-stage is our own graph: MoGe-2 depth re-projects each frame to a nearby camera and Lightricks' In-Outpainting IC-LoRA on LTX 2.3 fills only what the new camera sees.
>
> **How it is built.** TanStack Start and React on Cloudflare Workers. A Durable Object per creator coordinates every Comfy job: idempotent submission, checkpoints and alarms, polling, and live progress over hibernatable WebSockets, so jobs survive closed tabs and restarts. Results are copied to R2 before a job is marked ready; D1 with Prisma holds metadata. Router calls go through the official Comfy TypeScript SDK; open-weights pipelines are ComfyUI API graphs built in TypeScript and run on Comfy Cloud. Every one of those graphs is committed as a ComfyUI workflow file (`workflows/cloud/`), generated from the code the app submits, with a test that fails if they drift; they load in the ComfyUI editor. Browser-side work (posters, square pixels, face checks that flag a recast of the wrong person) runs on device.
>
> **Rules we set ourselves.** No LoRA made by anyone else: every adapter is Lightricks' own (audit in `docs/third-party-ip.md`). Every revision keeps its original one click away.

About 2,400 characters. Trim the Re-stage sentence first if a limit appears.

**Which category or categories does your submission best fit?** (required, any of: Most Innovative, Most Viral, Open Weights Only, Built with FLUX 3 Bonus, VFX Built with LTX Bonus)

> Most Innovative, Most Viral, Built with FLUX 3 Bonus, VFX Built with LTX Bonus

Not Open Weights Only: recast, image generation and text-to-video use partner models through Router. Best Overall needs no box; every entry is considered. Most Viral depends on the social post; drop it if the post is not the 30-second cut. For the LTX bonus, the demo must show LTX as the core video model; today's demo cut shows the background beat on Kling first and the LTX Alpha Gen clip after it ([competition-submission.md](../competition-submission.md#demo-video)).

**Is your stack fully open?** (required, Yes / No / Not sure; "Yes means every model, node and dependency is open-weights or open-source, with no closed API model in the critical path")

> No

The app's code and graphs are open source, but FLUX 3, LTX 2.5 through Router, Kling 3.0 Omni and Bria are closed API models in the critical path.

**Agreements** (required; all four must be ticked)

- [ ] My repo is public and includes an open-source license. **Martin**: confirm the repository is public; the MIT license is in place.
- [ ] My submission is lawful, SFW, and does not include any unlicensed IP or real peoples' likenesses without their permission. **Martin** to tick. No LoRA by another author is used. The demo and README examples use generated people: FLUX 3 Elements and the generated background-evaluation clips (the kitchen-table take is clip C4, [phase0-background.md](../phase0-background.md)). The recast evaluation also used five Mixkit stock clips of real people ([phase0-recast.md](../phase0-recast.md)); keep those out of the demo and post, or confirm Mixkit's licence covers it.
- [ ] I permit Comfy, NVIDIA, Runpod, and participating model partners to feature my work with credit across socials, blog posts, etc. **Martin** to tick.
- [ ] This is my only submission. **Martin** to tick.

**Anything else you want ComfyUI or our judges to know?** (optional, long text)

> Open Cinema runs locally with two commands and your own Comfy key (README). Everything shown in the demo is a real generation from the repository's workflows; nothing is retouched. Some modes are early: Object Swap, Restyle, Re-stage and camera moves have had short check runs on Comfy Cloud, and performance transfer runs as a graph without a composer yet. We tried recasting on LTX alone and documented why it is not the default yet (identity did not hold past a second; docs/recast-ltx.md). The ComfyUI workflow files for every Cloud graph are in workflows/, each validated against Comfy Cloud's node catalogue.

If a deployment exists by then, add one line on how judges get in and the daily spend cap.

## Before submitting

- [ ] Repository public, README setup re-tested from a fresh clone.
- [ ] Final demo video uploaded; URL works when signed out.
- [ ] Social post live with #OpenSourceHiggsfield; URL copied.
- [ ] Live link (optional) tested from a signed-out browser, with a spend cap.
- [ ] Re-read the [competition page](https://comfy.org/open-source-higgsfield) for rule changes.
