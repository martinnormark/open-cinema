# Competition submission plan

Our entry to Comfy's [Open Source Higgsfield](https://comfy.org/open-source-higgsfield) competition. Rules, dates and prize conditions are summarised in [competition.md](competition.md) (verified 2026-10-16); re-check the landing page before submitting. Direction comes from [issue #1](https://github.com/martinnormark/open-cinema/issues/1) and the roadmap in [issue #2](https://github.com/martinnormark/open-cinema/issues/2).

**Deadline: October 30, 2026, 9:00am Pacific (17:00 Copenhagen).** One submission per person, through the [entry form](https://form.typeform.com/to/V1dSQrkS).

## The pitch in one sentence

Open Cinema is an open, Comfy-powered Cinema Studio: build a cast, a place and the things in it once as Elements, direct them across stills and video, then replace a shot's background or recast a character while the performance and everything else you approved stays put.

## Prize targets

| Target                      | Prize                       | Why we qualify, and what must be true                                                                                                                  |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Best Overall / Grand Prize  | $10,000                     | Automatic. Win on the complete journey: Elements → continuity across shots → selective revision, in a polished, runnable open-source app.              |
| VFX Workflow Built with LTX | $2,000                      | LTX must be the **core video model**. Shot generation uses `ltx/ltx-2-5-*`; keep LTX central in the demo and say so explicitly.                        |
| Most Viral                  | RTX 5090                    | A 30-second, share-first cut (issue #1): one character, three locations, then a live recast. Post natively on X and TikTok with #OpenSourceHiggsfield. |
| Built with FLUX             | Up to $1,000 in API credits | FLUX 3 (`bfl/flux-3-image`) is the core image model for Elements and stills. Mention it by name in the video.                                          |
| Most Innovative (stretch)   | RTX 5090                    | Only if we can state the innovation crisply: Elements that carry identity and approved references into any workflow via `@` mentions, not prompt text. |

Not targeted: **Open Weights Only** (we use partner models through Comfy Router) and **MiniMax H3**.

## Demo video

**Current cut: [open-cinema-demo.mp4](media/open-cinema-demo.mp4)** (1:58, 1152×720, 2.3 MB). The full-quality master is `demo/open-cinema-demo.mp4` (1440×900) in the project's shared files, beside `demo/build-demo.sh`, which rebuilds it with ffmpeg.

It is cut from the live MVP journey recording of 2026-10-17 and the evidence clips, with title cards and burned-in captions instead of voice-over. No credits were spent on it. It follows the script below beat for beat, with these differences:

- The cast and place are **@Theo** and **@KeepersCottage**, the Elements made in that run, not @Mara, @Harbor and @Roadster.
- It opens on the source, background and recast side by side instead of a three-shot sequence, because no finished multi-shot sequence exists yet.
- The background beat shows the Kling 3.0 Omni result in the app, followed by the LTX 2.5 Alpha Gen before, matte and after clip run on Comfy Cloud.
- It adds a short Character states beat (@Cal, wet, injured) and ends on the how-it-is-built card and the repository URL.
- The README and Settings screens from the last beat are not in it.

The README's [example outputs](../README.md#example-outputs) carry the stills and short clips (before/after revisions, Alpha Gen matte, comparison viewer, Character states, LTX clip).

## Two-minute demo script

Target 1:50. Screen recording of the deployed studio at 1440×900, cursor visible, real generations (cut waiting time, never fake results). Voice-over in plain language; captions burned in for silent autoplay.

| Time      | On screen                                                                                                                 | Voice-over                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:08 | Finished 10-second sequence: the same character in three shots.                                                           | "Same character, same coat, same car, three different shots. Made in Open Cinema, an open studio built on Comfy."                   |
| 0:08–0:28 | Elements: create **@Mara** (Character), curate front, profile and close-up references; add **@Harbor** and **@Roadster**. | "Instead of re-prompting every time, I build my world once. Elements keep a curated reference sheet: these views are Mara."         |
| 0:28–0:48 | Studio: "@Mara beside @Roadster at @Harbor, just before sunrise." FLUX 3 stills appear; save one as a reference.          | "I mention Elements by name. FLUX 3 renders the shot from the approved references, not from a description."                         |
| 0:48–1:08 | Animate the approved still with LTX; Activity and Orb show live progress; play the clip.                                  | "The still becomes a shot with LTX as the core video model. Jobs are durable: close the tab and they keep running."                 |
| 1:08–1:28 | Revision: replace the background with @Harbor at dusk; wipe-compare original and result across the clip.                  | "Now change one decision. Move the scene to dusk. The performance, timing and camera move stay exactly as approved."                |
| 1:28–1:42 | Recast: replace the person on the left with @Mara; side-by-side comparison; keep the variant.                             | "Or recast. Mara takes over the performance; everyone and everything else is preserved, and the original is always one click away." |
| 1:42–1:50 | README on GitHub, MIT license, Settings showing the Comfy key; end card with repo URL and hashtag.                        | "It's open source and runs on your own Comfy key. Clone it, run two commands, start directing. #OpenSourceHiggsfield"               |

How it was built (required in the video; keep to one caption line per point during 1:42–1:50, or a 10-second card if time allows): TanStack Start on Cloudflare Workers, a Durable Object per creator coordinating Comfy Router jobs, FLUX 3 for images, LTX for video, R2 for media you keep.

Only show capabilities that work end to end on the day of recording. If recast or background replacement is not convincing on representative footage, cut that beat rather than choosing a single favourable example (roadmap guardrail).

## The 30-second viral cut

Hook in the first two seconds: the recast happening live on a split screen. Then three fast shots of the same Element in different places, then the end card. Vertical 9:16 export for TikTok/Reels, 16:9 for X and YouTube.

## Submission checklist

Status as of this document; update it as items land.

- [x] Public GitHub repository with application code
- [x] Open-source license ([MIT](../LICENSE))
- [x] Setup instructions a stranger can follow ([README](../README.md))
- [x] Uses Comfy Router through the official Comfy SDK
- [x] Workflow files for each supported capability committed alongside the code: [`workflows/`](../workflows/README.md). Every Comfy Cloud graph is generated from the app's code into `workflows/cloud/` (a test fails on drift), checked against Cloud's node catalogue and opened in the ComfyUI editor; the Kling graphs sit beside them
- [ ] Deployed instance behind [Cloudflare Access](auth.md), with a demo account or public read-only gallery for judges
- [x] Example outputs in the [README](../README.md#example-outputs) (stills, LTX clip, before/after revisions); a finished multi-shot sequence is still missing
- [ ] Demo video, ≤ 2:00, explaining how it was built and naming FLUX 3 and LTX: a [captioned cut](media/open-cinema-demo.mp4) exists (1:58); re-record on the deployed studio with voice-over before submitting
- [ ] Social post with #OpenSourceHiggsfield; link captured for the form: drafted in [competition/social-post.md](competition/social-post.md) (short, thread, carousel, Reddit); not posted
- [ ] Entry form submitted before the deadline: answers drafted in [competition/entry-form.md](competition/entry-form.md) from the live form's questions; Martin fills in personal details, the video and post links, and the agreements

## Judge access

Judges should not need a Comfy key. Options, in order of preference:

1. A deployed instance with an Access policy that admits judges by one-time email PIN, funded by our Comfy credits with a per-day budget we monitor.
2. A public gallery of saved results and comparisons that needs no sign-in, alongside the repository's local setup.

Record the deployment URL and Access policy here once it exists.
