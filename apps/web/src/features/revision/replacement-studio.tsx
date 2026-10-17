import { useMemo, useRef, useState, type PointerEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Crosshair,
  Film,
  ImageOff,
  Lock,
  Library,
  LoaderCircle,
  Mountain,
  ScanFace,
  TriangleAlert,
  Ban,
  Package,
  Palette,
  UserRound,
  Video,
} from "lucide-react";
import {
  DEFAULT_PRESERVATION,
  RESTAGE_ANGLES,
  approvedReferences,
  assetRefKey,
  type AssetRef,
  type BackgroundPipelineChoice,
  type GenerationRequestInput,
  type PreservedAspect,
  type RestageAngle,
} from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/features/library/model";
import {
  DurationBadge,
  MediaPicker,
  Thumbnail,
  useLibrary,
  type MediaItem,
} from "@/features/library";
import { acceptSnapshot, useGeneration } from "@/features/generation/store";
import { startSession } from "@/features/elements/generate";
import { useElements } from "@/features/elements/store";
import {
  assetUrl as elementAssetUrl,
  stateHandle,
  type Element,
  type ElementState,
} from "@/features/elements/model";
import { submitRevision } from "@/server/revisions";
import { useCostPreferences } from "@/features/settings/preferences";
import { estimateReplacement } from "./estimate";
import { preflight, type Preflight } from "./shot-checks";
import { requestScan, useShotScan, type ScanState } from "./shot-checks-client";
import {
  LTX_REVISION_SECONDS,
  checkKlingSource,
  formatEstimate,
  formatTimecode,
  preservedLabels,
  offeredKinds,
  replacementKinds,
  wardrobeIntents,
  type ReplacementKind,
  type RevisionDecisions,
  type WardrobeIntent,
} from "./model";
import "./revision.css";

/** What the player learns once the clip's metadata loads. */
interface ClipMetadata {
  seconds: number | null;
  width: number | null;
  height: number | null;
}

interface Target {
  x: number;
  y: number;
  timeMs: number;
}

/** Aspects a kind of replacement can never give up; the rest are the creator's call. */
const LOCKED: Record<ReplacementKind, readonly PreservedAspect[]> = {
  background: ["foreground", "performance"],
  character: ["performance", "background"],
  // The swap puts the take's own pixels back everywhere but the object.
  object: ["performance", "background", "other-people"],
  // Restyle and re-staging follow the take's depth or the take itself.
  restyle: ["performance", "camera", "framing"],
  camera: ["performance", "timing"],
};
const OFFERED: Record<ReplacementKind, readonly PreservedAspect[]> = {
  background: [
    "foreground",
    "performance",
    "timing",
    "camera",
    "framing",
    "audio",
    "lighting",
  ],
  character: [
    "performance",
    "background",
    "other-people",
    "things",
    "timing",
    "camera",
    "framing",
    "audio",
    "lighting",
  ],
  object: [
    "performance",
    "background",
    "other-people",
    "timing",
    "camera",
    "framing",
    "audio",
  ],
  restyle: ["performance", "camera", "framing", "timing", "audio"],
  camera: ["performance", "timing", "audio"],
};

/** What runs where, so the composer reads the right limits. */
const KLING_KINDS: readonly ReplacementKind[] = ["background", "character"];
const KIND_ICONS = {
  background: Mountain,
  character: UserRound,
  object: Package,
  restyle: Palette,
  camera: Video,
} as const;
const ELEMENT_TYPES = {
  background: "location",
  character: "character",
  object: "thing",
  restyle: "location",
  camera: null,
} as const;

export function ReplacementStudio({
  initialSource,
  initialKind = "background",
  projectId,
  parentRevisionId,
  draft,
}: {
  initialSource?: AssetRef | null;
  initialKind?: ReplacementKind | undefined;
  projectId?: string | undefined;
  parentRevisionId?: string | undefined;
  /** A failed revision's choices, for "Try again". Read once, at mount. */
  draft?: RevisionDecisions | null | undefined;
}) {
  const navigate = useNavigate();
  const { snapshot } = useGeneration();
  const { elements, status: elementsStatus } = useElements();

  const items = useLibrary((s) => s.items);
  const libraryStatus = useLibrary((s) => s.status);
  const videos = useMemo(
    () => items.filter((item) => item.kind === "video"),
    [items],
  );
  const [sourceKey, setSourceKey] = useState<string | null>(
    initialSource ? assetRefKey(initialSource) : null,
  );
  const source =
    sourceKey === null
      ? (videos[0] ?? null)
      : (videos.find((v) => assetRefKey(v.ref) === sourceKey) ?? null);
  const [kind, setKind] = useState<ReplacementKind>(() => {
    const wanted = draft?.kind ?? initialKind;
    return offeredKinds.includes(wanted) ? wanted : "background";
  });
  const [elementId, setElementId] = useState<string | null>(
    draft?.element?.id ?? null,
  );
  const [stateId, setStateId] = useState<string | null>(
    draft?.draft?.stateId ?? null,
  );
  const [direction, setDirection] = useState(draft?.direction ?? "");
  const [target, setTarget] = useState<Target | null>(
    draft?.targetPoint ?? null,
  );
  const [targetNote, setTargetNote] = useState(draft?.draft?.targetNote ?? "");
  const [wardrobe, setWardrobe] = useState<WardrobeIntent>(
    draft?.wardrobe ?? "character",
  );
  const [wardrobeNote, setWardrobeNote] = useState(draft?.wardrobeNote ?? "");
  const [preserve, setPreserve] = useState<
    Record<ReplacementKind, Set<PreservedAspect>>
  >(() => ({
    background: new Set(
      draft?.kind === "background"
        ? draft.preserve
        : DEFAULT_PRESERVATION.background.preserve,
    ),
    character: new Set(
      draft?.kind === "character"
        ? draft.preserve
        : DEFAULT_PRESERVATION.character.preserve,
    ),
    object: new Set(
      draft?.kind === "object"
        ? draft.preserve
        : DEFAULT_PRESERVATION.object.preserve,
    ),
    restyle: new Set(
      draft?.kind === "restyle"
        ? draft.preserve
        : DEFAULT_PRESERVATION.restyle.preserve,
    ),
    camera: new Set(
      draft?.kind === "camera"
        ? draft.preserve
        : DEFAULT_PRESERVATION.restage.preserve,
    ),
  }));
  const [angle, setAngle] = useState<RestageAngle>(
    draft?.draft?.angle ?? "closer",
  );
  const [original, setOriginal] = useState(draft?.draft?.original ?? "");
  const [styleKey, setStyleKey] = useState<string | null>(
    draft?.draft?.styleImage ?? null,
  );
  const styleImage =
    styleKey === null
      ? null
      : (items.find(
          (item) => item.kind === "image" && assetRefKey(item.ref) === styleKey,
        ) ?? null);
  const [allowIntegration, setAllowIntegration] = useState(
    draft?.allowIntegration ?? true,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [measured, setMeasured] = useState<ClipMetadata | null>(null);
  const [pipeline, setPipeline] = useState<BackgroundPipelineChoice>(
    draft?.draft?.pipeline ?? "kling",
  );
  const [plateKey, setPlateKey] = useState<string | null>(
    draft?.draft?.plate ?? null,
  );
  const plate =
    plateKey === null
      ? null
      : (items.find((item) => assetRefKey(item.ref) === plateKey) ?? null);

  const elementType = ELEMENT_TYPES[kind];
  const candidates = elementType
    ? elements.filter((e) => e.type === elementType)
    : [];
  const kling = KLING_KINDS.includes(kind);
  const element = candidates.find((e) => e.id === elementId) ?? null;
  const state = element?.states.find((s) => s.id === stateId) ?? null;
  const references = element ? approvedReferences(element, state?.id) : [];
  const preserved = preserve[kind];
  const clipSeconds = source?.durationSeconds ?? measured?.seconds ?? null;
  const alpha = kind === "background" && pipeline === "ltx-alpha";
  // A composite never relights the matted people.
  const locked: readonly PreservedAspect[] = alpha
    ? [...LOCKED.background, "lighting"]
    : LOCKED[kind];
  // A silent clip has no original sound to keep.
  const unavailable: readonly PreservedAspect[] =
    source?.hasAudio === false ? ["audio"] : [];
  const kept = [...new Set([...locked, ...preserved])].filter(
    (a) => !unavailable.includes(a),
  );
  const sourceCheck =
    source && !alpha && kling
      ? checkKlingSource({
          seconds: clipSeconds,
          width: source.width ?? measured?.width ?? null,
          height: source.height ?? measured?.height ?? null,
          fps: source.fps,
          pixelAspect: source.pixelAspect,
        })
      : { problems: [], notes: [] };

  // Recast pre-flight: where the marked person is, which way they face and how
  // large their face gets (docs/phase0-recast.md, supported envelope).
  const scanState = useShotScan(
    kind === "character" && source ? source.url : null,
  );
  const shotCheck = useMemo(
    () =>
      kind === "character" && target && scanState.status === "ready"
        ? preflight(scanState.scan, target)
        : null,
    [kind, target, scanState],
  );

  const { unit } = useCostPreferences();
  const estimate = formatEstimate(
    estimateReplacement(kind, clipSeconds, pipeline),
    unit,
  );

  const problems: string[] = [];
  if (!source) problems.push("Choose a clip to revise.");
  // What is wrong with the clip itself comes before any other choice.
  problems.push(...sourceCheck.problems);
  if (alpha && !plate && !element)
    problems.push("Choose a Location or a plate to put behind the take.");
  if (
    kind === "background" &&
    !alpha &&
    !element &&
    direction.trim().length < 3
  )
    problems.push("Choose a Location or describe the new setting.");
  if (kind === "background" && element && !references.length)
    problems.push(`${element.name} needs an approved reference first.`);
  if (kind === "character" && !element)
    problems.push("Choose the Character who takes the role.");
  if (kind === "character" && element && !references.length)
    problems.push(`${element.name} needs an approved reference first.`);
  if (kind === "character" && !target && targetNote.trim().length < 3)
    problems.push("Mark the person to recast on the frame, or describe them.");
  if (
    kind === "character" &&
    wardrobe === "describe" &&
    wardrobeNote.trim().length < 3
  )
    problems.push("Describe the wardrobe, or choose another option.");
  if (kind === "character" && clipSeconds !== null && clipSeconds < 4)
    problems.push("Recasting needs a clip of at least 4 seconds.");
  if (kind === "character" && target && scanState.status === "scanning")
    problems.push("Checking the shot…");
  if (shotCheck?.verdict === "refuse")
    problems.push(
      "Recasting needs a shot where this person’s face is seen at some point.",
    );
  if (!kling && clipSeconds !== null && clipSeconds < 1)
    problems.push("This revision needs a clip of at least 1 second.");
  if (kind === "object" && !element)
    problems.push("Choose the Thing that takes the object’s place.");
  if (kind === "object" && element && !references.length)
    problems.push(`${element.name} needs an approved reference first.`);
  if (kind === "object" && original.trim().length < 3)
    problems.push("Name the object in the shot that is replaced.");
  if (kind === "restyle" && element && !references.length)
    problems.push(`${element.name} needs an approved reference first.`);
  if (
    kind === "restyle" &&
    !element &&
    !styleImage &&
    direction.trim().length < 3
  )
    problems.push("Choose a Location or style image, or describe the look.");

  function chooseKind(next: ReplacementKind) {
    if (next === kind) return;
    setKind(next);
    setElementId(null);
    setStateId(null);
    setPendingKey(null);
    setError("");
  }
  function chooseSource(item: MediaItem) {
    setSourceKey(assetRefKey(item.ref));
    setTarget(null);
    setMeasured(null);
    setPendingKey(null);
  }
  function togglePreserved(aspect: PreservedAspect) {
    if (locked.includes(aspect) || unavailable.includes(aspect)) return;
    setPreserve((current) => {
      const next = new Set(current[kind]);
      if (next.has(aspect)) next.delete(aspect);
      else next.add(aspect);
      return { ...current, [kind]: next };
    });
    setPendingKey(null);
  }

  function intentSentence() {
    const mention = element
      ? `@${element.handle}${state ? `:${stateHandle(state)}` : ""}`
      : null;
    if (alpha) {
      const where = plate ? `“${plate.title}”` : (mention ?? "a new plate");
      return `Put the performers, exactly as shot, in front of ${where}.`;
    }
    const note = direction.trim().replace(/[.\s]+$/, "");
    const after = note ? ` ${note[0]!.toUpperCase()}${note.slice(1)}.` : "";
    if (kind === "object") {
      const what =
        original
          .trim()
          .replace(/[.\s]+$/, "")
          .replace(/^(The|A|An) /, (article) => article.toLowerCase()) ||
        "the marked object";
      return `Swap ${/^(the|a|an) /i.test(what) ? what : `the ${what}`} for ${mention ?? "a Thing"}, keeping everyone and everything else exactly as shot.${after}`;
    }
    if (kind === "restyle") {
      const look = [
        mention,
        styleImage ? `“${styleImage.title}”` : null,
      ].filter(Boolean);
      if (!look.length)
        return note
          ? `Restyle this shot: ${note}, keeping the action and camera.`
          : "Restyle this shot, keeping the action and camera.";
      return `Restyle this shot in the look of ${look.join(" and ")}, keeping the action and camera.${after}`;
    }
    if (kind === "camera")
      return `Re-stage this take from a new angle: ${RESTAGE_ANGLES[angle].label.toLowerCase()}, keeping the performance and timing.${after}`;
    if (kind === "background") {
      const how = direction.trim().replace(/[.\s]+$/, "");
      if (!mention)
        return how
          ? `Move this shot to ${how}, keeping the performers and action.`
          : "Move this shot to a new setting, keeping the performers and action.";
      return `Move this shot to ${mention}, keeping the performers and action.${how ? ` ${how[0]!.toUpperCase()}${how.slice(1)}.` : ""}`;
    }
    // "The woman on the right" reads as a phrase mid-sentence; names keep their case.
    const who =
      targetNote
        .trim()
        .replace(/[.\s]+$/, "")
        .replace(/^(The|A|An) /, (article) => article.toLowerCase()) ||
      "the marked person";
    const dress =
      wardrobe === "keep"
        ? "in the original wardrobe"
        : wardrobe === "describe"
          ? `wearing ${wardrobeNote.trim()}`
          : "in their own look";
    return `Replace ${who} with ${mention}, ${dress}, preserving their performance and everything else in the shot.`;
  }

  async function submit() {
    if (busy || problems.length || !source) return;
    setBusy(true);
    setError("");
    const key = pendingKey ?? crypto.randomUUID();
    setPendingKey(key);
    try {
      if (!snapshot) await startSession();
      const preservation = {
        preserve: kept.filter(
          (a) => OFFERED[kind].includes(a) || a === "wardrobe",
        ),
        allowIntegration: KLING_KINDS.includes(kind) && allowIntegration,
        ...(kind === "character" && wardrobe === "describe"
          ? { notes: `Wardrobe: ${wardrobeNote.trim()}` }
          : {}),
      };
      const mention = element
        ? { elementId: element.id, ...(state ? { stateId: state.id } : {}) }
        : undefined;
      const request: GenerationRequestInput =
        kind === "object"
          ? {
              workflowKind: "video.object-swap",
              inputs: {
                source: source.ref,
                thing: mention!,
                original: original.trim(),
                ...(target
                  ? {
                      point: {
                        x: target.x,
                        y: target.y,
                        timeMs: target.timeMs,
                      },
                    }
                  : {}),
                ...(direction.trim().length >= 3
                  ? { prompt: direction.trim() }
                  : {}),
                preservation,
              },
            }
          : kind === "restyle"
            ? {
                workflowKind: "video.restyle",
                inputs: {
                  source: source.ref,
                  ...(mention ? { style: mention } : {}),
                  ...(styleImage ? { styleImage: styleImage.ref } : {}),
                  ...(direction.trim().length >= 3
                    ? { prompt: direction.trim() }
                    : {}),
                  preservation,
                },
              }
            : kind === "camera"
              ? {
                  workflowKind: "video.restage",
                  inputs: {
                    source: source.ref,
                    angle,
                    ...(direction.trim().length >= 3
                      ? { prompt: direction.trim() }
                      : {}),
                    preservation,
                  },
                }
              : kind === "background"
                ? {
                    workflowKind: "video.background-replace",
                    inputs: {
                      source: source.ref,
                      ...(mention ? { location: mention } : {}),
                      ...(alpha && plate ? { background: plate.ref } : {}),
                      ...(!alpha && direction.trim().length >= 3
                        ? { prompt: direction.trim() }
                        : {}),
                      target: { type: "background" },
                      preservation,
                      pipeline,
                    },
                  }
                : {
                    workflowKind: "video.character-replace",
                    inputs: {
                      source: source.ref,
                      character: mention!,
                      references: [],
                      target: {
                        type: "person",
                        ...(target
                          ? {
                              point: {
                                x: target.x,
                                y: target.y,
                                timeMs: target.timeMs,
                              },
                            }
                          : {}),
                        ...(targetNote.trim()
                          ? { description: targetNote.trim() }
                          : {}),
                      },
                      // Keeping the source wardrobe or the Character's own look is
                      // already worded by the request builder from `preservation`.
                      prompt: [
                        wardrobe === "describe"
                          ? `Wardrobe for this shot: ${wardrobeNote.trim()}.`
                          : "",
                        direction.trim(),
                      ]
                        .filter(Boolean)
                        .join(" "),
                      preservation: {
                        ...preservation,
                        preserve:
                          wardrobe === "keep"
                            ? [
                                ...new Set([
                                  ...preservation.preserve,
                                  "wardrobe" as const,
                                ]),
                              ]
                            : preservation.preserve.filter(
                                (a) => a !== "wardrobe",
                              ),
                      },
                    },
                  };
      const decisions: RevisionDecisions = {
        kind,
        sourceTitle: source.title.slice(0, 300),
        element: element
          ? {
              id: element.id,
              name: element.name,
              handle: element.handle,
              stateName: state?.name ?? null,
              referenceCount: references.length,
            }
          : null,
        direction: direction.trim(),
        target:
          kind === "object"
            ? [
                original.trim(),
                target
                  ? `marked at ${formatTimecode(target.timeMs / 1000)}`
                  : "",
              ]
                .filter(Boolean)
                .join(", ")
                .slice(0, 300)
            : kind === "restyle"
              ? "The whole look"
              : kind === "camera"
                ? `New angle: ${RESTAGE_ANGLES[angle].label}`
                : kind === "character"
                  ? [
                      targetNote.trim(),
                      target
                        ? `marked at ${formatTimecode(target.timeMs / 1000)}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(", ")
                  : "Background",
        wardrobe: kind === "character" ? wardrobe : null,
        wardrobeNote: kind === "character" ? wardrobeNote.trim() : "",
        preserve:
          "preservation" in request.inputs && request.inputs.preservation
            ? [...request.inputs.preservation.preserve]
            : [],
        allowIntegration: KLING_KINDS.includes(kind) && allowIntegration,
        estimate: {
          cost: estimate.cost,
          time: estimate.time,
          basis: estimate.basis,
        },
        targetPoint: kind === "character" ? target : null,
        preflight: shotCheck,
        draft: {
          stateId: state?.id ?? null,
          targetNote: targetNote.trim().slice(0, 300),
          pipeline,
          plate: alpha ? plateKey : null,
          angle: kind === "camera" ? angle : null,
          original: kind === "object" ? original.trim().slice(0, 200) : null,
          styleImage: kind === "restyle" ? styleKey : null,
        },
      };
      const result = await submitRevision({
        data: {
          idempotencyKey: key,
          projectId,
          parentRevisionId,
          intent: intentSentence(),
          request,
          decisions,
        },
      });
      if (!result.ok) {
        setError(result.error);
        setPendingKey(null);
        return;
      }
      setPendingKey(null);
      if (result.result.ok) acceptSnapshot(result.result.snapshot);
      await navigate({
        to: "/revisions/$revisionId",
        params: { revisionId: result.revisionId },
      });
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "The request was interrupted. Try again; it reuses the same request key, so nothing runs twice.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        <SourceStage
          source={source}
          markTarget={kind === "character" || kind === "object"}
          markLabel={
            kind === "object"
              ? "Click the object to swap"
              : "Click the person to recast"
          }
          target={target}
          onTarget={(next) => {
            setTarget(next);
            setPendingKey(null);
          }}
          personBox={shotCheck?.box ?? null}
          onMetadata={setMeasured}
        />
        <ClipStrip
          videos={videos}
          loading={libraryStatus === "idle" || libraryStatus === "loading"}
          selected={source}
          onSelect={chooseSource}
        />
      </div>

      <form
        className="flex flex-col gap-7"
        aria-label="Revision decisions"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset>
          <legend className="text-sm font-medium">What changes</legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {offeredKinds.map((option) => {
              const Icon = KIND_ICONS[option];
              return (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    kind === option
                      ? "border-tungsten/70 bg-surface"
                      : "border-border hover:bg-surface",
                  )}
                >
                  <input
                    type="radio"
                    name="replacement-kind"
                    className="sr-only"
                    checked={kind === option}
                    onChange={() => chooseKind(option)}
                  />
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-4",
                      kind === option
                        ? "text-tungsten"
                        : "text-subtle-foreground",
                    )}
                  />
                  <span className="text-sm font-medium">
                    {replacementKinds[option].label}
                  </span>
                  <span className="text-xs leading-5 text-muted-foreground">
                    {replacementKinds[option].changes}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {kind === "object" && (
          <fieldset className="revision-reveal">
            <legend className="text-sm font-medium">What is replaced</legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {target
                ? `Marked at ${formatTimecode(target.timeMs / 1000)}. Name it in a few plain words so it can be found in every frame.`
                : "Name the object in a few plain words. You can also click it on the frame."}
            </p>
            <input
              value={original}
              onChange={(event) => {
                setOriginal(event.target.value);
                setPendingKey(null);
              }}
              maxLength={200}
              placeholder="The table lamp with the white shade"
              aria-label="The object to replace"
              className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </fieldset>
        )}

        {kind === "camera" ? (
          <AngleChoice
            angle={angle}
            onAngle={(next) => {
              setAngle(next);
              setPendingKey(null);
            }}
          />
        ) : (
          <ElementChoice
            key={kind}
            kind={kind}
            loading={elementsStatus === "loading"}
            candidates={candidates}
            elementId={elementId}
            stateId={stateId}
            onChoose={(id, nextState) => {
              setElementId(id);
              setStateId(nextState);
              setPendingKey(null);
            }}
          />
        )}

        {kind === "restyle" && (
          <StyleImageChoice
            image={styleImage}
            onImage={(next) => {
              setStyleKey(next ? assetRefKey(next.ref) : null);
              setPendingKey(null);
            }}
          />
        )}

        {kind === "background" && (
          <BackgroundMethod
            pipeline={pipeline}
            onPipeline={(next) => {
              setPipeline(next);
              setPendingKey(null);
            }}
            plate={plate}
            onPlate={(next) => {
              setPlateKey(next ? assetRefKey(next.ref) : null);
              setPendingKey(null);
            }}
            locationName={element?.name ?? null}
            clipSeconds={clipSeconds}
          />
        )}

        {kind === "character" && (
          <fieldset className="revision-reveal">
            <legend className="text-sm font-medium">Who is recast</legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {target
                ? `Marked at ${formatTimecode(target.timeMs / 1000)}. Click the frame again to move it.`
                : "Pause on a clear frame and click the person. Add a few words if the shot has several people."}
            </p>
            <input
              value={targetNote}
              onChange={(event) => {
                setTargetNote(event.target.value);
                setPendingKey(null);
              }}
              maxLength={300}
              placeholder="The woman on the left, in the grey coat"
              aria-label="Describe the person to recast"
              className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            {target && (
              <ShotCheck
                scan={scanState}
                check={shotCheck}
                onRetry={() => source && requestScan(source.url)}
              />
            )}
          </fieldset>
        )}

        {kind === "character" && (
          <fieldset className="revision-reveal">
            <legend className="text-sm font-medium">Wardrobe</legend>
            <div className="mt-2 flex flex-col gap-1">
              {(Object.keys(wardrobeIntents) as WardrobeIntent[]).map(
                (option) => {
                  const unavailable = wardrobeIntents[option].unavailable;
                  return (
                    <label
                      key={option}
                      className={cn(
                        "flex gap-3 rounded-lg px-2 py-2 has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        unavailable
                          ? "cursor-not-allowed"
                          : "cursor-pointer hover:bg-surface",
                      )}
                    >
                      <input
                        type="radio"
                        name="wardrobe"
                        checked={wardrobe === option}
                        disabled={!!unavailable}
                        aria-describedby={
                          unavailable ? `wardrobe-${option}-limit` : undefined
                        }
                        onChange={() => {
                          setWardrobe(option);
                          setPendingKey(null);
                        }}
                        className="mt-1 accent-(--tungsten)"
                      />
                      <span>
                        <span
                          className={cn(
                            "block text-sm",
                            unavailable && "text-muted-foreground",
                          )}
                        >
                          {wardrobeIntents[option].label}
                        </span>
                        <span
                          id={
                            unavailable ? `wardrobe-${option}-limit` : undefined
                          }
                          className="block text-xs leading-5 text-muted-foreground"
                        >
                          {unavailable ?? wardrobeIntents[option].detail}
                        </span>
                      </span>
                    </label>
                  );
                },
              )}
            </div>
            {wardrobe === "describe" && (
              <input
                value={wardrobeNote}
                onChange={(event) => setWardrobeNote(event.target.value)}
                maxLength={400}
                autoFocus
                placeholder="A rain-dark oilskin coat over a fisherman’s sweater"
                aria-label="Wardrobe for this shot"
                className="revision-reveal mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
          </fieldset>
        )}

        {!alpha && (
          <div>
            <label htmlFor="revision-direction" className="text-sm font-medium">
              {kind === "background"
                ? element
                  ? "Direction (optional)"
                  : "Describe the new setting"
                : kind === "restyle"
                  ? element || styleImage
                    ? "Describe the look (optional)"
                    : "Describe the look"
                  : kind === "camera"
                    ? "What is in the shot (optional)"
                    : "Direction (optional)"}
            </label>
            <Textarea
              id="revision-direction"
              value={direction}
              onChange={(event) => {
                setDirection(event.target.value);
                setPendingKey(null);
              }}
              maxLength={1500}
              rows={3}
              className="mt-2 text-sm leading-6"
              placeholder={
                kind === "background"
                  ? "Harbor at dusk, sodium lights coming on, light rain"
                  : kind === "object"
                    ? "Lit, with a soft flicker on the table"
                    : kind === "restyle"
                      ? "Hand-painted gouache, warm dusk palette, visible brush texture"
                      : kind === "camera"
                        ? "Two people talking across a kitchen table at night"
                        : "Slightly older, the same quiet intensity"
              }
            />
          </div>
        )}

        <fieldset>
          <legend className="text-sm font-medium">
            What stays exactly as shot
          </legend>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {OFFERED[kind].map((aspect) => {
              const fixed = locked.includes(aspect);
              const absent = unavailable.includes(aspect);
              const on = !absent && (preserved.has(aspect) || fixed);
              return (
                <li key={aspect}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-disabled={fixed || absent}
                    title={
                      fixed
                        ? "Always kept for this kind of revision"
                        : absent
                          ? "This clip has no sound to keep"
                          : undefined
                    }
                    onClick={() => togglePreserved(aspect)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "border-transparent bg-secondary text-foreground"
                        : "border-dashed border-border text-muted-foreground hover:text-foreground",
                      (fixed || absent) && "cursor-default",
                      absent && "line-through hover:text-muted-foreground",
                    )}
                  >
                    {fixed ? (
                      <Lock
                        aria-hidden="true"
                        className="size-3 text-subtle-foreground"
                      />
                    ) : on ? (
                      <Check aria-hidden="true" className="size-3" />
                    ) : null}
                    {preservedLabels[aspect]}
                  </button>
                </li>
              );
            })}
          </ul>
          {!alpha && kling && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs leading-5 text-muted-foreground">
              <input
                type="checkbox"
                checked={allowIntegration}
                onChange={(event) => setAllowIntegration(event.target.checked)}
                className="mt-0.5 accent-(--tungsten)"
              />
              <span>
                Allow scoped integration: contact shadows, edge light and colour
                matching where the change meets the shot.
              </span>
            </label>
          )}
        </fieldset>

        <section
          aria-label="Before you generate"
          className="rounded-xl bg-surface p-4"
        >
          <p className="text-sm leading-6">{intentSentence()}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Changes</dt>
            <dd>
              {alpha
                ? "Everything outside the matted people and Things"
                : kind === "background"
                  ? "Only the setting behind the people and Things"
                  : kind === "object"
                    ? "Only the object, and the light it casts nearby"
                    : kind === "restyle"
                      ? "The look of every frame, people included"
                      : kind === "camera"
                        ? "Where the camera stands"
                        : "Only the marked person"}
            </dd>
            <dt className="text-muted-foreground">Keeps</dt>
            <dd>
              {kept
                .filter((a) => OFFERED[kind].includes(a))
                .map((a) =>
                  preservedLabels[a].toLowerCase().replace("things", "Things"),
                )
                .join(", ")}
            </dd>
            <dt className="text-muted-foreground">Cost</dt>
            <dd className="tabular">{estimate.cost}</dd>
            <dt className="text-muted-foreground">Time</dt>
            <dd className="tabular">
              {estimate.time} · {estimate.basis.toLowerCase()}
            </dd>
          </dl>
          {estimate.note && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {estimate.note}
            </p>
          )}
          {!kling &&
            clipSeconds !== null &&
            clipSeconds > LTX_REVISION_SECONDS + 0.2 && (
              <p className="mt-2 text-xs leading-5 text-foreground">
                Only the first {LTX_REVISION_SECONDS} seconds are revised, so
                the result is {LTX_REVISION_SECONDS} seconds long.
              </p>
            )}
          {kind === "restyle" && (
            <p className="mt-2 text-xs leading-5 text-foreground">
              People are restyled too. Their faces follow the new look and can
              drift from the actors’ likeness; the check after the run says
              where.
            </p>
          )}
          {kind === "camera" && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Small moves hold up best, and the angle is a direction rather than
              an exact position: an early model makes it. It has not seen angles
              from behind the subject, so there is no reverse shot.
            </p>
          )}
          {sourceCheck.notes.map((note) => (
            <p key={note} className="mt-2 text-xs leading-5 text-foreground">
              {note}
            </p>
          ))}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            The original stays untouched. You compare the result against it and
            decide whether to keep it.
          </p>
        </section>

        {error && (
          <p role="alert" className="text-sm leading-6 text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            size="lg"
            disabled={busy || problems.length > 0}
          >
            {busy
              ? "Starting…"
              : pendingKey
                ? "Retry request"
                : replacementKinds[kind].label}
            <ArrowRight aria-hidden="true" />
          </Button>
          {/* Everything wrong with the clip at once, so it is re-exported once. */}
          {(sourceCheck.problems.length
            ? sourceCheck.problems
            : problems.slice(0, 1)
          ).map((problem) => (
            <p
              key={problem}
              className="text-xs leading-5 text-muted-foreground"
            >
              {problem}
            </p>
          ))}
        </div>
      </form>
    </div>
  );
}

/** The chosen clip, large; in recast mode a click marks the person on that frame. */
function SourceStage({
  source,
  markTarget,
  markLabel,
  target,
  onTarget,
  onMetadata,
  personBox,
}: {
  source: MediaItem | null;
  markTarget: boolean;
  markLabel: string;
  target: Target | null;
  onTarget: (target: Target) => void;
  onMetadata: (metadata: ClipMetadata) => void;
  /** The person found under the mark, outlined so the creator can confirm it. */
  personBox: Preflight["box"];
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [frameRatio, setFrameRatio] = useState(16 / 9);
  if (!source)
    return (
      <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border bg-surface text-center">
        <div className="max-w-xs px-6">
          <Film
            aria-hidden="true"
            className="mx-auto size-6 text-subtle-foreground"
          />
          <p className="mt-3 text-sm font-medium">Choose a clip to revise</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Upload footage or pick a generated shot below. The original is never
            changed.
          </p>
        </div>
      </div>
    );

  function mark(event: PointerEvent<HTMLDivElement>) {
    const v = video.current;
    if (!markTarget || !v || !v.videoWidth) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // object-contain letterboxes the frame; map the click into frame space.
    const scale = Math.min(
      rect.width / v.videoWidth,
      rect.height / v.videoHeight,
    );
    const width = v.videoWidth * scale;
    const height = v.videoHeight * scale;
    const x = (event.clientX - rect.left - (rect.width - width) / 2) / width;
    const y = (event.clientY - rect.top - (rect.height - height) / 2) / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    v.pause();
    requestScan(source!.url);
    onTarget({ x, y, timeMs: Math.round(v.currentTime * 1000) });
  }

  return (
    <figure className="m-0">
      <div
        className={cn(
          "relative aspect-video overflow-hidden rounded-xl bg-black",
          markTarget && "cursor-crosshair",
        )}
        style={{ containerType: "size" }}
        onPointerUp={mark}
        // Start analysing as the pointer arrives, so the check is ready by the click.
        onPointerEnter={markTarget ? () => requestScan(source.url) : undefined}
      >
        <video
          key={source.id}
          ref={video}
          src={source.url}
          poster={source.thumbnailUrl ?? undefined}
          controls={!markTarget}
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-contain"
          onLoadedMetadata={(event) => {
            const v = event.currentTarget;
            onMetadata({
              seconds: Number.isFinite(v.duration) ? v.duration : null,
              width: v.videoWidth || null,
              height: v.videoHeight || null,
            });
            if (v.videoWidth) setFrameRatio(v.videoWidth / v.videoHeight);
          }}
          onClick={markTarget ? (event) => event.preventDefault() : undefined}
        />
        {markTarget && target && (
          <TargetMarker target={target} ratio={frameRatio} box={personBox} />
        )}
      </div>
      {markTarget && <ScrubBar video={video} />}
      <figcaption className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate text-foreground">{source.title}</span>
        {source.durationSeconds && (
          <span className="tabular">
            {formatDuration(source.durationSeconds)}
          </span>
        )}
        <span>· {source.origin === "upload" ? "Uploaded" : "Generated"}</span>
        {markTarget && (
          <span className="ml-auto flex items-center gap-1">
            <Crosshair aria-hidden="true" className="size-3" /> {markLabel}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Positioned in the letterboxed frame box, so percentages match frame space. */
function TargetMarker({
  target,
  ratio,
  box,
}: {
  target: Target;
  ratio: number;
  box: Preflight["box"];
}) {
  return (
    <div
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{
        width: `min(100cqw, ${ratio * 100}cqh)`,
        height: `min(100cqh, ${100 / ratio}cqw)`,
      }}
    >
      {box && (
        <span
          key={`box-${box.x}-${box.y}`}
          className="target-person absolute rounded-md border border-dashed border-tungsten/70"
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
          }}
        />
      )}
      <span
        key={`${target.x}-${target.y}`}
        className="target-marker absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-tungsten bg-tungsten/20 shadow-[0_0_0_4px_rgb(0_0_0/0.35)]"
        style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
      >
        <span className="absolute inset-0 m-auto size-1.5 rounded-full bg-tungsten" />
      </span>
    </div>
  );
}

/** Frame scrubbing for target marking; writes to the video without re-rendering. */
function ScrubBar({ video }: { video: { current: HTMLVideoElement | null } }) {
  return (
    <input
      type="range"
      min={0}
      max={1000}
      defaultValue={0}
      aria-label="Choose a frame"
      className="compare-scrubber mt-2 w-full"
      onChange={(event) => {
        const v = video.current;
        if (!v || !v.duration) return;
        v.pause();
        v.currentTime = (Number(event.target.value) / 1000) * v.duration;
      }}
    />
  );
}

const shotReasons: Record<Preflight["reasons"][number], string> = {
  "back-view":
    "They are only seen from behind. The model turns a recast person to face the camera, which reverses their body against the action.",
  "small-face":
    "Their face stays small in the frame. Body, wardrobe and motion carry over, but the face may not read as the Character.",
  "partly-away":
    "They face away for much of the shot. Likeness is weakest in those frames.",
};

/** The composer's pre-flight: refuse back-view-only targets, warn on small faces. */
function ShotCheck({
  scan,
  check,
  onRetry,
}: {
  scan: ScanState;
  check: Preflight | null;
  onRetry: () => void;
}) {
  let tone: "muted" | "ok" | "warn" | "refuse" = "muted";
  let Icon = ScanFace;
  let title: string;
  let body: string[] = [];
  if (scan.status === "scanning" || scan.status === "idle") {
    Icon = LoaderCircle;
    title = "Checking the shot…";
  } else if (scan.status === "failed" || !check) {
    title = "Could not check this shot";
    body = [
      "You can still recast it. Check that their face is visible and not too small.",
    ];
  } else if (check.verdict === "unmatched") {
    tone = "warn";
    Icon = TriangleAlert;
    title = "No person found at the mark";
    body = [
      "Click on their body on a frame where they are clearly visible, or describe them above.",
    ];
  } else if (check.verdict === "refuse") {
    tone = "refuse";
    Icon = Ban;
    title = "This shot cannot be recast yet";
    body = [
      shotReasons["back-view"],
      "Choose a take where their face is seen at some point.",
    ];
  } else if (check.verdict === "warn") {
    tone = "warn";
    Icon = TriangleAlert;
    title = "Recast with care";
    body = check.reasons.map((reason) => shotReasons[reason]);
  } else {
    tone = "ok";
    title = "Face clearly visible";
    body = [
      `Seen facing the camera in ${check.faceFrames} of ${check.tracked} sampled frames.`,
    ];
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "shot-check mt-3 flex gap-2.5 rounded-lg px-3 py-2.5 text-xs leading-5",
        tone === "refuse"
          ? "bg-destructive/10 text-foreground"
          : tone === "warn"
            ? "bg-warning/10 text-foreground"
            : "bg-surface text-muted-foreground",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          Icon === LoaderCircle && "shot-check-spin",
          tone === "refuse"
            ? "text-destructive"
            : tone === "warn"
              ? "text-warning"
              : tone === "ok"
                ? "text-success"
                : "text-subtle-foreground",
        )}
      />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {body.map((line) => (
          <p key={line} className="text-muted-foreground">
            {line}
          </p>
        ))}
        {scan.status === "failed" && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-foreground underline underline-offset-2"
          >
            Check again
          </button>
        )}
      </div>
    </div>
  );
}

/** Recent clips at hand; the library picker covers everything else, uploads included. */
function ClipStrip({
  videos,
  loading,
  selected,
  onSelect,
}: {
  videos: readonly MediaItem[];
  loading: boolean;
  selected: MediaItem | null;
  onSelect: (item: MediaItem) => void;
}) {
  const [picking, setPicking] = useState(false);
  const recent = videos.slice(0, 7);
  if (selected && !recent.some((v) => v.id === selected.id))
    recent.splice(6, 1, selected);
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Your clips</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPicking(true)}
        >
          <Library aria-hidden="true" /> Browse or upload
        </Button>
      </div>
      {loading && !videos.length ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading clips…</p>
      ) : videos.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          No clips yet. Upload footage from your library, or make a video in
          Studio first.
        </p>
      ) : (
        <ul
          className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-7"
          aria-label="Recent clips"
        >
          {recent.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={item.id === selected?.id}
                onClick={() => onSelect(item)}
                className="group block w-full text-left outline-none"
              >
                <span
                  className={cn(
                    "relative block overflow-hidden rounded-lg ring-offset-2 ring-offset-background transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-ring",
                    item.id === selected?.id && "ring-2 ring-tungsten",
                  )}
                >
                  <Thumbnail
                    src={item.thumbnailUrl}
                    kind="video"
                    className="aspect-video"
                  />
                  <DurationBadge item={item} className="right-1 bottom-1" />
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground group-hover:text-foreground">
                  {item.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        kind="video"
        title="Choose a clip to revise"
        description="Pick footage you uploaded or a video you generated, or upload a new clip."
        onSelect={onSelect}
      />
    </div>
  );
}

/** Only Alpha Gen's reliable range is matted; longer takes are trimmed to it. */
const ALPHA_MAX_SECONDS = 5;

function BackgroundMethod({
  pipeline,
  onPipeline,
  plate,
  onPlate,
  locationName,
  clipSeconds,
}: {
  pipeline: BackgroundPipelineChoice;
  onPipeline: (pipeline: BackgroundPipelineChoice) => void;
  plate: MediaItem | null;
  onPlate: (plate: MediaItem | null) => void;
  locationName: string | null;
  clipSeconds: number | null;
}) {
  const [picking, setPicking] = useState(false);
  const methods = {
    kling: {
      label: "Rebuild the setting",
      detail:
        "Kling 3.0 Omni paints a new background with matching light and camera movement. People may shift slightly.",
    },
    "ltx-alpha": {
      label: "Keep the take, swap the plate",
      detail:
        "LTX 2.5 Alpha Gen mattes the people and lays them over a still or clip, untouched, in their original light.",
    },
  } as const;
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium">How</legend>
      <div className="mt-2 flex flex-col gap-1">
        {(Object.keys(methods) as BackgroundPipelineChoice[]).map((option) => (
          <label
            key={option}
            className="flex cursor-pointer gap-3 rounded-lg px-2 py-2 hover:bg-surface has-focus-visible:ring-2 has-focus-visible:ring-ring"
          >
            <input
              type="radio"
              name="background-pipeline"
              checked={pipeline === option}
              onChange={() => onPipeline(option)}
              className="mt-1 accent-(--tungsten)"
            />
            <span>
              <span className="block text-sm">{methods[option].label}</span>
              <span className="block text-xs leading-5 text-muted-foreground">
                {methods[option].detail}
              </span>
            </span>
          </label>
        ))}
      </div>
      {pipeline === "ltx-alpha" && (
        <div className="revision-reveal mt-3 flex items-center gap-3 rounded-lg bg-surface p-2">
          {plate ? (
            <Thumbnail
              src={plate.thumbnailUrl}
              kind={plate.kind}
              className="aspect-video w-20 shrink-0 rounded-md"
            />
          ) : (
            <span className="grid aspect-video w-20 shrink-0 place-items-center rounded-md border border-dashed border-border">
              <Mountain
                aria-hidden="true"
                className="size-4 text-subtle-foreground"
              />
            </span>
          )}
          <span className="min-w-0 flex-1 text-xs leading-5">
            <span className="block truncate text-sm">
              {plate
                ? plate.title
                : locationName
                  ? `${locationName}, establishing view`
                  : "No plate yet"}
            </span>
            <span className="block text-muted-foreground">
              {plate
                ? plate.kind === "video"
                  ? "Clip plate; loops if shorter than the take."
                  : "Still plate."
                : "Pick a Location above, or a still or clip, like an LTX 2.5 plate."}
            </span>
          </span>
          {plate ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onPlate(null)}
            >
              Clear
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPicking(true)}
            >
              <Library aria-hidden="true" /> Choose plate
            </Button>
          )}
          <MediaPicker
            open={picking}
            onOpenChange={setPicking}
            title="Choose a plate"
            description="A still or a clip to put behind the take. Generated LTX 2.5 videos work well as moving plates."
            onSelect={onPlate}
          />
        </div>
      )}
      {pipeline === "ltx-alpha" &&
        clipSeconds !== null &&
        clipSeconds > ALPHA_MAX_SECONDS + 0.1 && (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Alpha Gen mattes the first {ALPHA_MAX_SECONDS} seconds, so the
            result is {ALPHA_MAX_SECONDS} seconds long.
          </p>
        )}
    </fieldset>
  );
}

function ElementChoice({
  kind,
  loading,
  candidates,
  elementId,
  stateId,
  onChoose,
}: {
  kind: ReplacementKind;
  loading: boolean;
  candidates: Element[];
  elementId: string | null;
  stateId: string | null;
  onChoose: (elementId: string | null, stateId: string | null) => void;
}) {
  const noun =
    kind === "character"
      ? "Character"
      : kind === "object"
        ? "Thing"
        : "Location";
  const optional = kind === "background" || kind === "restyle";
  const selected = candidates.find((e) => e.id === elementId) ?? null;
  const cover = (element: Element, state: ElementState | null) => {
    const reference = approvedReferences(element, state?.id)[0];
    return reference ? elementAssetUrl(reference.asset) : null;
  };
  return (
    <fieldset>
      <legend className="text-sm font-medium">
        {kind === "background"
          ? "New setting"
          : kind === "object"
            ? "Swap in"
            : kind === "restyle"
              ? "Look from a Location"
              : "New character"}
      </legend>
      {loading ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading Elements…</p>
      ) : candidates.length === 0 ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          No {noun}s yet.{" "}
          <Link to="/elements/new" className="text-foreground">
            Create a {noun}
          </Link>{" "}
          {kind === "background"
            ? "to reuse a place across shots, or describe the setting below."
            : kind === "object"
              ? "with approved references to swap it into shots."
              : kind === "restyle"
                ? "to borrow its look, or use a style image or words below."
                : "with approved references to cast them."}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1" aria-label={`${noun}s`}>
          {candidates.map((element) => {
            const active = element.id === elementId;
            const count = approvedReferences(element).length;
            const image = cover(element, null);
            return (
              <li key={element.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChoose(active && optional ? null : element.id, null)
                  }
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring",
                    active && "bg-surface",
                  )}
                >
                  <span className="size-10 shrink-0 overflow-hidden rounded-md bg-secondary">
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImageOff
                        aria-hidden="true"
                        className="m-auto mt-3 size-4 text-subtle-foreground"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {element.name}
                    </span>
                    <span
                      className={cn(
                        "block text-xs",
                        count ? "text-muted-foreground" : "text-warning",
                      )}
                    >
                      @{element.handle} ·{" "}
                      {count
                        ? `${count} approved ${count === 1 ? "reference" : "references"}`
                        : "No approved references"}
                    </span>
                  </span>
                  {active && (
                    <Check
                      aria-hidden="true"
                      className="mr-1 size-4 text-tungsten"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {selected && selected.states.length > 0 && (
        <div className="revision-reveal mt-3">
          <p className="text-xs text-muted-foreground" id="state-choice">
            {kind === "background" ? "Conditions" : "State"}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="state-choice"
            className="mt-1.5 flex flex-wrap gap-1.5"
          >
            {[null, ...selected.states].map((state) => (
              <button
                key={state?.id ?? "default"}
                type="button"
                role="radio"
                aria-checked={(state?.id ?? null) === stateId}
                onClick={() => onChoose(selected.id, state?.id ?? null)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-tungsten/70 aria-checked:text-foreground"
              >
                {state && cover(selected, state) && (
                  <img
                    src={cover(selected, state)!}
                    alt=""
                    className="-ml-1.5 size-5 rounded-full object-cover"
                  />
                )}
                {state?.name ?? "As established"}
              </button>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  );
}

function AngleChoice({
  angle,
  onAngle,
}: {
  angle: RestageAngle;
  onAngle: (angle: RestageAngle) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">New angle</legend>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        The take is filmed again from here: same performance, same timing.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {(Object.keys(RESTAGE_ANGLES) as RestageAngle[]).map((option) => (
          <label
            key={option}
            className={cn(
              "flex cursor-pointer flex-col rounded-lg border px-2.5 py-2 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
              angle === option
                ? "border-tungsten/70 bg-surface"
                : "border-border hover:bg-surface",
            )}
          >
            <input
              type="radio"
              name="restage-angle"
              className="sr-only"
              checked={angle === option}
              onChange={() => onAngle(option)}
            />
            <span className="text-sm">{RESTAGE_ANGLES[option].label}</span>
            <span className="text-xs leading-5 text-muted-foreground">
              {RESTAGE_ANGLES[option].description}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function StyleImageChoice({
  image,
  onImage,
}: {
  image: MediaItem | null;
  onImage: (image: MediaItem | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium">Or a style image</legend>
      <div className="mt-2 flex items-center gap-3 rounded-lg bg-surface p-2">
        {image ? (
          <Thumbnail
            src={image.thumbnailUrl}
            kind={image.kind}
            className="aspect-video w-20 shrink-0 rounded-md"
          />
        ) : (
          <span className="grid aspect-video w-20 shrink-0 place-items-center rounded-md border border-dashed border-border">
            <Palette
              aria-hidden="true"
              className="size-4 text-subtle-foreground"
            />
          </span>
        )}
        <span className="min-w-0 flex-1 text-xs leading-5">
          <span className="block truncate text-sm">
            {image ? image.title : "No style image"}
          </span>
          <span className="block text-muted-foreground">
            {image
              ? "Its palette, light and texture set the look."
              : "A painting, a still or a frame whose look you want."}
          </span>
        </span>
        {image ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onImage(null)}
          >
            Clear
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPicking(true)}
          >
            <Library aria-hidden="true" /> Choose image
          </Button>
        )}
        <MediaPicker
          open={picking}
          onOpenChange={setPicking}
          title="Choose a style image"
          description="A still whose look the shot should take on."
          kind="image"
          onSelect={onImage}
        />
      </div>
    </fieldset>
  );
}
