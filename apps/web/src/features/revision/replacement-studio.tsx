import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Brush,
  X,
  Check,
  Crosshair,
  Expand,
  FastForward,
  Film,
  Footprints,
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
  RotateCcw,
  Sparkles,
  UserRound,
  Video,
} from "lucide-react";
import {
  CLIP_PEOPLE,
  DEFAULT_PRESERVATION,
  EXTEND_PIPELINES,
  EXTEND_SECONDS,
  MOMENT_LIMITS,
  MOTION_ENGINES,
  MOTION_LIMITS,
  REFRAME_ASPECTS,
  RESTAGE_ANGLES,
  VFX_EFFECTS,
  approvedReferences,
  assetRefKey,
  modelCard,
  type AssetRef,
  type BackgroundPipelineChoice,
  type ExtendPipeline,
  type GenerationRequestInput,
  type MotionEngine,
  type MotionResolution,
  type PreservedAspect,
  type ReframeAspect,
  type RestageAngle,
  type VfxEffect,
} from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/features/library/model";
import {
  DurationBadge,
  MediaPicker,
  Thumbnail,
  trimClip,
  uploadFiles,
  useLibrary,
  type MediaItem,
} from "@/features/library";
import { acceptSnapshot, useGeneration } from "@/features/generation/store";
import { startSession } from "@/features/elements/generate";
import { useElements } from "@/features/elements/store";
import { MentionTextarea, resolveMentions } from "@/features/elements/mentions";
import { ElementCover } from "@/features/elements/visuals";
import { assetUrl } from "@/lib/media-url";
import {
  elementTypes,
  stateHandle,
  type Element,
  type ElementState,
} from "@/features/elements/model";
import { submitRevision } from "@/server/revisions";
import {
  shouldShowEstimate,
  useCostPreferences,
} from "@/features/settings/preferences";
import { estimateReplacement } from "./estimate";
import { preflight, type Preflight } from "./shot-checks";
import {
  cutOutPerson,
  requestScan,
  useShotScan,
  type ScanState,
} from "./shot-checks-client";
import {
  castFromWords,
  nextPerson,
  personMention,
  withoutPerson,
  type ClipPerson,
} from "./clip-people";
import {
  LTX_REVISION_SECONDS,
  checkKlingSource,
  defaultElement,
  kindElementTypes,
  formatEstimate,
  formatTimecode,
  preservedLabels,
  replacementKinds,
  studioModel,
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
  // The take is the effect's reference, frame for frame.
  effect: ["performance", "timing", "camera", "framing"],
  // Only the painted pixels are redrawn; every frame keeps its place.
  area: ["timing", "camera", "framing"],
  // The take either side of the moment is spliced back untouched.
  moment: ["framing", "audio"],
  // The take itself plays first, as shot.
  extend: ["performance", "timing", "camera", "framing", "audio"],
  // The take sits whole inside the new frame.
  reframe: ["performance", "timing", "camera"],
  // The clip is the choreography; its sound is laid back under the new shot.
  moves: ["performance", "timing", "camera", "audio"],
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
  effect: ["performance", "timing", "camera", "framing", "audio"],
  area: ["timing", "camera", "framing", "audio"],
  moment: ["framing", "audio"],
  extend: ["performance", "timing", "camera", "framing", "audio"],
  reframe: ["performance", "timing", "camera", "audio"],
  moves: ["performance", "timing", "camera", "audio"],
};
/** The shared defaults where a kind has them; the take edits keep all they offer. */
const DEFAULT_KEPT: Record<ReplacementKind, readonly PreservedAspect[]> = {
  background: DEFAULT_PRESERVATION.background.preserve,
  character: DEFAULT_PRESERVATION.character.preserve,
  object: DEFAULT_PRESERVATION.object.preserve,
  restyle: DEFAULT_PRESERVATION.restyle.preserve,
  camera: DEFAULT_PRESERVATION.restage.preserve,
  effect: DEFAULT_PRESERVATION.vfx.preserve,
  area: OFFERED.area,
  moment: OFFERED.moment,
  extend: OFFERED.extend,
  reframe: OFFERED.reframe,
  moves: OFFERED.moves,
};

/** What runs where, so the composer reads the right limits. */
const KLING_KINDS: readonly ReplacementKind[] = ["background", "character"];
/** In the front page's order: swaps, then take edits, then effects and looks. */
const KIND_ICONS = {
  background: Mountain,
  character: UserRound,
  moves: Footprints,
  object: Package,
  area: Brush,
  moment: RotateCcw,
  extend: FastForward,
  reframe: Expand,
  // As the front page's "More": effects, then looks.
  effect: Sparkles,
  restyle: Palette,
  camera: Video,
} as const satisfies Record<ReplacementKind, unknown>;
/** Fix an area keeps 81 frames, about three seconds. */
const AREA_REVISION_SECONDS = 3;
/** Moment lengths offered, in seconds, within `MOMENT_LIMITS`. */
const MOMENT_LENGTHS = [1, 2, 3] as const;
/** Stretch lengths offered for a clip longer than one run copies. */
const MOVES_LENGTHS = [4, 6, 8, 10] as const;
/** Each Wan engine's sizes; Wan Animate 2 renders the lower two. */
const MOVES_RESOLUTIONS: Record<
  Exclude<MotionEngine, "ltx-edges">,
  readonly MotionResolution[]
> = {
  "wan-3": ["480p", "720p", "1080p"],
  "wan-animate": ["480p", "720p"],
};

export function ReplacementStudio({
  initialSource,
  initialKind = "background",
  initialElementId,
  projectId,
  parentRevisionId,
  draft,
}: {
  initialSource?: AssetRef | null;
  initialKind?: ReplacementKind | undefined;
  initialElementId?: string | undefined;
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
  const [kind, setKind] = useState<ReplacementKind>(draft?.kind ?? initialKind);
  /** Undefined until the creator chooses, so a sensible default can stand in; null is "none". */
  const [elementId, setElementId] = useState<string | null | undefined>(
    draft ? (draft.element?.id ?? null) : initialElementId,
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
  >(() => {
    const sets = {} as Record<ReplacementKind, Set<PreservedAspect>>;
    for (const k of Object.keys(KIND_ICONS) as ReplacementKind[])
      sets[k] = new Set(draft?.kind === k ? draft.preserve : DEFAULT_KEPT[k]);
    return sets;
  });
  const [angle, setAngle] = useState<RestageAngle>(
    draft?.draft?.angle ?? "closer",
  );
  const [effect, setEffect] = useState<VfxEffect>(
    draft?.draft?.effect ?? "clean-plate",
  );
  const [keep, setKeep] = useState(draft?.draft?.keep ?? "");
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

  const [extendPipeline, setExtendPipeline] = useState<ExtendPipeline>(
    draft?.draft?.extendPipeline ?? "seedance",
  );
  const [extendSeconds, setExtendSeconds] = useState<
    (typeof EXTEND_SECONDS)[number]
  >(
    EXTEND_SECONDS.find((s) => s === draft?.draft?.extendSeconds) ??
      EXTEND_SECONDS[0],
  );
  /** The moment's start and length; null until the creator moves it. */
  const [momentStart, setMomentStart] = useState<number | null>(
    draft?.draft?.range?.start ?? null,
  );
  const [momentLength, setMomentLength] = useState<number>(
    draft?.draft?.range
      ? Math.min(
          MOMENT_LIMITS.maxSeconds,
          draft.draft.range.end - draft.draft.range.start,
        )
      : 2,
  );
  /** Copy the moves: the stretch's length, the engine, its size and the new place. */
  const [movesLength, setMovesLength] = useState<number>(
    draft?.kind === "moves" && draft.draft?.range
      ? draft.draft.range.end - draft.draft.range.start
      : MOTION_LIMITS.maxSeconds,
  );
  const [engine, setEngine] = useState<Exclude<MotionEngine, "ltx-edges">>(
    draft?.draft?.engine === "wan-animate" ? "wan-animate" : "wan-3",
  );
  const [resolutionChoice, setResolutionChoice] = useState<MotionResolution>(
    draft?.draft?.resolution ?? "720p",
  );
  const [locationId, setLocationId] = useState<string | null>(
    draft?.draft?.locationId ?? null,
  );
  /** Copy the moves: people tagged on a frame, as `@person1`, `@person2`, … Not kept in drafts. */
  const [people, setPeople] = useState<ClipPerson[]>([]);
  /** Cut-outs already saved to the library, so a retry does not upload again. */
  const cutOuts = useRef(new Map<string, MediaItem>());
  const directionInput = useRef<HTMLTextAreaElement | null>(null);
  /** Progress of cutting the stretch out of a long clip, 0 to 1. */
  const [cutting, setCutting] = useState<number | null>(null);
  /** Stretches already cut and uploaded, so a retry does not upload again. */
  const cuts = useRef(new Map<string, MediaItem>());
  const [aspectChoice, setAspectChoice] = useState<ReframeAspect | null>(
    draft?.draft?.aspect ?? null,
  );
  /** The painted area as a small black-and-white PNG; not kept in drafts. */
  const [mask, setMask] = useState<string | null>(null);
  const [maskEpoch, setMaskEpoch] = useState(0);

  const elementType = kindElementTypes[kind];
  const candidates = elementType
    ? elements.filter((e) => e.type === elementType)
    : [];
  const kling = KLING_KINDS.includes(kind);
  const element =
    elementId === undefined
      ? defaultElement(kind, candidates)
      : (candidates.find((e) => e.id === elementId) ?? null);
  const state = element?.states.find((s) => s.id === stateId) ?? null;
  const references = element ? approvedReferences(element, state?.id) : [];
  const preserved = preserve[kind];
  const clipSeconds = source?.durationSeconds ?? measured?.seconds ?? null;
  const frameWidth = source?.width ?? measured?.width ?? null;
  const frameHeight = source?.height ?? measured?.height ?? null;
  const sourceRatio =
    frameWidth && frameHeight ? frameWidth / frameHeight : null;
  // A portrait take goes wide by default; anything else goes vertical.
  const aspect: ReframeAspect =
    aspectChoice ?? (sourceRatio !== null && sourceRatio < 1 ? "16:9" : "9:16");
  const sameShape = (option: ReframeAspect) =>
    sourceRatio !== null &&
    Math.abs(REFRAME_ASPECTS[option].ratio / sourceRatio - 1) < 0.03;
  const range =
    kind === "moves"
      ? movesRange(clipSeconds, momentStart, movesLength, engine)
      : momentRange(clipSeconds, momentStart, momentLength);
  const resolution = MOVES_RESOLUTIONS[engine].includes(resolutionChoice)
    ? resolutionChoice
    : "720p";
  const locations =
    kind === "moves" ? elements.filter((e) => e.type === "location") : [];
  const place = locations.find((e) => e.id === locationId) ?? null;
  const placeReferences = place ? approvedReferences(place) : [];
  /** Who each tagged person becomes, read from the words. */
  const cast =
    kind === "moves" && people.length
      ? castFromWords(direction, people, candidates)
      : [];
  const tagged = kind === "moves" && people.length > 0;
  const peopleMentions = useMemo(
    () =>
      people.map((p) => ({
        handle: personMention(p.person).slice(1),
        name: `Person ${p.person}`,
        label: `Tagged at ${formatTimecode(p.timeMs / 1000)}`,
        thumbnail: p.url,
      })),
    [people],
  );
  /** What one run copies: the chosen stretch, or the whole clip when it fits. */
  const movesSeconds = range
    ? range.end - range.start
    : clipSeconds === null
      ? null
      : Math.min(clipSeconds, MOTION_LIMITS.maxSeconds);
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

  /** Words put something new in the area; otherwise it is cleared. */
  const areaAdds = direction.trim().length >= 3;
  const preferences = useCostPreferences();
  const estimate = formatEstimate(
    estimateReplacement(
      kind,
      clipSeconds,
      pipeline,
      { extendPipeline, extendSeconds, areaAdds },
      { engine, seconds: movesSeconds, resolution },
    ),
    preferences.unit,
  );
  const model = studioModel(kind, {
    pipeline,
    extendPipeline,
    areaAdds,
    engine,
  });
  const card = modelCard(model);

  // The open-weights modes revise the start of the take; the area graph makes 81 frames.
  const revisedSeconds =
    kling || kind === "moment" || kind === "extend" || kind === "moves"
      ? null
      : kind === "area"
        ? AREA_REVISION_SECONDS
        : LTX_REVISION_SECONDS;
  // Said once, in the line above, rather than again in the estimate's note.
  const estimateNote =
    estimate.note
      ?.replace(/\s*Uses the first \d+ seconds of the take\./, "")
      .trim() || null;

  const problems: string[] = [];
  if (!source) problems.push("Choose a take to change.");
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
  if (
    kind === "effect" &&
    effect === "clean-plate" &&
    keep.trim().length > 0 &&
    keep.trim().length < 3
  )
    problems.push("Name who stays in a few words, or leave it empty.");
  if (kind === "area" && !mask)
    problems.push("Paint over the area to fix on the frame.");
  if (kind === "moment" && direction.trim().length < 3)
    problems.push("Describe what happens in the moment.");
  if (kind === "moment" && clipSeconds !== null && clipSeconds < 1.5)
    problems.push("Redoing a moment needs a take of at least 1.5 seconds.");
  if (
    kind === "extend" &&
    extendPipeline === "seedance" &&
    element &&
    !references.length
  )
    problems.push(`${element.name} needs an approved reference first.`);
  if (kind === "reframe" && sameShape(aspect))
    problems.push("The take is already this shape. Choose another.");
  if (tagged && engine !== "wan-3")
    problems.push(
      "Tagged people need Wan 3.0; Wan Animate 2 copies one person.",
    );
  if (tagged && !cast.length)
    problems.push(
      `Say who ${personMention(people[0]!.person)} becomes: “Replace ${personMention(people[0]!.person)} with @${candidates[0]?.handle ?? "Cal"}”.`,
    );
  if (cast.length > CLIP_PEOPLE.maxSwaps)
    problems.push(`One run swaps up to ${CLIP_PEOPLE.maxSwaps} people.`);
  for (const pair of cast) {
    const person = people.find((p) => p.person === pair.person);
    if (person?.status === "cutting")
      problems.push(`Cutting ${personMention(pair.person)} out of the frame…`);
    if (!approvedReferences(pair.element, pair.state?.id).length)
      problems.push(`${pair.element.name} needs an approved reference first.`);
  }
  if (kind === "moves" && !tagged && !element)
    problems.push("Choose the Character who performs the moves.");
  if (kind === "moves" && !tagged && element && !references.length)
    problems.push(`${element.name} needs an approved reference first.`);
  if (kind === "moves" && place && !placeReferences.length)
    problems.push(`${place.name} needs an approved reference first.`);
  if (kind === "moves" && source && clipSeconds === null)
    problems.push("Reading the clip’s length…");
  if (
    kind === "moves" &&
    clipSeconds !== null &&
    clipSeconds < MOTION_LIMITS.minSeconds
  )
    problems.push(
      `Copying the moves needs a clip of at least ${MOTION_LIMITS.minSeconds} seconds.`,
    );

  function chooseKind(next: ReplacementKind) {
    if (next === kind) return;
    setKind(next);
    // Cal stays chosen from Redo a moment to Recast; a Location from Restyle to Replace background.
    if (kindElementTypes[next] !== elementType) {
      setElementId(undefined);
      setStateId(null);
    }
    setPendingKey(null);
    setError("");
  }
  /** A mention of the mode's Element type in the words chooses that Element. */
  function writeDirection(next: string) {
    setDirection(next);
    setPendingKey(null);
    const named = resolveMentions(next, candidates)
      .filter((m) => m.element)
      .at(-1);
    if (!named?.element) return;
    const nextState = named.state?.id ?? null;
    if (named.element.id === element?.id && nextState === stateId) return;
    setElementId(named.element.id);
    setStateId(nextState);
  }
  function chooseSource(item: MediaItem) {
    setSourceKey(assetRefKey(item.ref));
    setTarget(null);
    for (const person of people)
      if (person.url) URL.revokeObjectURL(person.url);
    setPeople([]);
    setMask(null);
    setMaskEpoch((n) => n + 1);
    setMomentStart(null);
    setMeasured(null);
    setPendingKey(null);
  }
  /**
   * A click on the frame tags that person: they are cut out of the frame for
   * the model, and the words gain "Replace @personN with @" so the Character
   * list opens right where the creator types.
   */
  function tagPerson(point: Target) {
    if (!source) return;
    const person = nextPerson(people);
    if (person === null) return;
    setPeople((current) => [
      ...current,
      {
        person,
        ...point,
        status: "cutting",
        box: null,
        found: false,
        blob: null,
        url: null,
      },
    ]);
    setPendingKey(null);
    cutOutPerson(source.url, point).then(
      ({ box, found, blob }) =>
        setPeople((current) =>
          current.map((p) =>
            p.person === person && p.timeMs === point.timeMs
              ? {
                  ...p,
                  status: "ready",
                  box,
                  found,
                  blob,
                  url: URL.createObjectURL(blob),
                }
              : p,
          ),
        ),
      () =>
        setPeople((current) =>
          current.map((p) =>
            p.person === person ? { ...p, status: "failed" } : p,
          ),
        ),
    );
    const mention = personMention(person);
    if (direction.includes(mention)) return;
    const before = direction.trim();
    const next = `${before}${before ? (/[.!?]$/.test(before) ? " " : ". ") : ""}Replace ${mention} with @`;
    setDirection(next);
    requestAnimationFrame(() => {
      const input = directionInput.current;
      if (!input) return;
      // Caret first, so focusing opens the Character list right after the `@`.
      input.setSelectionRange(next.length, next.length);
      input.focus({ preventScroll: true });
    });
  }
  function untagPerson(person: number) {
    const gone = people.find((p) => p.person === person);
    if (gone?.url) URL.revokeObjectURL(gone.url);
    setPeople((current) => current.filter((p) => p.person !== person));
    setDirection((current) => withoutPerson(current, person));
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

  const mention = element
    ? `@${element.handle}${state ? `:${stateHandle(state)}` : ""}`
    : null;
  /** The direction with the chosen Element named in it, so the prompt can describe them. */
  const directed =
    mention && !direction.includes(`@${element!.handle}`)
      ? `${mention} ${direction.trim()}`.trim()
      : direction.trim();

  function intentSentence() {
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
    if (kind === "effect") {
      const words = note || VFX_EFFECTS[effect].fallback;
      if (effect === "water")
        return `Add water to this take: ${words}, keeping the performance and camera.`;
      if (effect === "night")
        return `Turn this take to night, lit by ${words}, keeping the performance and camera.`;
      const who = keep.trim().replace(/[.\s]+$/, "");
      const lower = words.replace(/^(The|A|An) /, (a) => a.toLowerCase());
      return `Clear ${lower} from this take${who ? `, keeping ${who.replace(/^(The|A|An) /, (a) => a.toLowerCase())} exactly as shot` : ""}, and rebuild what was behind them.`;
    }
    if (kind === "area") {
      return note
        ? `Redraw the painted area: ${note}. Everything outside it stays as shot.`
        : "Clear what is under the painted area and rebuild what was behind it. Everything outside it stays as shot.";
    }
    if (kind === "moment") {
      const when = range
        ? `${formatTimecode(range.start)} to ${formatTimecode(range.end)}`
        : "the chosen moment";
      return `Act ${when} again: ${note ? `${note[0]!.toLowerCase()}${note.slice(1)}` : "describe what happens"}${mention && !note.includes(mention) ? `, with ${mention}` : ""}. The take either side stays as shot.`;
    }
    if (kind === "extend") {
      const more =
        extendPipeline === "seedance"
          ? `${extendSeconds} more seconds`
          : "about 3 more seconds";
      const who =
        mention && !note.includes(mention) ? ` ${mention} comes in.` : "";
      return `Carry this shot on for ${more}, straight from its last frame.${who}${after}`;
    }
    if (kind === "moves" && cast.length) {
      const when = range
        ? ` from ${formatTimecode(range.start)} to ${formatTimecode(range.end)}`
        : "";
      const where = place ? ` in @${place.handle}` : "";
      const swaps = cast.map(
        (pair) =>
          `${personMention(pair.person)} becomes @${pair.element.handle}`,
      );
      const list =
        swaps.length === 1
          ? swaps[0]!
          : `${swaps.slice(0, -1).join(", ")} and ${swaps.at(-1)!}`;
      return `${list[0]!.toUpperCase()}${list.slice(1)}, copying every move${when}${where}. Everyone else stays as filmed.`;
    }
    if (kind === "moves") {
      const who =
        targetNote
          .trim()
          .replace(/[.\s]+$/, "")
          .replace(/^(The|A|An) /, (article) => article.toLowerCase()) ||
        "the performer";
      const when = range
        ? ` from ${formatTimecode(range.start)} to ${formatTimecode(range.end)}`
        : "";
      const where = place
        ? `, in @${place.handle}`
        : ", in the clip’s own place";
      return `${mention ?? "A Character"} takes the place of ${who} and copies every move${when}${where}.${after}`;
    }
    if (kind === "reframe")
      return `Reframe this shot to ${REFRAME_ASPECTS[aspect].label.toLowerCase()} ${aspect}, drawing in the new edges around the take as shot.${after}`;
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
    return `Replace ${who} with ${mention ?? "a Character"}, ${dress}, preserving their performance and everything else in the shot.`;
  }

  /** The four take edits; null for the other kinds. */
  function takeEditRequest(): GenerationRequestInput | null {
    if (!source) return null;
    const preservation = {
      preserve: kept.filter((a) => OFFERED[kind].includes(a)),
      allowIntegration: false,
    };
    const mentions = element
      ? [{ elementId: element.id, ...(state ? { stateId: state.id } : {}) }]
      : [];
    const words = directed.length >= 3 ? { prompt: directed } : {};
    if (kind === "area" && mask)
      return {
        workflowKind: "video.area",
        inputs: {
          source: source.ref,
          mask,
          ...words,
          preservation,
        },
      };
    if (kind === "moment" && range)
      return {
        workflowKind: "video.moment",
        inputs: {
          source: source.ref,
          range,
          prompt: directed,
          mentions,
          preservation,
        },
      };
    if (kind === "extend")
      return {
        workflowKind: "video.extend",
        inputs: {
          source: source.ref,
          pipeline: extendPipeline,
          seconds: extendSeconds,
          ...words,
          mentions,
          preservation,
        },
      };
    if (kind === "reframe")
      return {
        workflowKind: "video.reframe",
        inputs: { source: source.ref, aspect, ...words, preservation },
      };
    return null;
  }

  /**
   * Copy the moves sends only the stretch: a long clip is cut in the browser
   * and saved to the library first, so the model reads, and bills, just that.
   */
  async function movesRequest(): Promise<GenerationRequestInput | null> {
    const performer = cast[0]?.element ?? element;
    if (!source || !performer || movesSeconds === null) return null;
    let clip = source;
    if (range) {
      const key = `${assetRefKey(source.ref)}@${range.start}-${range.end}`;
      const cut = cuts.current.get(key);
      if (cut) clip = cut;
      else {
        setCutting(0);
        try {
          const file = await trimClip(
            source.url,
            range.start,
            range.end,
            `${source.title.replace(/\.[^.]+$/, "")} ${formatTimecode(range.start)}–${formatTimecode(range.end)}.mp4`,
            setCutting,
          );
          const [item] = await uploadFiles([file]);
          if (!item) {
            setError(
              "The stretch could not be saved to your library. Try again.",
            );
            return null;
          }
          cuts.current.set(key, item);
          clip = item;
        } catch (e) {
          setError(
            `${e instanceof Error ? e.message : "The clip could not be cut."} Trim it to ${MOTION_LIMITS.maxSeconds} seconds or less and upload it again.`,
          );
          return null;
        } finally {
          setCutting(null);
        }
      }
    }
    const swaps = await castRequest();
    if (!swaps) return null;
    const lead = cast[0];
    const character = lead
      ? {
          elementId: lead.element.id,
          ...(lead.state ? { stateId: lead.state.id } : {}),
        }
      : {
          elementId: performer.id,
          ...(state ? { stateId: state.id } : {}),
        };
    return {
      workflowKind: "video.performance-transfer",
      inputs: {
        source: clip.ref,
        engine,
        character,
        cast: swaps,
        ...(place ? { location: { elementId: place.id } } : {}),
        ...(!swaps.length && targetNote.trim().length >= 3
          ? { performer: targetNote.trim().slice(0, 200) }
          : {}),
        prompt: directed.length >= 3 ? directed : `${mention} copies the moves`,
        seconds: Math.round(movesSeconds * 100) / 100,
        resolution,
        sound: clip.hasAudio !== false,
        mentions: [],
      },
    };
  }

  /**
   * Each swap with its cut-out saved to the library, and the click moved into
   * the time of the stretch that is sent. Null when a cut-out could not be saved.
   */
  async function castRequest() {
    const offset = range ? range.start * 1000 : 0;
    const swaps = [];
    for (const pair of cast) {
      const person = people.find((p) => p.person === pair.person)!;
      const key = `${person.person}@${person.timeMs}:${person.x}:${person.y}`;
      let crop = cutOuts.current.get(key) ?? null;
      if (!crop && person.blob) {
        const [item] = await uploadFiles([
          new File(
            [person.blob],
            `${source!.title.replace(/\.[^.]+$/, "")} ${personMention(person.person).slice(1)} ${formatTimecode(person.timeMs / 1000)}.jpg`,
            { type: "image/jpeg" },
          ),
        ]);
        if (!item) {
          setError(
            `${personMention(person.person)}’s cut-out could not be saved. Try again.`,
          );
          return null;
        }
        cutOuts.current.set(key, item);
        crop = item;
      }
      swaps.push({
        person: pair.person,
        character: {
          elementId: pair.element.id,
          ...(pair.state ? { stateId: pair.state.id } : {}),
        },
        point: {
          x: person.x,
          y: person.y,
          timeMs: Math.max(0, Math.round(person.timeMs - offset)),
        },
        ...(crop ? { crop: crop.ref } : {}),
      });
    }
    return swaps;
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
      // Keeping the source wardrobe or the Character's own look is already
      // worded by the request builder from `preservation`; an empty note
      // leaves the prompt out, as the other kinds do.
      const recastPrompt = [
        wardrobe === "describe"
          ? `Wardrobe for this shot: ${wardrobeNote.trim()}.`
          : "",
        direction.trim(),
      ]
        .filter(Boolean)
        .join(" ");
      const takeEdit =
        kind === "moves" ? await movesRequest() : takeEditRequest();
      if (kind === "moves" && !takeEdit) return;
      const request: GenerationRequestInput = takeEdit
        ? takeEdit
        : kind === "object"
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
            : kind === "effect"
              ? {
                  workflowKind: "video.vfx",
                  inputs: {
                    source: source.ref,
                    effect,
                    ...(direction.trim().length >= 3
                      ? { prompt: direction.trim() }
                      : {}),
                    ...(effect === "clean-plate" && keep.trim().length >= 3
                      ? { keep: keep.trim() }
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
                        ...(recastPrompt.length >= 3
                          ? { prompt: recastPrompt }
                          : {}),
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
            : kind === "area"
              ? "The painted area"
              : kind === "moment"
                ? range
                  ? `${formatTimecode(range.start)} to ${formatTimecode(range.end)}`
                  : "A moment"
                : kind === "moves"
                  ? [
                      targetNote.trim(),
                      range
                        ? `${formatTimecode(range.start)} to ${formatTimecode(range.end)}`
                        : "The whole clip",
                    ]
                      .filter(Boolean)
                      .join(", ")
                      .slice(0, 300)
                  : kind === "extend"
                    ? extendPipeline === "seedance"
                      ? `${extendSeconds} more seconds`
                      : "About 3 more seconds"
                    : kind === "reframe"
                      ? `${REFRAME_ASPECTS[aspect].label} (${aspect})`
                      : kind === "restyle"
                        ? "The whole look"
                        : kind === "effect"
                          ? `Effect: ${VFX_EFFECTS[effect].label}`
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
          effect: kind === "effect" ? effect : null,
          keep:
            kind === "effect" && effect === "clean-plate"
              ? keep.trim().slice(0, 200)
              : null,
          extendPipeline: kind === "extend" ? extendPipeline : null,
          extendSeconds: kind === "extend" ? extendSeconds : null,
          range: kind === "moment" || kind === "moves" ? range : null,
          engine: kind === "moves" ? engine : null,
          resolution: kind === "moves" ? resolution : null,
          locationId: kind === "moves" ? (place?.id ?? null) : null,
          aspect: kind === "reframe" ? aspect : null,
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
      {/* On a tall enough desktop the take stays in view while the choices
          scroll beside it, so tagging and naming happen side by side. */}
      <div className="min-w-0 [@media(min-width:1024px)_and_(min-height:820px)]:sticky [@media(min-width:1024px)_and_(min-height:820px)]:top-20 [@media(min-width:1024px)_and_(min-height:820px)]:self-start">
        <SourceStage
          source={source}
          markTarget={
            kind === "character" ||
            kind === "object" ||
            (kind === "moves" && engine === "wan-3")
          }
          markLabel={
            kind === "object"
              ? "Click the object to swap"
              : kind === "moves"
                ? people.length >= CLIP_PEOPLE.max
                  ? `${CLIP_PEOPLE.max} people tagged`
                  : "Pause and click a person to tag them"
                : "Click the person to recast"
          }
          target={kind === "moves" ? null : target}
          onTarget={(next) => {
            if (kind === "moves") return tagPerson(next);
            setTarget(next);
            setPendingKey(null);
          }}
          scanOnMark={kind === "character"}
          people={kind === "moves" ? people : []}
          personBox={shotCheck?.box ?? null}
          onMetadata={setMeasured}
          paint={kind === "area"}
          paintKey={maskEpoch}
          onMask={(next) => {
            setMask(next);
            setPendingKey(null);
          }}
          moment={
            (kind === "moment" || kind === "moves") && range && clipSeconds
              ? {
                  range,
                  seconds: clipSeconds,
                  noun: kind === "moves" ? "stretch" : "moment",
                }
              : null
          }
          onMomentStart={(start) => {
            setMomentStart(start);
            setPendingKey(null);
          }}
          reframeRatio={
            kind === "reframe" ? REFRAME_ASPECTS[aspect].ratio : null
          }
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
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {(Object.keys(KIND_ICONS) as ReplacementKind[]).map((option) => {
              const Icon = KIND_ICONS[option];
              return (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
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
                      "size-4 shrink-0",
                      kind === option
                        ? "text-tungsten"
                        : "text-subtle-foreground",
                    )}
                  />
                  <span className="truncate text-sm">
                    {replacementKinds[option].label}
                  </span>
                </label>
              );
            })}
          </div>
          {/* One line for the chosen kind keeps ten choices scannable. */}
          <p
            key={kind}
            className="revision-reveal mt-2 text-xs leading-5 text-muted-foreground"
          >
            {replacementKinds[kind].changes}
          </p>
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

        {kind === "effect" ? (
          <EffectChoice
            effect={effect}
            onEffect={(next) => {
              setEffect(next);
              setPendingKey(null);
            }}
          />
        ) : kind === "camera" ? (
          <AngleChoice
            angle={angle}
            onAngle={(next) => {
              setAngle(next);
              setPendingKey(null);
            }}
          />
        ) : kind === "reframe" ? (
          <AspectChoice
            aspect={aspect}
            disabled={sameShape}
            onAspect={(next) => {
              setAspectChoice(next);
              setPendingKey(null);
            }}
          />
        ) : kind === "extend" ? (
          <ExtendMethod
            pipeline={extendPipeline}
            onPipeline={(next) => {
              setExtendPipeline(next);
              setPendingKey(null);
            }}
            seconds={extendSeconds}
            onSeconds={(next) => {
              setExtendSeconds(next);
              setPendingKey(null);
            }}
          />
        ) : kind === "moves" ? (
          <MovesStretch
            length={movesLength}
            range={range}
            clipSeconds={clipSeconds}
            most={MOTION_ENGINES[engine].maxSeconds}
            onLength={(next) => {
              setMovesLength(next);
              setPendingKey(null);
            }}
          />
        ) : kind === "moment" ? (
          <MomentLength
            length={momentLength}
            range={range}
            onLength={(next) => {
              setMomentLength(next);
              setPendingKey(null);
            }}
          />
        ) : kind === "area" ? (
          <AreaHint
            painted={!!mask}
            onClear={() => {
              setMask(null);
              setMaskEpoch((n) => n + 1);
              setPendingKey(null);
            }}
          />
        ) : null}

        {kind === "moves" && engine === "wan-3" && (
          <ClipPeople people={people} cast={cast} onRemove={untagPerson} />
        )}

        {elementType && !tagged && (
          <ElementChoice
            key={kind}
            kind={kind}
            loading={elementsStatus === "loading"}
            candidates={candidates}
            elementId={element?.id ?? null}
            stateId={stateId}
            onChoose={(id, nextState) => {
              setElementId(id);
              setStateId(nextState);
              setPendingKey(null);
            }}
          />
        )}

        {kind === "moves" && !tagged && (
          <div className="revision-reveal">
            <label htmlFor="moves-performer" className="text-sm font-medium">
              Whose moves (optional)
            </label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Say who to copy when the clip has more than one person; everyone
              else stays as they are.
            </p>
            <input
              id="moves-performer"
              value={targetNote}
              onChange={(event) => {
                setTargetNote(event.target.value);
                setPendingKey(null);
              }}
              maxLength={200}
              placeholder="The dancer in the middle, in the grey shirt"
              className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}

        {kind === "moves" && (
          <ElementChoice
            kind={kind}
            place
            loading={elementsStatus === "loading"}
            candidates={locations}
            elementId={place?.id ?? null}
            stateId={null}
            onChoose={(id) => {
              setLocationId(id);
              setPendingKey(null);
            }}
          />
        )}

        {kind === "moves" && (
          <MovesEngine
            engine={engine}
            onEngine={(next) => {
              setEngine(next);
              setPendingKey(null);
            }}
            resolution={resolution}
            onResolution={(next) => {
              setResolutionChoice(next);
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

        {kind === "effect" && effect === "clean-plate" && (
          <div className="revision-reveal">
            <label htmlFor="effect-keep" className="text-sm font-medium">
              Who stays (optional)
            </label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              They are found in every frame and kept exactly as shot; everyone
              else is cleared.
            </p>
            <input
              id="effect-keep"
              value={keep}
              onChange={(event) => {
                setKeep(event.target.value);
                setPendingKey(null);
              }}
              maxLength={200}
              placeholder="The couple holding hands"
              className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}

        {!alpha && (
          <div>
            <label htmlFor="revision-direction" className="text-sm font-medium">
              {kind === "effect"
                ? `${VFX_EFFECTS[effect].ask} (optional)`
                : kind === "background"
                  ? element
                    ? "Anything else about the setting (optional)"
                    : "Describe the new setting"
                  : kind === "restyle"
                    ? element || styleImage
                      ? "Describe the look (optional)"
                      : "Describe the look"
                    : kind === "camera"
                      ? "What is in the shot (optional)"
                      : kind === "area"
                        ? "What goes there instead (optional)"
                        : kind === "moves"
                          ? tagged
                            ? "Who becomes whom"
                            : "Anything else about the shot (optional)"
                          : kind === "moment"
                            ? "What happens instead"
                            : kind === "extend"
                              ? "What happens next (optional)"
                              : kind === "reframe"
                                ? "What is around the shot (optional)"
                                : kind === "object"
                                  ? "How it sits in the shot (optional)"
                                  : "How they play it (optional)"}
            </label>
            <MentionTextarea
              id="revision-direction"
              value={direction}
              onValueChange={writeDirection}
              types={elementType ? [elementType] : []}
              inputRef={directionInput}
              extra={peopleMentions}
              maxLength={1500}
              rows={3}
              aria-describedby={
                elementType ? "revision-direction-mention" : undefined
              }
              className="mt-2 rounded-md px-3 py-2 text-sm leading-6"
              placeholder={
                kind === "background"
                  ? "Harbor at dusk, sodium lights coming on, light rain"
                  : kind === "effect"
                    ? VFX_EFFECTS[effect].placeholder
                    : kind === "object"
                      ? "Lit, with a soft flicker on the table"
                      : kind === "restyle"
                        ? "Hand-painted gouache, warm dusk palette, visible brush texture"
                        : kind === "camera"
                          ? "Two people talking across a kitchen table at night"
                          : kind === "area"
                            ? "Leave empty to clear it; or bare wooden table"
                            : kind === "moves"
                              ? tagged
                                ? `Replace ${personMention(people[0]!.person)} with @${candidates[0]?.handle ?? "Cal"}`
                                : "Keep the hand-held camera; a grin on the last beat"
                              : kind === "moment"
                                ? "He looks up and smiles, then nods"
                                : kind === "extend"
                                  ? "She turns and walks out of frame"
                                  : kind === "reframe"
                                    ? "A high kitchen ceiling with a pendant lamp"
                                    : "Slightly older, the same quiet intensity"
              }
            />
            {elementType && (
              <p
                id="revision-direction-mention"
                className="mt-1.5 text-xs leading-5 text-muted-foreground"
              >
                {tagged
                  ? "Type @ for a Character or a tagged person, e.g. “Replace @person2 with @Cal”."
                  : `Or type @ to name a ${elementTypes[elementType].label} in your words.`}
              </p>
            )}
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
          <p className="text-sm leading-6">
            <WithMentions text={intentSentence()} />
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Changes</dt>
            <dd>
              {alpha
                ? "Everything outside the matted people and Things"
                : kind === "background"
                  ? "Only the setting behind the people and Things"
                  : kind === "object"
                    ? "Only the object, and the light it casts nearby"
                    : kind === "effect"
                      ? effect === "clean-plate"
                        ? keep.trim()
                          ? "Everyone else, and what was behind them"
                          : "People and passing traffic, and what was behind them"
                        : effect === "night"
                          ? "The light of every frame, people included"
                          : "Water on every surface, people included"
                      : kind === "restyle"
                        ? "The look of every frame, people included"
                        : kind === "camera"
                          ? "Where the camera stands"
                          : kind === "area"
                            ? "Only what you painted"
                            : kind === "moves"
                              ? cast.length
                                ? `Only ${cast.map((c) => personMention(c.person)).join(", ")}${place ? ", and the place around them" : ""}`
                                : place
                                  ? "The performer, and the place around them"
                                  : "Only the performer"
                              : kind === "moment"
                                ? range
                                  ? `Only ${formatTimecode(range.start)} to ${formatTimecode(range.end)}, blended in at both ends`
                                  : "Only the chosen moment"
                                : kind === "extend"
                                  ? "Nothing in the take; new seconds follow it"
                                  : kind === "reframe"
                                    ? "Only the new edges around the take"
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
            <dt className="text-muted-foreground">Model</dt>
            <dd>
              {model}
              {card && (
                <span className="text-muted-foreground">
                  {" "}
                  · {card.maker} ·{" "}
                  {card.weights === "open" ? "open weights" : "hosted"} on{" "}
                  {card.runsOn}
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground">Project look</dt>
            <dd>
              {kind === "background"
                ? projectId
                  ? "Palette, light and texture follow the project"
                  : "None: no project chosen"
                : kind === "restyle"
                  ? "Not applied: the style you choose sets the look"
                  : kind === "character"
                    ? "Not applied: a recast changes the person, not the look"
                    : "Not applied: the result keeps the source’s look"}
            </dd>
            {shouldShowEstimate(preferences, "video") && (
              <>
                <dt className="text-muted-foreground">Cost</dt>
                <dd className="tabular">{estimate.cost}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Time</dt>
            <dd className="tabular">
              {estimate.time} · {estimate.basis.toLowerCase()}
            </dd>
          </dl>
          {estimateNote && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {estimateNote}
            </p>
          )}
          {revisedSeconds !== null &&
            clipSeconds !== null &&
            clipSeconds > revisedSeconds + 0.2 && (
              <p className="mt-2 text-xs leading-5 text-foreground">
                Only the first {revisedSeconds} seconds are revised, so the
                result is {revisedSeconds} seconds long.
              </p>
            )}
          {kind === "restyle" && (
            <p className="mt-2 text-xs leading-5 text-foreground">
              People are restyled too. Their faces follow the new look and can
              drift from the actors’ likeness; the check after the run says
              where.
            </p>
          )}
          {kind === "effect" && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {VFX_EFFECTS[effect].note}
            </p>
          )}
          {kind === "area" && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {areaAdds
                ? "Wan 2.1 VACE draws what you asked for in the area. It takes several minutes."
                : "LTX 2.3 clears what is under the paint and rebuilds what was behind it, in under a minute. Describe something to put there instead."}
            </p>
          )}
          {kind === "extend" && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              The new seconds are silent; the take keeps its sound.
            </p>
          )}
          {kind === "moves" && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {range
                ? "The stretch is cut here and saved to your library, so only it is sent. "
                : ""}
              {source?.hasAudio === false
                ? "The clip is silent, so the new shot is too. "
                : "The clip’s sound is laid back under the new shot. "}
              Use clips you have the rights to.
            </p>
          )}
          {kind === "reframe" && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              The take stays whole in the middle; the model draws what lies
              beyond its edges, which can be softer than the take.
            </p>
          )}
          {kind === "camera" && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              The camera moves a hand’s width or a step, not around the subject:
              the take is re-projected through its own depth and only what it
              never saw is filled in. There is no reverse shot.
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
            {cutting !== null
              ? `Cutting the stretch… ${Math.round(cutting * 100)}%`
              : busy
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
  scanOnMark,
  people,
  onMetadata,
  personBox,
  paint,
  paintKey,
  onMask,
  moment,
  onMomentStart,
  reframeRatio,
}: {
  source: MediaItem | null;
  markTarget: boolean;
  markLabel: string;
  target: Target | null;
  onTarget: (target: Target) => void;
  /** Recast: start the shot check as the pointer arrives. */
  scanOnMark: boolean;
  /** Copy the moves: everyone tagged so far, pinned where they were clicked. */
  people: readonly ClipPerson[];
  onMetadata: (metadata: ClipMetadata) => void;
  /** The person found under the mark, outlined so the creator can confirm it. */
  personBox: Preflight["box"];
  /** Fix an area: brush over the frame; the mask is exported on each stroke's end. */
  paint: boolean;
  /** Changes when the painted area is cleared, so the brush layer starts over. */
  paintKey: number;
  onMask: (mask: string | null) => void;
  /** Redo a moment or Copy the moves: the stretch shown on the scrub bar. */
  moment: {
    range: { start: number; end: number };
    seconds: number;
    noun: "moment" | "stretch";
  } | null;
  onMomentStart: (start: number) => void;
  /** Reframe: the new frame's shape, with the take inside it. */
  reframeRatio: number | null;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [frameRatio, setFrameRatio] = useState(16 / 9);
  const scrub = markTarget || paint;
  if (!source)
    return (
      <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border bg-surface text-center">
        <div className="max-w-xs px-6">
          <Film
            aria-hidden="true"
            className="mx-auto size-6 text-subtle-foreground"
          />
          <p className="mt-3 text-sm font-medium">Choose a take</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Upload footage or pick one of your clips below. The original is
            never changed.
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
    if (scanOnMark) requestScan(source!.url);
    onTarget({ x, y, timeMs: Math.round(v.currentTime * 1000) });
  }

  return (
    <figure className="m-0">
      <div
        className={cn(
          "relative mx-auto overflow-hidden rounded-xl",
          reframeRatio ? "reframe-stage" : "aspect-video bg-black",
          markTarget && "cursor-crosshair",
        )}
        style={
          reframeRatio
            ? {
                containerType: "size",
                aspectRatio: `${reframeRatio}`,
                // Tall shapes are capped by the viewport, not the column.
                width: `min(100%, calc(min(70vh, 40rem) * ${reframeRatio}))`,
              }
            : { containerType: "size" }
        }
        onPointerUp={mark}
        // Start analysing as the pointer arrives, so the check is ready by the click.
        onPointerEnter={
          markTarget && scanOnMark ? () => requestScan(source.url) : undefined
        }
      >
        <video
          key={source.id}
          ref={video}
          src={source.url}
          poster={source.thumbnailUrl ?? undefined}
          controls={!scrub && !moment}
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
          onClick={scrub ? (event) => event.preventDefault() : undefined}
        />
        {markTarget && target && (
          <TargetMarker target={target} ratio={frameRatio} box={personBox} />
        )}
        {people.length > 0 && (
          <PeopleMarkers people={people} ratio={frameRatio} video={video} />
        )}
        {paint && (
          <PaintLayer
            key={`${source.id}-${paintKey}`}
            ratio={frameRatio}
            onMask={onMask}
          />
        )}
      </div>
      {scrub && <ScrubBar video={video} />}
      {moment && (
        <MomentBar
          key={source.id}
          video={video}
          range={moment.range}
          seconds={moment.seconds}
          noun={moment.noun}
          onStart={onMomentStart}
        />
      )}
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
        {paint && (
          <span className="ml-auto flex items-center gap-1">
            <Brush aria-hidden="true" className="size-3" /> Paint over what to
            fix
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

/**
 * Each tagged person's pin and label. Pins show on every frame (they mark
 * where someone was clicked, not where they are now); the outline of the
 * person found shows only near the frame they were tagged on, so it never
 * sits on the wrong body while the clip is scrubbed.
 */
function PeopleMarkers({
  people,
  ratio,
  video,
}: {
  people: readonly ClipPerson[];
  ratio: number;
  video: { current: HTMLVideoElement | null };
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  // Follows the frame on each seek, not on every played frame.
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      const v = video.current;
      if (!node || !v) return;
      const sync = () => setNowMs(Math.round(v.currentTime * 1000));
      v.addEventListener("seeked", sync);
      v.addEventListener("pause", sync);
      sync();
      return () => {
        v.removeEventListener("seeked", sync);
        v.removeEventListener("pause", sync);
      };
    },
    [video],
  );
  return (
    <div
      ref={attach}
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{
        width: `min(100cqw, ${ratio * 100}cqh)`,
        height: `min(100cqh, ${100 / ratio}cqw)`,
      }}
    >
      {people.map((person) => {
        const away = nowMs === null ? 0 : Math.abs(nowMs - person.timeMs);
        const here = away < 120;
        // A pin marks a click on one frame; far from it, it would point at
        // nobody, so it fades out (kept mounted, so it never pops back in).
        const gone = away > 1500;
        return (
          <div
            key={person.person}
            className="person-pin-group"
            data-gone={gone || undefined}
          >
            {person.box && person.found && (
              <span
                data-away={!here || undefined}
                className="target-person person-outline absolute rounded-md border border-dashed border-tungsten/70"
                style={{
                  left: `${person.box.x * 100}%`,
                  top: `${person.box.y * 100}%`,
                  width: `${person.box.w * 100}%`,
                  height: `${person.box.h * 100}%`,
                }}
              />
            )}
            <span
              className="person-pin absolute flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full border border-tungsten bg-black/70 p-0.5 text-[11px] font-medium text-white shadow-[0_1px_8px_rgb(0_0_0/0.45)]"
              data-away={!here || undefined}
              data-cutting={person.status === "cutting" || undefined}
              style={{ left: `${person.x * 100}%`, top: `${person.y * 100}%` }}
            >
              <span className="relative grid size-4 place-items-center rounded-full bg-tungsten text-[10px] text-black tabular">
                {person.status === "cutting" ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3 motion-safe:animate-spin"
                  />
                ) : (
                  person.person
                )}
              </span>
              {/* Off its frame the pin keeps only its number, so pins from
                  other moments never pile their labels onto each other. */}
              <span className="person-pin-label">
                <span className="min-w-0 overflow-hidden">
                  <span className="block pr-1.5 pl-1 whitespace-nowrap">
                    {personMention(person.person)}
                  </span>
                </span>
              </span>
            </span>
          </div>
        );
      })}
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
    seedance: {
      label: "Move the whole shot",
      detail:
        "Seedance 2.5 rebuilds every frame in the new place, for takes where the camera travels. People and passers-by keep their moves, though timing can drift slightly. 720p.",
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
  place = false,
  loading,
  candidates,
  elementId,
  stateId,
  onChoose,
}: {
  kind: ReplacementKind;
  /** Copy the moves: the optional Location the Character performs in. */
  place?: boolean;
  loading: boolean;
  candidates: Element[];
  elementId: string | null;
  stateId: string | null;
  onChoose: (elementId: string | null, stateId: string | null) => void;
}) {
  const noun = place
    ? "Location"
    : kind === "character" ||
        kind === "extend" ||
        kind === "moment" ||
        kind === "moves"
      ? "Character"
      : kind === "object"
        ? "Thing"
        : "Location";
  const optional =
    place ||
    kind === "background" ||
    kind === "restyle" ||
    kind === "extend" ||
    kind === "moment";
  const selected = candidates.find((e) => e.id === elementId) ?? null;
  const cover = (element: Element, state: ElementState | null) => {
    const reference = approvedReferences(element, state?.id)[0];
    return reference ? assetUrl(reference.asset) : null;
  };
  return (
    <fieldset>
      <legend className="text-sm font-medium">
        {place
          ? "New place (optional)"
          : kind === "moves"
            ? "Who performs"
            : kind === "background"
              ? "New setting"
              : kind === "object"
                ? "Swap in"
                : kind === "restyle"
                  ? "Look from a Location"
                  : kind === "extend"
                    ? "Who comes in (optional)"
                    : kind === "moment"
                      ? "Who it is about (optional)"
                      : "New character"}
      </legend>
      {loading ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading Elements…</p>
      ) : candidates.length === 0 ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          No {noun}s yet.{" "}
          <Link
            to="/elements/new"
            search={{
              type: place
                ? "location"
                : (kindElementTypes[kind] ?? "character"),
            }}
            className="text-foreground"
          >
            Make a {noun}
          </Link>{" "}
          {place
            ? "to move the moves somewhere else. Without one, the clip’s own place stays."
            : kind === "moves"
              ? "with approved references to have them perform."
              : kind === "background"
                ? "to reuse a place across shots, or describe the setting below."
                : kind === "object"
                  ? "with approved references to swap it into shots."
                  : kind === "restyle"
                    ? "to borrow its look, or use a style image or words below."
                    : kind === "extend" || kind === "moment"
                      ? "to keep a person the same from shot to shot."
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

function EffectChoice({
  effect,
  onEffect,
}: {
  effect: VfxEffect;
  onEffect: (effect: VfxEffect) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Effect</legend>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        LTX reads the take frame by frame, so the action and camera stay.
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        {(Object.keys(VFX_EFFECTS) as VfxEffect[]).map((option) => (
          <label
            key={option}
            className={cn(
              "flex cursor-pointer flex-col rounded-lg border px-2.5 py-2 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
              effect === option
                ? "border-tungsten/70 bg-surface"
                : "border-border hover:bg-surface",
            )}
          >
            <input
              type="radio"
              name="vfx-effect"
              className="sr-only"
              checked={effect === option}
              onChange={() => onEffect(option)}
            />
            <span className="text-sm">{VFX_EFFECTS[option].label}</span>
            <span className="text-xs leading-5 text-muted-foreground">
              {VFX_EFFECTS[option].description}
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

/** The moment to redo, clamped inside the take; null until the take's length is known. */
function momentRange(
  seconds: number | null,
  start: number | null,
  length: number,
) {
  if (seconds === null || seconds < MOMENT_LIMITS.minSeconds + 0.5) return null;
  const span = Math.min(length, MOMENT_LIMITS.maxSeconds, seconds - 0.5);
  const latest = seconds - span;
  const from = Math.min(Math.max(start ?? (seconds - span) / 2, 0), latest);
  const round = (n: number) => Math.round(n * 100) / 100;
  return { start: round(from), end: round(from + span) };
}

/**
 * The stretch one Copy the moves run takes; null when the whole clip is sent
 * as it is, or until its length is known. It starts at the top. Wan 3.0 makes
 * whole seconds only, so a clip of 7.6 s is cut to 7 s rather than stretched
 * to 8 s out of step with its own sound.
 */
function movesRange(
  seconds: number | null,
  start: number | null,
  length: number,
  engine: MotionEngine,
) {
  if (seconds === null) return null;
  const whole =
    engine === "wan-3" && Math.abs(seconds - Math.round(seconds)) > 0.05;
  const most = MOTION_ENGINES[engine].maxSeconds;
  if (seconds <= most + 0.05 && !whole) return null;
  const span = Math.min(
    length,
    most,
    whole ? Math.max(MOTION_LIMITS.minSeconds, Math.floor(seconds)) : seconds,
  );
  if (span > seconds) return null;
  const from = Math.min(Math.max(start ?? 0, 0), seconds - span);
  const round = (n: number) => Math.round(n * 100) / 100;
  return { start: round(from), end: round(from + span) };
}

/** Mask size: the long side, enough for a soft-edged area at generation size. */
const MASK_SIDE = 512;

/**
 * A brush over the letterboxed frame. Strokes go straight to a canvas, so
 * painting never re-renders React; the mask is exported once per stroke.
 */
function PaintLayer({
  ratio,
  onMask,
}: {
  ratio: number;
  onMask: (mask: string | null) => void;
}) {
  const width = ratio >= 1 ? MASK_SIDE : Math.round(MASK_SIDE * ratio);
  const height = ratio >= 1 ? Math.round(MASK_SIDE / ratio) : MASK_SIDE;
  const last = useRef<{ x: number; y: number } | null>(null);
  const painted = useRef(false);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
  }
  function stroke(canvas: HTMLCanvasElement, to: { x: number; y: number }) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const from = last.current ?? to;
    ctx.strokeStyle = getComputedStyle(canvas).color;
    ctx.lineWidth = Math.max(width, height) * 0.06;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    last.current = to;
    painted.current = true;
  }
  function exportMask(canvas: HTMLCanvasElement) {
    if (!painted.current) return onMask(null);
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    // Painted pixels turn white, the rest black: white is redone.
    ctx.drawImage(canvas, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    onMask(out.toDataURL("image/png"));
  }

  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{
        width: `min(100cqw, ${ratio * 100}cqh)`,
        height: `min(100cqh, ${100 / ratio}cqw)`,
      }}
    >
      <canvas
        width={width}
        height={height}
        aria-label="Paint over the area to fix"
        className="size-full cursor-crosshair touch-none text-tungsten opacity-55"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          last.current = null;
          stroke(event.currentTarget, point(event));
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const canvas = event.currentTarget;
          // Coalesced points keep fast strokes continuous at any frame rate.
          const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
          if (!events.length) return stroke(canvas, point(event));
          const rect = canvas.getBoundingClientRect();
          for (const e of events)
            stroke(canvas, {
              x: ((e.clientX - rect.left) / rect.width) * width,
              y: ((e.clientY - rect.top) / rect.height) * height,
            });
        }}
        onPointerUp={(event) => {
          last.current = null;
          exportMask(event.currentTarget);
        }}
        onPointerCancel={() => {
          last.current = null;
        }}
      />
    </div>
  );
}

/**
 * The moment on the take's timeline. Dragging moves the band and the frame
 * directly; the studio hears the new start when the drag ends.
 */
function MomentBar({
  video,
  range,
  seconds,
  noun,
  onStart,
}: {
  video: { current: HTMLVideoElement | null };
  range: { start: number; end: number };
  seconds: number;
  noun: "moment" | "stretch";
  onStart: (start: number) => void;
}) {
  const band = useRef<HTMLSpanElement | null>(null);
  const label = useRef<HTMLSpanElement | null>(null);
  const span = range.end - range.start;
  const latest = Math.max(seconds - span, 0);
  const show = (start: number) => {
    if (band.current)
      band.current.style.transform = `translateX(${(start / span) * 100}%)`;
    if (label.current)
      label.current.textContent = `${formatTimecode(start)} – ${formatTimecode(start + span)}`;
  };
  const seek = (start: number) => {
    const v = video.current;
    if (!v) return;
    v.pause();
    if (v.fastSeek) v.fastSeek(start);
    else v.currentTime = start;
  };
  const commit = (input: HTMLInputElement) => {
    const start = Number(input.value);
    if (Math.abs(start - range.start) > 0.005) onStart(start);
  };
  return (
    <div className="mt-2">
      <div className="relative h-6">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-input"
        />
        <span
          ref={band}
          aria-hidden="true"
          className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-full bg-tungsten/60"
          style={{
            width: `${(span / seconds) * 100}%`,
            transform: `translateX(${(range.start / span) * 100}%)`,
          }}
        />
        <input
          key={span}
          type="range"
          min={0}
          max={latest}
          step={0.04}
          defaultValue={range.start}
          aria-label={`Where the ${noun} starts`}
          aria-valuetext={`${formatTimecode(range.start)} to ${formatTimecode(range.end)}`}
          className="compare-scrubber moment-scrubber absolute top-0 -ml-[6.5px]"
          // The thumb travels the band's possible starts, so it sits on the band's left edge.
          style={{ width: `calc(${(latest / seconds) * 100}% + 13px)` }}
          onChange={(event) => {
            const start = Number(event.target.value);
            show(start);
            seek(start);
          }}
          onPointerUp={(event) => commit(event.currentTarget)}
          onKeyUp={(event) => commit(event.currentTarget)}
          onBlur={(event) => commit(event.currentTarget)}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span ref={label} className="tabular">
          {formatTimecode(range.start)} – {formatTimecode(range.end)}
        </span>
        <button
          type="button"
          className="rounded-md px-1.5 py-0.5 text-foreground outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            const v = video.current;
            if (!v) return;
            v.currentTime = range.start;
            const stop = () => {
              if (v.currentTime < range.end) return;
              v.pause();
              v.removeEventListener("timeupdate", stop);
            };
            v.addEventListener("timeupdate", stop);
            void v.play();
          }}
        >
          Play the {noun}
        </button>
      </div>
    </div>
  );
}

function MomentLength({
  length,
  range,
  onLength,
}: {
  length: number;
  range: { start: number; end: number } | null;
  onLength: (length: number) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">The moment</legend>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {range
          ? `${formatTimecode(range.start)} to ${formatTimecode(range.end)}. Drag the band under the take to move it; both ends blend back into the take.`
          : "Choose a take to place the moment."}
      </p>
      <div
        role="radiogroup"
        aria-label="How long"
        className="mt-2 flex gap-1.5"
      >
        {MOMENT_LENGTHS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={length === option}
            onClick={() => onLength(option)}
            className="tabular inline-flex h-7 items-center rounded-full border border-border px-3 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-tungsten/70 aria-checked:bg-surface aria-checked:text-foreground"
          >
            {option} s
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Everyone tagged on the clip, each with their cut-out and who they become.
 * The words decide the pairs; this list shows how they were read.
 */
/** The summary sentence, with each @mention set apart as the thing it names. */
function WithMentions({ text }: { text: string }) {
  return text.split(/(@[A-Za-z0-9_]+)/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="font-medium text-tungsten">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function ClipPeople({
  people,
  cast,
  onRemove,
}: {
  people: readonly ClipPerson[];
  cast: readonly { person: number; element: Element }[];
  onRemove: (person: number) => void;
}) {
  return (
    <fieldset className="revision-reveal">
      <legend className="text-sm font-medium">People in the clip</legend>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {people.length
          ? "Write who each person becomes below. Anyone you do not name stays as filmed."
          : "Pause on a frame where someone is clear and click them. They become @person1, which you can name in your words: “Replace @person1 with @Cal”."}
      </p>
      {people.length > 0 && (
        <ul className="mt-2 grid gap-1.5">
          {people.map((person) => {
            const becomes = cast.find((c) => c.person === person.person);
            return (
              <li
                key={person.person}
                className="clip-person flex items-center gap-3 rounded-lg border border-border py-1.5 pr-1.5 pl-1.5"
              >
                <span className="flex shrink-0 items-center">
                  <span
                    className={cn(
                      "h-12 w-9 overflow-hidden rounded-md bg-secondary",
                      person.status === "cutting" && "clip-person-pending",
                    )}
                  >
                    {person.url && (
                      <img
                        src={person.url}
                        alt={`Person ${person.person}, as tagged`}
                        className="clip-person-cutout size-full object-cover"
                      />
                    )}
                  </span>
                  {becomes && (
                    <span
                      key={becomes.element.id}
                      className="clip-person-becomes flex items-center"
                    >
                      <ArrowRight
                        aria-hidden="true"
                        className="mx-1 size-3 text-subtle-foreground"
                      />
                      <ElementCover
                        element={becomes.element}
                        className="h-12 w-9 rounded-md"
                      />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {personMention(person.person)}
                  </span>
                  <span
                    key={`${person.status}-${becomes?.element.id ?? ""}`}
                    className="clip-person-status block truncate text-xs text-muted-foreground"
                  >
                    {person.status === "cutting"
                      ? "Cutting them out of the frame…"
                      : person.status === "failed"
                        ? "Could not cut them out; the click alone points them out"
                        : becomes
                          ? `Becomes ${becomes.element.name}`
                          : `Stays as filmed · tagged at ${formatTimecode(person.timeMs / 1000)}`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(person.person)}
                  aria-label={`Remove ${personMention(person.person)}`}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

function MovesStretch({
  length,
  range,
  clipSeconds,
  most,
  onLength,
}: {
  length: number;
  range: { start: number; end: number } | null;
  clipSeconds: number | null;
  /** The engine's longest run, in seconds. */
  most: number;
  onLength: (length: number) => void;
}) {
  const span = range ? range.end - range.start : null;
  return (
    <fieldset className="revision-reveal">
      <legend className="text-sm font-medium">The moves</legend>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {range
          ? clipSeconds !== null && clipSeconds <= most
            ? `${formatTimecode(range.start)} to ${formatTimecode(range.end)}. Wan 3.0 makes whole seconds, so the clip is cut to keep its sound in step; drag the band to choose them.`
            : `${formatTimecode(range.start)} to ${formatTimecode(range.end)}. One run copies up to ${most} seconds; drag the band under the clip to choose them.`
          : clipSeconds !== null
            ? `The whole clip, ${clipSeconds.toFixed(1)} seconds, step for step.`
            : `Choose a clip: a dance, a stunt, a gesture. Up to ${most} seconds are copied.`}
      </p>
      {range && (
        <div
          role="radiogroup"
          aria-label="How long"
          className="mt-2 flex gap-1.5"
        >
          {MOVES_LENGTHS.filter(
            (option) =>
              option <= most && (clipSeconds === null || option <= clipSeconds),
          ).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={span === option}
              onClick={() => onLength(option)}
              className="tabular inline-flex h-7 items-center rounded-full border border-border px-3 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-tungsten/70 aria-checked:bg-surface aria-checked:text-foreground"
            >
              {option} s
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/**
 * The engine, named by the model that runs, who makes it, whether its weights
 * are open and where it runs. Nothing is rebranded.
 */
function MovesEngine({
  engine,
  onEngine,
  resolution,
  onResolution,
}: {
  engine: Exclude<MotionEngine, "ltx-edges">;
  onEngine: (engine: Exclude<MotionEngine, "ltx-edges">) => void;
  resolution: MotionResolution;
  onResolution: (resolution: MotionResolution) => void;
}) {
  return (
    <fieldset className="revision-reveal">
      <legend className="text-sm font-medium">Model</legend>
      <div className="mt-2 flex flex-col gap-1">
        {(
          Object.keys(MOVES_RESOLUTIONS) as (keyof typeof MOVES_RESOLUTIONS)[]
        ).map((option) => {
          const facts = MOTION_ENGINES[option];
          return (
            <label
              key={option}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors duration-150 hover:bg-surface has-checked:border-tungsten/60 has-checked:bg-surface has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input
                type="radio"
                name="moves-engine"
                checked={engine === option}
                onChange={() => onEngine(option)}
                className="mt-1 accent-(--tungsten)"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  {facts.model}
                  <span className="text-xs text-muted-foreground">
                    {facts.maker}
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <span
                    className={cn(
                      "inline-flex h-5 items-center rounded-full px-2 text-[11px]",
                      option === "wan-animate"
                        ? "bg-tungsten/15 text-foreground"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {facts.weights}
                  </span>
                  <span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 text-[11px] text-muted-foreground">
                    {facts.runsOn}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {facts.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <div
        role="radiogroup"
        aria-label="Resolution"
        className="mt-2 flex gap-1.5 pl-2"
      >
        {MOVES_RESOLUTIONS[engine].map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={resolution === option}
            onClick={() => onResolution(option)}
            className="tabular inline-flex h-7 items-center rounded-full border border-border px-3 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-tungsten/70 aria-checked:bg-surface aria-checked:text-foreground"
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function AreaHint({
  painted,
  onClear,
}: {
  painted: boolean;
  onClear: () => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">The area</legend>
      <div className="mt-1 flex items-start gap-3">
        <p className="flex-1 text-xs leading-5 text-muted-foreground">
          {painted
            ? "Painted. The same area is used in every frame, so cover everywhere the thing moves."
            : "Pause on a frame and paint over what to fix. The same area is used in every frame, so cover everywhere the thing moves."}
        </p>
        {painted && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </fieldset>
  );
}

function AspectChoice({
  aspect,
  disabled,
  onAspect,
}: {
  aspect: ReframeAspect;
  disabled: (aspect: ReframeAspect) => boolean;
  onAspect: (aspect: ReframeAspect) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">New shape</legend>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {(Object.keys(REFRAME_ASPECTS) as ReframeAspect[]).map((option) => {
          const off = disabled(option);
          const ratio = REFRAME_ASPECTS[option].ratio;
          return (
            <label
              key={option}
              title={off ? "The take is already this shape" : undefined}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                off
                  ? "cursor-not-allowed border-border opacity-50"
                  : aspect === option
                    ? "cursor-pointer border-tungsten/70 bg-surface"
                    : "cursor-pointer border-border hover:bg-surface",
              )}
            >
              <input
                type="radio"
                name="reframe-aspect"
                className="sr-only"
                checked={aspect === option}
                disabled={off}
                onChange={() => onAspect(option)}
              />
              <span className="grid h-7 place-items-center" aria-hidden="true">
                <span
                  className={cn(
                    "rounded-[3px] border",
                    aspect === option ? "border-tungsten" : "border-current",
                  )}
                  style={{
                    width: `${ratio >= 1 ? 28 : 28 * ratio}px`,
                    height: `${ratio >= 1 ? 28 / ratio : 28}px`,
                  }}
                />
              </span>
              <span className="text-xs">{REFRAME_ASPECTS[option].label}</span>
              <span className="tabular text-[11px] text-muted-foreground">
                {option}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ExtendMethod({
  pipeline,
  onPipeline,
  seconds,
  onSeconds,
}: {
  pipeline: ExtendPipeline;
  onPipeline: (pipeline: ExtendPipeline) => void;
  seconds: (typeof EXTEND_SECONDS)[number];
  onSeconds: (seconds: (typeof EXTEND_SECONDS)[number]) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium">How</legend>
      <div className="mt-2 flex flex-col gap-1">
        {(Object.keys(EXTEND_PIPELINES) as ExtendPipeline[]).map((option) => (
          <label
            key={option}
            className="flex cursor-pointer gap-3 rounded-lg px-2 py-2 hover:bg-surface has-focus-visible:ring-2 has-focus-visible:ring-ring"
          >
            <input
              type="radio"
              name="extend-pipeline"
              checked={pipeline === option}
              onChange={() => onPipeline(option)}
              className="mt-1 accent-(--tungsten)"
            />
            <span>
              <span className="block text-sm">
                {EXTEND_PIPELINES[option].label}
              </span>
              <span className="block text-xs leading-5 text-muted-foreground">
                {EXTEND_PIPELINES[option].description}
              </span>
            </span>
          </label>
        ))}
      </div>
      {pipeline === "seedance" && (
        <div
          role="radiogroup"
          aria-label="Seconds to add"
          className="revision-reveal mt-2 flex items-center gap-1.5 pl-2"
        >
          <span className="mr-1 text-xs text-muted-foreground">Add</span>
          {EXTEND_SECONDS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={seconds === option}
              onClick={() => onSeconds(option)}
              className="tabular inline-flex h-7 items-center rounded-full border border-border px-3 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-tungsten/70 aria-checked:bg-surface aria-checked:text-foreground"
            >
              {option} s
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
