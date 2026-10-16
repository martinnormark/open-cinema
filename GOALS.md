# Open Cinema — Product Vision and Goals

Open Cinema is an open creative studio for turning ideas into images, films, and reusable worlds. A creator should be able to imagine a character, find their look, place them somewhere, give them something to do, and keep directing that same world across many generations.

Our ambition is to give an individual creative the continuity and control of a production studio, with the immediacy of writing down an idea.

This document defines the intended product, not capabilities already implemented or a delivery schedule. It builds on [issue #1](https://github.com/martinnormark/open-cinema/issues/1) and develops its Elements library into the foundation of the creative experience. Implementation decisions belong in [ARCHITECTURE.md](ARCHITECTURE.md).

## Who we serve

We serve filmmakers, visual storytellers, designers, and artists who know what they want to explore but should not need to become experts in generation infrastructure. Their scarce resource is creative attention. Our job is to keep that attention on ideas, taste, and direction.

The product is a web app built on ComfyUI's SDK and workflow ecosystem, with an initial emphasis on Flux for images and LTX for video. We aim to deliver an excellent, opinionated experience with these model families while keeping creators' worlds useful as models and techniques evolve.

## The creative loop

**Express an idea → explore directions → choose what works → save reusable Elements and creative recipes → direct and refine images and videos.**

A creator can begin with a few thoughts, uploaded reference images or videos, or an existing Element. They can compare interpretations, refine a promising direction, and save selected results to its reference sheet. Exploration remains fluid; saving is an intentional decision about what should carry forward.

Every successful session should leave the creator with both useful work and a stronger foundation for the next session.

## 1. Make creative intent the primary interface

Creators should be able to write naturally, explore an unfinished thought, and steer the result through familiar visual concepts: subject, composition, lighting, movement, mood, and style.

The studio translates those intentions into suitable ComfyUI workflows, references, and model capabilities. It offers strong defaults and useful guidance, with deeper controls available as the creator needs them. Workflow graphs, node wiring, and model configuration should never be prerequisites for the core creative journey.

When an idea spans several shots, the studio should help develop it into visual beats and a proposed shot sequence using the creator's Elements and project direction. Creators can revise the plan, compare alternatives, and approve individual shots while retaining authorship of the story.

**Success looks like:** a first-time creator moves from a rough idea to a result worth keeping without learning how a ComfyUI graph works.

## 2. Make Elements the reusable vocabulary of a creative world

An **Element** is a named, reusable creative entity with an identity, a curated reference sheet, and optional states. Characters, Locations, and Things are its foundational types. Things include props, vehicles, clothing, products, and other objects.

Creators author an Element in one place and refer to it anywhere they generate through `@` mentions. A mention carries the selected Element's identity and references into the generation; it is more than a shortcut for inserting its name into a prompt. Multiple Elements should compose naturally in the same scene.

For example: “Show @Mara wearing @RedCoat beside @Roadster at @Harbor, just before sunrise.” The creator can then ask for a closer shot or animate the moment while retaining those choices.

**Success looks like:** a creator establishes a cast, a setting, and a collection of Things once, then uses them throughout a body of work without repeatedly uploading references or reconstructing prompts.

## 3. Give every Element an opinionated authoring experience

Each Element type needs guidance appropriate to what makes it recognizable. Its reference sheet is a curated visual definition that actively informs future generations.

| Element | What authoring should establish |
| --- | --- |
| Character | A recognizable face, body proportions, distinguishing features, and appearance across front, profile, rear, and three-quarter views; detailed face close-ups and expressions that preserve identity. |
| Location | Spatial layout, landmarks, materials, scale, and atmosphere; establishing views and alternate viewpoints that describe the same coherent place. |
| Thing | Shape, proportions, materials, construction, and distinctive details; multiple angles and close-ups sufficient to recognize and use the same object again. |

The studio should help creators identify missing views, generate complementary references, and reject contradictory results. It should apply suitable reference conditioning, identity preservation, and other consistency techniques behind the scenes. Uploaded images and videos are starting material; creators choose which evidence becomes part of the approved reference sheet.

**Success looks like:** changing the camera angle reveals another view of the same person, place, or object, and the creator can inspect and correct drift before it spreads into more work.

## 4. Let Elements change state while preserving identity

A world needs variation. States describe how an Element appears or behaves in a particular situation while preserving the attributes that make it the same Element.

- **Characters:** mood, expression, pose, wardrobe, and situational appearance.
- **Locations:** weather, time of day, season, year or era, and conditions such as inhabited or abandoned.
- **Things:** a car with its doors open or closed, a phone in standby or receiving a call, or an object pristine, worn, or damaged.

Creators should be able to explore a state, save its references, and select it when mentioning the Element. A temporary direction in one shot should not silently redefine its identity or approved defaults. Reusable clothing and props can remain independent Things associated with a character's state.

**Success looks like:** a creator directs the same character through different emotions, in the same location across changing weather, with objects that change state coherently.

## 5. Turn bespoke capabilities into creative building blocks

LoRA adapters and other specialized capabilities should be first-class, named, reusable building blocks. Creators should understand what a capability contributes, preview its effect, and combine it with appropriate Elements and creative directions.

A capability might establish a visual style, reinforce a particular identity, or enable a specialized effect. The studio should make its intended use, influence, and compatibility understandable and handle the underlying workflow configuration. Creators should not need to memorize filenames, trigger words, or node settings to reuse a technique they like.

Make inspiration directly usable through visual examples that show a source, alternative results, and what changed. A creator should be able to choose a treatment, supply their own Elements, and begin exploring without first writing a detailed prompt. Successful combinations of direction, reference roles, workflows, and adapters can become named **creative recipes** that creators save, adapt, and reuse with different subjects.

**Success looks like:** a distinctive visual treatment becomes something a creator can reliably apply across a project, with incompatible combinations identified before spending generation time.

## 6. Make images and video parts of one directing experience

A still image can establish a character, a location, a look, or a shot that becomes a video. Useful discoveries in video can become references for subsequent work. Elements, states, and visual intent should carry across both media.

Directing should cover framing, depth of field, lighting, camera movement, character performance, and pacing. Approachable choices such as intimate, uneasy, or energetic should lead to deeper controls when needed. Every exposed control or preset should produce a visible, tested difference with its supported workflow and communicate its limits.

Uploaded or generated footage can supply acting, choreography, timing, and camera movement. Creators should be able to reuse a performance with their own Characters and Locations, carry a still's approved look into motion, and extend a successful shot into a preceding or following moment. These capabilities must earn support through demonstrated continuity in the selected workflows.

Our quality bar is continuity across shots: recognizable subjects, coherent locations, deliberate movement, and a consistent visual language.

**Success looks like:** a creator makes a short sequence with multiple shots that feels like one directed scene, rather than a collection of unrelated generations.

## 7. Give every project a persistent creative direction

Elements define the world; project direction defines how we portray it. Creators should establish a shared palette, lighting approach, lens character, texture, and pacing once, then carry those choices across images and shots with deliberate overrides.

Keep identity, state, and portrayal distinct. A Location's historical period describes the world itself; a film-like visual treatment describes how that world is shown. Changing a project's look should not silently rewrite its Elements, and a shot-specific choice should not change the project's defaults.

**Success looks like:** a creator adds a new shot to an existing project and it belongs visually, without reconstructing the project's direction from earlier prompts.

## 8. Change one creative decision while preserving the rest

Selective revision is a core product promise. **Background replacement and character replacement in video are high-priority capabilities**, for both uploaded footage and generated clips. Creators should be able to improve or reinterpret a successful take without sacrificing the work they have already approved.

| Capability | Intended change | What the result must preserve |
| --- | --- | --- |
| Video background replacement | Replace the background or setting with a selected Location, its state, or a new direction. | Foreground characters and Things, their appearance and performance, timing, and camera movement; believable depth, edges, and interactions with the new setting. |
| Video character replacement | Replace a selected person with a chosen Character while retaining the source performance. | Other people, the background, unrelated Things, framing, camera movement, timing, and the selected person's action, pose, and expressive intent. |

For example: “Move this scene to @Harbor at dusk, keeping the performers and action,” or “Replace the person on the left with @Mara, preserving their performance and everything else in the shot.” Character replacement should work across the visible person, including face and body, with wardrobe choices made explicit.

Creators should be able to identify the target, specify what may change, and inspect the result against the original throughout the clip. Preservation must hold across movement, occlusion, and interactions. Necessary integration changes, such as contact shadows or lighting adjustments, should be intentional and scoped; unrelated parts of the shot should remain intact. Keep the original available so revisions can be compared, branched, and reversed.

The same principle extends to replacing props, changing clothing, and restyling scenes while retaining selected aspects of the source. Success requires both a convincing replacement and faithful preservation of everything outside the intended change.

**Success looks like:** a creator replaces a video's background, then separately recasts one character, and each version retains the original take's performance and all other approved choices.

## 9. Make creative progress durable and reproducible

Creators should be able to return to a result, understand what produced it, and deliberately continue or vary it. Approved Element references and states must be distinguishable from experiments, and later edits must not erase the context of earlier work.

Preserve the relevant inputs, Element versions, references, creative recipes, project direction and shot overrides, capabilities, model and workflow versions, and generation settings behind each result. Revisions should retain their source and the intended change. Reproducibility means retaining enough context to revisit a creative decision and generate controlled variations; exact pixel-for-pixel replay may depend on the execution environment.

The studio should make expected cost and time understandable before generation, show useful progress during it, and support recovery when work fails. Where relevant, resource requirements should be available to creators running their own infrastructure.

**Success looks like:** a creator returns weeks later and continues a project with its identity and creative decisions intact.

## 10. Build an open studio whose value compounds

Open Cinema should be publicly runnable, extensible, and grounded in the ComfyUI ecosystem. Creators should retain access to their media and reusable creative assets, and contributors should be able to improve workflows and introduce capabilities that benefit the whole studio.

Flux and LTX are our initial quality focus. Model independence is a long-term product goal: adopting a better model should preserve the creator's conceptual library, with clear explanations of capability differences and any references that need adaptation. We should earn support for additional models through proven creative outcomes.

**Success looks like:** improvements to the underlying generation technology make an existing creative world more useful, without requiring the creator to rebuild it from scratch.

## How we prioritize

Our first complete product journey is one creator building a Character, a Location, and a Thing; curating their reference sheets; mentioning them together; exploring saved states; and producing related images and a short video with recognizable continuity.

Video background replacement and character replacement are explicit priorities in the initial product direction. Prove each on representative footage early, including moving cameras, multiple people, and partial occlusion. Assess replacement quality and preservation of the rest of the shot separately. These capabilities take precedence over expanding the catalog of decorative effects or presets.

We prioritize the quality of that journey before breadth of models, presets, or effects. A general-purpose node editor, a comprehensive film-editing suite, and a marketplace are outside the initial focus. The competition in issue #1 provides an opportunity to demonstrate the product; the enduring vision is a studio creators return to for their own work.

Our north-star outcome is **creators repeatedly completing work they choose to keep using Elements they have already established**. We will judge progress through time to a first saved result, successful Element and recipe reuse, consistency across viewpoints and states, the effort required to obtain a usable shot, the ability to complete a coherent sequence, and successful selective revisions without unintended changes elsewhere in the clip.

The decisive demonstration is a short film in which the same character, location, and Things remain recognizable across different angles, moods, and conditions. The creator can show how ordinary creative direction and a curated Element library produced it, then replace a shot's background or recast a character while preserving the performance and remaining approved work.
