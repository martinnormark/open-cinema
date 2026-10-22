# Known limitations

Capabilities that work end to end but are not good enough yet, and are
deliberately deferred. Each entry says what falls short, what was tried and
what would change the decision. They stay in the app or the code as they are;
new work on them waits until a better model, node set or workflow is found.

## Character performance transfer and character replacement (deferred)

> **Update 2026-10-22:** performance transfer is no longer deferred. It ships as
> [Copy the moves](copy-the-moves.md) on Wan 3.0 (Router) and Wan Animate 2
> (open weights on Cloud), which hold a Character's face through turns. The
> notes below still describe the LTX attempt and character replacement.

Decided by the project owner on 2026-10-17: the results are not good enough.
Finding a better model, node set or workflow is deferred to later.
On the same evening the owner also took character replacement out of the MVP
release gate (roadmap #2, issue #6): the MVP ships with Elements and
background replacement, and recast stays in the app as an experimental mode
with its guardrails. The adapter that could change this is issue #15
(identity IC-LoRA), together with #12 (recast IC-LoRA).

Both features put a saved Character into someone else's performance:

- **Reuse a performance** (`video.performance-transfer`): a new clip where the
  Character performs a take's motion ([performance-transfer.md](performance-transfer.md)).
- **Character replacement** (`video.character-replace`): the Character replaces
  one person inside the take ([phase0-recast.md](phase0-recast.md)).

What falls short:

- **Identity does not hold.** Hair colour and clothes carry, but the face softens
  and drifts once the head turns. LTX 2.3 Union Control reads only structure from
  the take, so the face comes from frame 0 and the prompt. The all-LTX recast
  experiment measured a median likeness of 0.22 against 0.52 for Kling
  ([recast-ltx.md](recast-ltx.md)).
- **Build follows the original performer.** Performance transfer now traces the
  take's edges (no third-party weights), so the outline and build lean toward the
  original actor.
- **Kling recast works only in a narrow envelope:** a clearly visible target with
  a medium or larger face, wearing the Character's reference outfit. It ignores
  "keep the original clothing" and fails on back views and small faces.
- **Low resolution.** Performance transfer is capped at 768 px and four seconds
  to keep runs cheap, and faces are soft at that size.

What was tried: Kling 3.0 Omni video edit (shipped for recast, with guardrails),
an LTX 2.5 recast graph with Lightricks' adapters (not wired in), and LTX 2.3
Union Control with a pose skeleton and then with edges (registered, no composer
UI). The competition rule against relying on other people's IP rules out
community LoRAs and third-party pose and depth weights.

What would change the decision:

- An identity-preserving IC-LoRA trained by us on our own Character sheets
  (proposals in [recast-ltx.md](recast-ltx.md#proposal-our-own-recast-ic-lora)
  and [performance-transfer.md](performance-transfer.md#what-a-custom-ic-lora-fine-tune-could-fix)).
- A hosted model on Comfy Router that keeps a reference face through turns.
- A second, upscaled pass that sharpens faces, if identity is otherwise right.

Until then, neither feature should feature in demos or the competition entry as
a strength, and no new work goes into them without a new candidate to test.
