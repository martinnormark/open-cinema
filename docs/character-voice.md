# Character voice

Checked on Comfy Cloud on 2026-10-18. Evidence (clips, stems, scores, the exact graphs) is in the project's shared folder under `character-voice/`.

## What Comfy offers

| Capability                          | Nodes                                                                                                                | Runs on                 | Licence                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| Text-to-speech, voice design        | `FB_Qwen3TTSVoiceDesign`, `FB_Qwen3TTSCustomVoice`, `FB_Qwen3TTSVoiceClone`                                          | Cloud, open weights     | Apache-2.0 (Qwen3-TTS)                                 |
| Text-to-speech, cloning             | `FL_ChatterboxTTS` and variants                                                                                      | Cloud, open weights     | MIT (Resemble AI Chatterbox, output watermarked)       |
| Voice conversion (speech-to-speech) | `FL_ChatterboxVC`                                                                                                    | Cloud, open weights     | MIT                                                    |
| Cloning, TTS, speech-to-speech      | `ElevenLabsInstantVoiceClone`, `ElevenLabsSpeechToSpeech`, `ElevenLabsTextToSpeech`, `FishAudio*`                    | Comfy API partner nodes | platform service                                       |
| Dialogue / stem separation          | `AudioStemSeparate` (Demucs `htdemucs`, `htdemucs_ft`, `htdemucs_6s`), `AudioSeparation`, `ElevenLabsAudioIsolation` | Cloud / partner         | MIT (Demucs) / platform service                        |
| Speaker identity inside LTX         | `LTXVReferenceAudio` + `ltx-2.3-id-lora-celebvhq-3k` or `-talkvid-3k`                                                | Cloud, open weights     | unclear: model card says "other", trained on CelebV-HQ |
| Lip sync to new audio               | `KlingLipSync*`, `SyncLipSyncNode`, `LtxApi25AudioToVideo`, `WanInfiniteTalkToVideo`                                 | partner / Cloud         | platform service / per model                           |

Partner nodes fail inside a Cloud prompt sent with only the proxy credential ("Please login first"), because they need `api_key_comfy_org` in the prompt's extra data. Their routes answer directly at `https://api.comfy.org/proxy/elevenlabs/v1/...` with the same credential.

## Test: Cal's voice on a talking LTX take

One 5 s LTX-2.3 take (distilled fp8, 960×544, native audio) of Cal speaking in a rainy harbour pub, and a 9 s reference voice designed with Qwen3-TTS. Speaker match is ECAPA cosine similarity of the separated dialogue against the reference (same speaker usually scores above about 0.3).

| Result                                | Speaker match | Transcript intact | Dialogue timing vs take | Rest of track vs take | Picture            |
| ------------------------------------- | ------------- | ----------------- | ----------------------- | --------------------- | ------------------ |
| The take as generated                 | 0.08          | yes               | 1.00                    | 1.00                  | unchanged          |
| Swap with Chatterbox VC               | 0.72          | yes               | 0.88                    | 0.88                  | unchanged          |
| Swap with ElevenLabs speech-to-speech | 0.59          | yes               | 0.94                    | 0.86                  | unchanged          |
| New take with ID-LoRA, guidance 0     | 0.58          | yes               | new take                | new take              | new take           |
| New take with ID-LoRA, guidance 3     | 0.74          | yes               | new take                | new take              | turns cartoon-like |

The swap graph is `LoadAudio(take) → AudioStemSeparate(htdemucs_ft) → vocals → FL_ChatterboxVC(target = reference) → AudioMix(with bass + drums + other)`, then the take's picture is muxed with the new mix, as background replacement already does with original audio. Only the dialogue stem changes; the rest of the track is added back sample for sample (the 0.86 to 0.88 above measures re-separating the remix, not loss). Converted dialogue keeps the original word timing, so the mouth stays in sync without a lip-sync pass. The swap step ran in about 16 s of Cloud time.

`LTXVReferenceAudio` puts the voice in at generation time, so it suits new takes, not existing ones. Its identity guidance (an extra pass per step) strengthens the voice but pushed the picture towards illustration in both distilled and dev-plus-distilled-LoRA setups; at 0 the picture stays photographic and the voice still clearly moves to the reference.

Limits seen or expected: Demucs puts every voice in the vocals stem, so background chatter and a second speaker would be converted too (more than one speaker needs diarisation or a time range per speaker). The test take's ambience was quiet (about -48 dBFS against -28 dBFS dialogue), so a loud music bed is untested.

## Proposal: voice on the Character sheet

- A Character gets one **voice** alongside its reference sheets: a reference sample (uploaded, or designed from a text description with Qwen3-TTS), 5 to 10 s of clean speech, approved like an anchor view. States can override it (a hoarse or injured voice), otherwise they inherit it.
- Approval plays the sample and a fixed test line converted to that voice, so the person hears what shots will get.
- When an @mentioned Character speaks in a shot:
  - new LTX takes generate with `LTXVReferenceAudio` (guidance 0) when its licence is cleared, so the voice and lips come out together;
  - existing takes, and anything not from LTX, get a **Re-voice** revision: separate, convert the dialogue with Chatterbox VC, remix, mux. The take's picture and the rest of its audio are untouched, and the result goes through the usual keep or discard review.
- ElevenLabs speech-to-speech stays an option behind the same step; Chatterbox scored higher here and runs on open weights.
