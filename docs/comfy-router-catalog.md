# Comfy Router model catalog

Listed **2026-10-16** with `comfy.models.list()` from `@comfyorg/sdk` 0.5.0 against `https://api.comfy.org` (249 models across 35 providers). The catalog entries carry only `id`, `provider`, `model`, and `billing`; inputs differ per model, so read each model's schema at `GET /v2/models/{provider}/{model}/openapi.json` (`comfy.models.schema(id)`) before building a request. Prices are not in the listing; see [pricing](https://docs.comfy.org/development/comfy-router/pricing).

Regenerate by iterating `comfy.models.list()` (it walks every page; a bare `GET /v2/models?limit=50` returns only the first page with `has_more: true`).

## Models relevant to OpenCinema workflow kinds

Input fields below were read from each model's published OpenAPI schema on 2026-10-16. `*` marks required fields.

| Workflow kind | Router model | Key inputs |
| --- | --- | --- |
| `image.flux` | `bfl/flux-3-image` | `*prompt`, `aspect_ratio` (auto, 21:9 … 9:21), `resolution` (768sq, 1k, 1.5k, 2k, 4k), `grounding` (default true), `safety_tolerance` 0–4. No seed. |
| `image.flux-reference` | `bfl/flux-3-image` | Same as above plus `images`: 1–10 reference images (https URL or base64) the prompt edits or draws from. Alternative: `bfl/flux-kontext-pro` (`input_image`, `input_image_2..4`, `seed`). |
| `video.ltx` | `ltx/ltx-2-5-pro`, `ltx/ltx-2-5-fast` | `*prompt`, `*duration` (2–20 s, enum), `*resolution` (1280x720, 1920x1080, … per model), `fps` (24, 25, 48, 50; default 25), `generate_audio` (default true). |
| `video.background-replace` | `bria/video-edit-replace-background` | `*video` (public URL), `*background_url` (image or video URL), `preserve_audio`, `output_container_and_codec`. Alternatives: `beeble/switchx` (`*source_uri`, `*generation_type`, `*alpha_mode`, `prompt`, `reference_image_uri`), `bria/video-edit-green-screen`, `bria/video-edit-remove-background`. |
| `video.character-replace` | `higgsfield/higgsfield-genjutsu-motion-transfer-v1.0` | `*video_url` (≥4 s, trimmed to 30 s), `*image_urls` (1–8 references for cast, location, style), `prompt`, `resolution` (480p, 720p, 1080p). Alternatives: `runway/aleph2` (`*videoUri` ≤30 s, `*promptText`, `promptImage`/`keyframes` ≤5), `bfl/video-edit-v1` (`*video` ≤15 s / 50 MiB, `*prompt`; preserves everything not named), `wan/wan2.7-videoedit`. |

Other video generators worth knowing: `bfl/flux-3-video` (`*mode` t2v/i2v/v2v/draft_enhance, `keyframes`, `duration` 5–20 s, `draft` previews), `wan/wan2.7-r2v` (reference-to-video), `veo/veo-3.1-*`, `kling/kling-v3*`, `byteplus/dreamina-seedance-*`. Upscalers: `bfl/video-upscale-v1`, `wavespeed/flashvsr`, `wavespeed/seedvr2`.

Source media must be reachable by the provider: most video models take a public https URL (some also accept base64 or data URIs). Private R2 objects need a short-lived signed URL at submission time, which must never be persisted in checkpoints or D1.

## Full catalog by provider

- **anthropic** (12): `anthropic/claude-fable-5`, `anthropic/claude-fable-5-1`, `anthropic/claude-haiku-4-5-20251001`, `anthropic/claude-opus-4-6`, `anthropic/claude-opus-4-7`, `anthropic/claude-opus-4-8`, `anthropic/claude-opus-5`, `anthropic/claude-opus-5-5`, `anthropic/claude-sonnet-4-5-20250929`, `anthropic/claude-sonnet-4-6`, `anthropic/claude-sonnet-5`, `anthropic/claude-sonnet-5-5`
- **beeble** (1): `beeble/switchx`
- **bfl** (14): `bfl/erase-v1`, `bfl/flux-2-max`, `bfl/flux-2-pro`, `bfl/flux-3-image`, `bfl/flux-3-video`, `bfl/flux-kontext-max`, `bfl/flux-kontext-pro`, `bfl/flux-pro-1.0-expand`, `bfl/flux-pro-1.0-fill`, `bfl/flux-pro-1.1`, `bfl/flux-pro-1.1-ultra`, `bfl/video-edit-v1`, `bfl/video-upscale-v1`, `bfl/vto-v1`
- **bria** (18): `bria/fibo`, `bria/image-edit-add-object-by-text`, `bria/image-edit-erase`, `bria/image-edit-erase-by-text`, `bria/image-edit-erase-foreground`, `bria/image-edit-expand`, `bria/image-edit-gen-fill`, `bria/image-edit-increase-resolution`, `bria/image-edit-relight`, `bria/image-edit-remove-background`, `bria/image-edit-replace-background`, `bria/image-edit-replace-object-by-text`, `bria/image-edit-reseason`, `bria/image-edit-restore`, `bria/video-edit-erase`, `bria/video-edit-green-screen`, `bria/video-edit-remove-background`, `bria/video-edit-replace-background`
- **byteplus** (17): `byteplus/dreamina-seedance-2-0-260128`, `byteplus/dreamina-seedance-2-0-fast-260128`, `byteplus/dreamina-seedance-2-0-mini`, `byteplus/dreamina-seedance-2-5-260628`, `byteplus/seed-2-0-lite-260228`, `byteplus/seed-2-0-mini-260215`, `byteplus/seed-2-0-pro-260328`, `byteplus/seed-audio-1.0`, `byteplus/seed-audio-1.0-multilingual`, `byteplus/seedance-1-0-pro-250528`, `byteplus/seedance-1-0-pro-fast-251015`, `byteplus/seedance-1-5-pro-251215`, `byteplus/seedream-4-0-250828`, `byteplus/seedream-4-5-251128`, `byteplus/seedream-5-0-260128`, `byteplus/seedream-5-0-flash-260915`, `byteplus/seedream-5-0-pro-260628`
- **elevenlabs** (5): `elevenlabs/eleven_multilingual_v2`, `elevenlabs/eleven_sfx_v2`, `elevenlabs/eleven_v3`, `elevenlabs/eleven_v4`, `elevenlabs/eleven_v4_turbo`
- **fal** (11): `fal/crystal-upscaler`, `fal/fal-gpt-image-2`, `fal/fal-gpt-image-2.5-flare`, `fal/fal-gpt-image-2.5-sunburst`, `fal/fal-nano-banana-2`, `fal/fal-nano-banana-pro`, `fal/fal-seedance-2.0`, `fal/fal-seedance-2.5`, `fal/h3-max`, `fal/h3-max-turbo`, `fal/patina`
- **freepik** (4): `freepik/ai-image-upscaler-precision-v2`, `freepik/ai-skin-enhancer-creative`, `freepik/ai-skin-enhancer-faithful`, `freepik/ai-skin-enhancer-flexible`
- **gemini-interactions** (2): `gemini-interactions/gemini-omni-1.1-flash`, `gemini-interactions/gemini-omni-flash-preview`
- **heygen** (1): `heygen/starfish`
- **higgsfield** (8): `higgsfield/higgsfield-genjutsu-motion-transfer-v1.0`, `higgsfield/higgsfield-kling-3-4k`, `higgsfield/higgsfield-kling-3-pro`, `higgsfield/higgsfield-kling-3-std`, `higgsfield/higgsfield-kling-3-turbo`, `higgsfield/higgsfield-seedance-2.0`, `higgsfield/higgsfield-seedance-2.5`, `higgsfield/higgsfield-wan-3`
- **ideogram** (4): `ideogram/ideogram-4-5`, `ideogram/ideogram-v3`, `ideogram/ideogram-v4`, `ideogram/p-image-ideogram`
- **kling** (10): `kling/kling-3.0-turbo`, `kling/kling-image-o1`, `kling/kling-v2-5-turbo`, `kling/kling-v2-6`, `kling/kling-v3`, `kling/kling-v3-omni`, `kling/kling-video-o1`, `kling/videos-avatar-image2video`, `kling/videos-lip-sync`, `kling/videos-video-extend`
- **krea** (5): `krea/krea-2`, `krea/krea-2-large`, `krea/krea-2-medium`, `krea/krea-2-medium-turbo`, `krea/krea-3`
- **ltx** (2): `ltx/ltx-2-5-fast`, `ltx/ltx-2-5-pro`
- **luma** (4): `luma/photon-1`, `luma/photon-flash-1`, `luma/ray-2`, `luma/ray-flash-2`
- **luma_2** (2): `luma_2/uni-1`, `luma_2/uni-1-max`
- **meshy** (7): `meshy/animations`, `meshy/meshy-5`, `meshy/meshy-6`, `meshy/meshy-7`, `meshy/meshy-7.1`, `meshy/remesh`, `meshy/rigging`
- **minimax** (1): `minimax/minimax-h3`
- **moonvalley** (3): `moonvalley/image-to-video`, `moonvalley/text-to-video`, `moonvalley/video-to-video`
- **openai** (24): `openai/gpt-4.1`, `openai/gpt-4.1-mini`, `openai/gpt-4.1-nano`, `openai/gpt-4o`, `openai/gpt-5`, `openai/gpt-5-mini`, `openai/gpt-5-nano`, `openai/gpt-5.5`, `openai/gpt-5.5-pro`, `openai/gpt-5.6-luna`, `openai/gpt-5.6-sol`, `openai/gpt-5.6-terra`, `openai/gpt-6-astra`, `openai/gpt-6-luna`, `openai/gpt-6-sol`, `openai/gpt-image-1`, `openai/gpt-image-1.5`, `openai/gpt-image-2`, `openai/gpt-image-2.5-flare`, `openai/gpt-image-2.5-sunburst`, `openai/o1`, `openai/o1-pro`, `openai/o3`, `openai/o4-mini`
- **openrouter** (1): `openrouter/chat-completions`
- **pika** (6): `pika/pika-2.5-image-to-video`, `pika/pika-2.5-text-to-video`, `pika/pika-gpt-image-2`, `pika/pika-nano-banana-2`, `pika/pika-nano-banana-pro`, `pika/pika-seedance-2.0`
- **pruna** (1): `pruna/p-video-2`
- **qwen** (2): `qwen/qwen-image-3.0`, `qwen/qwen-image-3.0-pro`
- **recraft** (16): `recraft/recraftv2`, `recraft/recraftv3`, `recraft/recraftv4`, `recraft/recraftv4_1`, `recraft/recraftv4_1_pro`, `recraft/recraftv4_1_pro_vector`, `recraft/recraftv4_1_utility`, `recraft/recraftv4_1_utility_pro`, `recraft/recraftv4_1_utility_pro_vector`, `recraft/recraftv4_1_utility_vector`, `recraft/recraftv4_1_vector`, `recraft/recraftv4_pro`, `recraft/recraftv4_styles`, `recraft/recraftv4_styles_pro`, `recraft/recraftv4_styles_pro_vector`, `recraft/recraftv4_styles_vector`
- **runware** (7): `runware/runware-gpt-image-2`, `runware/runware-gpt-image-2.5-flare`, `runware/runware-gpt-image-2.5-sunburst`, `runware/runware-nano-banana-2`, `runware/runware-nano-banana-pro`, `runware/runware-seedance-2.0`, `runware/runware-seedance-2.5`
- **runway** (3): `runway/aleph2`, `runway/gen4_image`, `runway/gen4_turbo`
- **synclabs** (1): `synclabs/sync-3`
- **tencent** (4): `tencent/hunyuan-3d-part`, `tencent/hunyuan-3d-smart-topology`, `tencent/hunyuan-3d-texture-edit`, `tencent/hunyuan-3d-uv`
- **veo** (3): `veo/veo-3.1-fast-generate-001`, `veo/veo-3.1-generate-001`, `veo/veo-3.1-lite-generate-001`
- **vertexai** (12): `vertexai/gemini-2.5-flash`, `vertexai/gemini-2.5-flash-image`, `vertexai/gemini-2.5-pro`, `vertexai/gemini-3-pro-image`, `vertexai/gemini-3.1-flash-image`, `vertexai/gemini-3.1-flash-lite`, `vertexai/gemini-3.1-flash-lite-image`, `vertexai/gemini-3.1-pro-preview`, `vertexai/gemini-3.5-flash`, `vertexai/gemini-3.7-flash`, `vertexai/gemini-3.8-flash`, `vertexai/gemini-nano-banana-2.1`
- **wan** (20): `wan/happyhorse-1.0-i2v`, `wan/happyhorse-1.0-r2v`, `wan/happyhorse-1.0-t2v`, `wan/happyhorse-1.0-video-edit`, `wan/happyhorse-1.1-i2v`, `wan/happyhorse-1.1-r2v`, `wan/happyhorse-1.1-t2v`, `wan/wan2.5-i2i-preview`, `wan/wan2.5-i2v-preview`, `wan/wan2.5-t2i-preview`, `wan/wan2.5-t2v-preview`, `wan/wan2.6-i2v`, `wan/wan2.6-r2v`, `wan/wan2.6-t2v`, `wan/wan2.7-i2v`, `wan/wan2.7-r2v`, `wan/wan2.7-t2v`, `wan/wan2.7-videoedit`, `wan/wan3.0-video`, `wan/wan3.0-video-prime`
- **wavespeed** (10): `wavespeed/flashvsr`, `wavespeed/seedvr2`, `wavespeed/ultimate-image-upscaler`, `wavespeed/wavespeed-gpt-image-2`, `wavespeed/wavespeed-gpt-image-2.5-flare`, `wavespeed/wavespeed-gpt-image-2.5-sunburst`, `wavespeed/wavespeed-nano-banana-2`, `wavespeed/wavespeed-nano-banana-pro`, `wavespeed/wavespeed-seedance-2.0`, `wavespeed/wavespeed-seedance-2.5`
- **xai** (8): `xai/grok-imagine-image`, `xai/grok-imagine-image-2.0`, `xai/grok-imagine-image-pro`, `xai/grok-imagine-image-quality`, `xai/grok-imagine-video`, `xai/grok-imagine-video-1.5`, `xai/grok-imagine-video-1.5-lite`, `xai/grok-imagine-video-1.5-preview`

## Schema field summaries

Generated from the published OpenAPI documents; descriptions are truncated.

```text
== beeble_switchx.json /v2/models/beeble/switchx application/json
  desc: Run beeble/switchx synchronously.
   *alpha_mode: string enum=auto,fill,custom,select | Alpha mode: auto, fill, custom, or select
    alpha_uri: string | URI of a custom alpha matte. Required when alpha_mode is custom or select. Ignored for auto or fill.
    callback_url: string | HTTPS URL for webhook notification on completion or failure.
   *generation_type: string enum=image,video | Output type: image or video
    idempotency_key: string | Idempotency key for safe retries. If a job with the same key already exists for your account, the API returns the existi
    max_resolution: integer default=1080 | Maximum output resolution: 720 or 1080 (default: 1080).
    prompt: string | Text description of desired output (max 2,000 chars). At least one of prompt or reference_image_uri is required.
    reference_image_uri: string | URI of the reference image for style transfer. Accepts the same URI types as source_uri.
   *source_uri: string | URI of the source image or video. Accepts beeble://uploads/{id}/{filename}, https URLs, or data:{mime};base64 URIs (max 
== bfl_flux-3-image.json /v2/models/bfl/flux-3-image application/json
  desc: Run bfl/flux-3-image synchronously.
    aspect_ratio: string default=auto | Output aspect ratio: auto, 21:9, 2:1, 16:9, 3:2, 7:5, 4:3, 5:4, 1:1, 4:5, 3:4, 5:7, 2:3, 9:16, 1:2, or 9:21. auto follow
    grounding: boolean default=True | Let the model research the prompt with web search and image search before it generates. Set false to turn both off.
    images: anyOf | One to ten reference images the prompt edits or draws from, each an http(s) URL or a base64 string. A single string is t
   *prompt: string | Text description of the image to generate, or of the edit to apply to the reference images.
    resolution: string default=1k | Output resolution class: 768sq, 1k, 1.5k, 2k, or 4k.
    safety_tolerance: integer default=2 max=4 | Tolerance level for input and output moderation, 0 being most strict.
    version: string default=latest | Endpoint version. latest serves the current release; dated pinnable release tags are added as they are published.
== bfl_flux-3-video.json /v2/models/bfl/flux-3-video application/json
  desc: Run bfl/flux-3-video synchronously.
    aspect_ratio: string default=auto | Output aspect ratio: auto, 21:9, 2:1, 16:9, 4:3, 1:1, 3:4, or 9:16. auto lets BFL choose from the prompt and any referen
    draft: boolean default=False | Draft mode: generate a fast preview whose result includes a draft_cache download URL. Send that bundle back with mode dr
    draft_cache: string | draft_enhance only. Encrypted draft-cache bundle from a prior draft generation, as the base64-encoded downloaded bundle 
    duration: ? default=auto | Video duration in seconds (any whole second from 5 to 20), or auto to fit the content.
    generate_audio: boolean default=True | Generate synchronized audio alongside the video.
    keyframes: anyOf | i2v only. Images that become frames of the video, each an http(s) URL or base64, one to ten total. Accepts a single imag
   *mode: string | Generation mode: t2v (text-to-video), i2v (image-continuation), v2v (video-continuation), or draft_enhance (full-quality
    prompt: string | Free-form prompt describing the video. Required for every mode except draft_enhance.
    resolution: string enum=hd,fhd | Video resolution class: hd, or fhd for a higher-resolution result finished by the video upsampler. Defaults to hd for t2
    safety_tolerance: integer default=2 max=4 | Tolerance level for input and output harm moderation, 0 strictest. Sexual content is limited to level 3 and hate content
    start_video: string | v2v only. The video to continue, an http(s) URL or base64 MP4; the generated clip carries on from its final frames.
    version: string default=latest | Endpoint version. latest serves the current release; dated pinnable release tags are added as they are published.
== bfl_flux-kontext-pro.json /v2/models/bfl/flux-kontext-pro application/json
  desc: Run bfl/flux-kontext-pro synchronously.
    aspect_ratio: string | Aspect ratio of the output between 21:9 and 9:21, e.g. 16:9. Defaults to the input image's aspect ratio when one is give
    input_image: string | Image to edit, as a base64-encoded image or an http(s) URL. Optional; without it the model generates from the prompt alo
    input_image_2: string | Additional reference image, base64-encoded or an http(s) URL (experimental multi-reference).
    input_image_3: string | Additional reference image, base64-encoded or an http(s) URL (experimental multi-reference).
    input_image_4: string | Additional reference image, base64-encoded or an http(s) URL (experimental multi-reference).
    output_format: string enum=jpeg,png,webp default=png | Output image format.
   *prompt: string | Text prompt describing the edit to apply to input_image, or the image to generate when no input_image is given.
    prompt_upsampling: boolean default=False | Whether to upsample the prompt. If active, the prompt is automatically modified for more creative generation.
    safety_tolerance: integer default=2 max=6 | Tolerance level for input and output moderation, between 0 (most strict) and 6 (least strict).
    seed: integer | Optional seed for reproducibility. A random seed is used when omitted.
    webhook_secret: string | Optional secret for webhook signature verification.
    webhook_url: string | URL to receive webhook notifications.
== bfl_video-edit-v1.json /v2/models/bfl/video-edit-v1 application/json
  desc: Run bfl/video-edit-v1 synchronously.
   *prompt: string | Edit instruction. Names the objects, setting, style, on-screen text or dialogue to change; everything not named is prese
    safety_tolerance: integer default=2 max=4 | Tolerance level for input and output moderation, 0 being most strict.
   *video: string | Video to edit, either an HTTP(S) URL or a base64-encoded MP4. At most 15 seconds of source footage and 50 MiB, with each
== bria_video-edit-replace-background.json /v2/models/bria/video-edit-replace-background application/json
  desc: Run bria/video-edit-replace-background synchronously.
   *background_url: string | Publicly accessible URL of the background asset (image or video) to composite behind the foreground. Must match the fore
    output_container_and_codec: string enum=mp4_h264,mp4_h265,webm_vp9,mov_h265,mov_proresks,mkv_h264,mkv_h265,mkv_vp9,gif | Output container and codec preset.
    preserve_audio: boolean | Whether to preserve audio from the input (foreground) video.
   *video: string | Publicly accessible URL of the input (foreground) video. Input resolution supported up to 16000x16000 (16K). Max duratio
== higgsfield_higgsfield-genjutsu-motion-transfer-v1.0.json /v2/models/higgsfield/higgsfield-genjutsu-motion-transfer-v1.0 application/json
  desc: Run higgsfield/higgsfield-genjutsu-motion-transfer-v1.0 synchronously.
   *image_urls: array items=string maxItems=8 | URLs of 1 to 8 reference images for the cast, location and style.
    prompt: string | Optional guidance for the recast.
    resolution: string default=720p | Output resolution: 480p, 720p or 1080p.
   *video_url: string | URL of the source video whose motion, camera and timing are kept. Minimum 4 seconds; a longer video is trimmed to 30 sec
== ltx_ltx-2-5-fast.json /v2/models/ltx/ltx-2-5-fast application/json
  desc: Run ltx/ltx-2-5-fast synchronously.
   *duration: integer enum=2,3,4,5,6,8,10,12,14,16,18,20 | Video duration in seconds (maximum depends on resolution and frame rate)
    fps: integer enum=24,25,48,50 default=25 | Frame rate in frames per second
    generate_audio: boolean default=True | Generate audio for the video
    model: string | Model to use for generation. On the Comfy Router route `POST /v2/models/ltx/{model}` this field is supplied from the pat
   *prompt: string | Text prompt describing the desired video content
   *resolution: string enum=1280x720,720x1280,1920x1080,1080x1920,2560x1440,1440x2560,3840x2160,2160x3840 | Output video resolution. The enum is the union over all models; the supported set is per model. Supported pairs: ltx-2-5
== ltx_ltx-2-5-pro.json /v2/models/ltx/ltx-2-5-pro application/json
  desc: Run ltx/ltx-2-5-pro synchronously.
   *duration: integer enum=2,3,4,5,6,8,10,12,14,16,18,20 | Video duration in seconds (maximum depends on resolution and frame rate)
    fps: integer enum=24,25,48,50 default=25 | Frame rate in frames per second
    generate_audio: boolean default=True | Generate audio for the video
    model: string | Model to use for generation. On the Comfy Router route `POST /v2/models/ltx/{model}` this field is supplied from the pat
   *prompt: string | Text prompt describing the desired video content
   *resolution: string enum=1280x720,720x1280,1920x1080,1080x1920,2560x1440,1440x2560,3840x2160,2160x3840 | Output video resolution. The enum is the union over all models; the supported set is per model. Supported pairs: ltx-2-5
== runway_aleph2.json /v2/models/runway/aleph2 application/json
  desc: Run runway/aleph2 synchronously.
    contentModeration: object | Settings that affect the behavior of the content moderation system.
    keyframes: array items=None maxItems=5 | Timed guidance images placed at specific points in the input video. Up to 5 keyframes.
    model: string | Model to use for generation. On the Comfy Router route `POST /v2/models/runway/{model}` this field is supplied from the 
    promptImage: array items=object maxItems=5 | A list of up to 5 image keyframes for guiding the edit at specific points in the video.
   *promptText: string | A non-empty string up to 1000 characters describing what should appear in the output.
    seed: integer max=4294967295 | Random seed for generation.
   *videoUri: string | The input video to edit (HTTPS URL, Runway upload URI, or data URI). Must be 30 seconds or shorter.
== wan_wan2.7-r2v.json /v2/models/wan/wan2.7-r2v application/json
  desc: Run wan/wan2.7-r2v synchronously.
    audio_url: string | Audio file download URL. Supported formats: mp3 and wav. Cannot be used with reference_video_urls.
    img_url: string | First frame image URL or Base64 encoded data. Required for the wan2.5-i2v-preview and
wan2.6-i2v models. The happyhorse-
    media: array items=object maxItems=None | Media asset list. Specifies reference materials (image, audio, video) for video
generation. Each element contains a type
    negative_prompt: string | Reverse prompt words are used to describe content that you do not want to see in the video screen
    prompt: string | Text prompt words. Support Chinese and English, length not exceeding 800 characters
(up to 20,000 characters for wan3.0-
    reference_video_urls: array items=string maxItems=3 | Reference video URLs for wan2.6-r2v model only. Array of 1-3 video URLs.
Input restrictions:
- Format: mp4, mov
- Quanti
    template: string | Video effect template name. Optional. Currently supported: squish, flying, carousel. When used, prompt parameter is igno
== wan_wan2.7-videoedit.json /v2/models/wan/wan2.7-videoedit application/json
  desc: Run wan/wan2.7-videoedit synchronously.
    audio_url: string | Audio file download URL. Supported formats: mp3 and wav. Cannot be used with reference_video_urls.
    img_url: string | First frame image URL or Base64 encoded data. Required for the wan2.5-i2v-preview and
wan2.6-i2v models. The happyhorse-
    media: array items=object maxItems=None | Media asset list. Specifies reference materials (image, audio, video) for video
generation. Each element contains a type
    negative_prompt: string | Reverse prompt words are used to describe content that you do not want to see in the video screen
    prompt: string | Text prompt words. Support Chinese and English, length not exceeding 800 characters
(up to 20,000 characters for wan3.0-
    reference_video_urls: array items=string maxItems=3 | Reference video URLs for wan2.6-r2v model only. Array of 1-3 video URLs.
Input restrictions:
- Format: mp4, mov
- Quanti
    template: string | Video effect template name. Optional. Currently supported: squish, flying, carousel. When used, prompt parameter is igno
```
