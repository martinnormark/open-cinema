import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Film, ImagePlus, Images, Sparkles, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { generateViews, useJobViews } from "./generate";
import { assetUrl } from "@/lib/media-url";
import {
  defaultView,
  elementTypeOrder,
  elementTypes,
  guessView,
  toHandle,
  type ElementType,
  type ReferenceView,
} from "./model";
import { addReference, createElement, handleTaken, useElements } from "./store";
import { MediaPicker, uploadFiles, type AssetRef } from "@/features/library";
import { SessionRequired, typeIcons } from "./visuals";

const ACCEPTED_IMAGES = "image/png,image/jpeg,image/webp";
/** A Location's best reference is a clip of the place with the camera moving. */
const ACCEPTED_CLIPS = "video/mp4,video/quicktime,video/webm";

/** Starting material: a local file to upload, or something already stored. */
type Draft = { key: string; preview: string; label: string; media: Media } & (
  { kind: "file"; file: File } | { kind: "stored"; ref: AssetRef }
);
type Media = "image" | "video";

function storedDraft(ref: AssetRef, label: string, media: Media): Draft {
  return {
    kind: "stored",
    key: JSON.stringify(ref),
    ref,
    preview: assetUrl(ref),
    label,
    media,
  };
}

export function ElementCreate({
  initialType,
  initialReference,
}: {
  initialType?: ElementType | undefined;
  initialReference?: AssetRef | null | undefined;
}) {
  const navigate = useNavigate();
  const { status } = useElements();
  const { ready } = useJobViews();
  const [type, setType] = useState<ElementType>(initialType ?? "character");
  const [name, setName] = useState("");
  const [thought, setThought] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    initialReference
      ? [storedDraft(initialReference, "Image from your Library", "image")]
      : [],
  );
  const [picking, setPicking] = useState(false);
  // Starting images usually are the look; exploring from words would compete
  // with them, so it is on by default only without any.
  const [exploreChoice, setExplore] = useState<boolean | null>(null);
  const explore = exploreChoice ?? drafts.length === 0;
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const info = elementTypes[type];
  const handle = name.trim() ? toHandle(name) : "";
  const taken = !!handle && handleTaken(handle);
  const canExplore = thought.trim().length >= 3;
  const willExplore = explore && canExplore;
  // Only the anchor view starts from the description: every other view is
  // made from it once approved, so they all show the same face, place or
  // object. Two views made from words alone came back as two designs.
  const anchor = info.slots.find((s) => s.required)!;
  const takesClips = type === "location";
  const accepted = takesClips
    ? `${ACCEPTED_IMAGES},${ACCEPTED_CLIPS}`
    : ACCEPTED_IMAGES;
  const busy = !!progress;

  if (status === "signed-out") return <SessionRequired />;

  function addDrafts(next: Draft[]) {
    setDrafts((current) =>
      [
        ...current,
        ...next.filter((d) => !current.some((c) => c.key === d.key)),
      ].slice(0, 12),
    );
  }
  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const types = accepted.split(",");
    const next = Array.from(files).filter((file) => types.includes(file.type));
    if (next.length < files.length)
      setError(
        takesClips
          ? "Only PNG, JPEG and WebP images, and MP4, MOV and WebM clips, can join a reference sheet."
          : "Only PNG, JPEG and WebP images can join a reference sheet.",
      );
    addDrafts(
      next.map((file) => {
        const preview = URL.createObjectURL(file);
        return {
          kind: "file",
          key: preview,
          file,
          preview,
          label: file.name,
          media: file.type.startsWith("video/") ? "video" : "image",
        };
      }),
    );
  }
  function release(draft: Draft) {
    if (draft.kind === "file") URL.revokeObjectURL(draft.preview);
  }

  async function create() {
    if (busy) return;
    setError("");
    setProgress("Creating…");
    let elementId: string | null = null;
    const problems: string[] = [];
    try {
      const element = await createElement({
        type,
        name: name.trim(),
        description: thought.trim(),
      });
      elementId = element.id;
      const files = drafts.flatMap((d) => (d.kind === "file" ? [d.file] : []));
      if (files.length) setProgress(`Uploading ${files.length}…`);
      const uploaded = files.length ? await uploadFiles(files) : [];
      if (uploaded.some((item) => !item))
        problems.push(
          "Some images could not be uploaded. Retry them from your Library.",
        );
      const refs = [
        ...drafts.flatMap((d) =>
          d.kind === "stored"
            ? [{ ref: d.ref, title: d.label, kind: d.media }]
            : [],
        ),
        ...uploaded.flatMap((item) => (item ? [item] : [])),
      ];
      // Named files keep their names' views; the rest take the views the
      // sheet still needs, the anchor first, so nothing arrives untagged.
      const taken = new Set<ReferenceView>();
      const named = refs.map(({ title, kind }) => guessView(type, title, kind));
      for (const view of named) if (view) taken.add(view);
      for (const [i, { ref, kind }] of refs.entries()) {
        const view =
          named[i] ?? defaultView({ type, references: [] }, null, kind, taken);
        if (view) taken.add(view);
        await addReference({
          elementId: element.id,
          asset: ref,
          status: "experiment",
          ...(view ? { view } : {}),
        }).catch((e: unknown) =>
          problems.push(
            e instanceof Error ? e.message : "An image was not added.",
          ),
        );
      }
      if (willExplore) {
        setProgress("Starting explorations…");
        await generateViews(element, [anchor], null, ready).catch(
          (e: unknown) =>
            problems.push(
              e instanceof Error
                ? e.message
                : "Explorations could not be started.",
            ),
        );
      }
      drafts.forEach(release);
      await navigate({
        to: "/elements/$elementId",
        params: { elementId: element.id },
        search: problems.length ? { notice: problems.join(" ") } : {},
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The Element could not be created.",
      );
      setProgress("");
      if (elementId)
        await navigate({ to: "/elements/$elementId", params: { elementId } });
    }
  }

  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-8 pb-32 md:px-12 md:pt-12"
      aria-labelledby="page-title"
    >
      {/* The shared page frame, with the form measured inside it. */}
      <div className="max-w-3xl">
        <Link
          to="/elements"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Elements
        </Link>
        <PageHeader
          title={`New ${info.label}`}
          description={`Start from a thought, a few ${takesClips ? "images or clips" : "images"}, or both. You approve what becomes its reference sheet.`}
        />

        <form
          className="mt-10 space-y-10"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <fieldset>
            <legend className="text-sm font-medium">
              What are you creating?
            </legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {elementTypeOrder.map((option) => {
                const Icon = typeIcons[option];
                const selected = option === type;
                return (
                  <label
                    key={option}
                    className={cn(
                      "relative flex cursor-pointer flex-col rounded-xl border p-4 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      selected
                        ? "border-foreground/80 bg-surface"
                        : "border-border hover:bg-surface",
                    )}
                  >
                    <input
                      type="radio"
                      name="element-type"
                      value={option}
                      checked={selected}
                      onChange={() => setType(option)}
                      className="sr-only"
                    />
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "size-5",
                        selected ? "text-tungsten" : "text-subtle-foreground",
                      )}
                      strokeWidth={1.5}
                    />
                    <span className="mt-3 text-sm font-medium">
                      {elementTypes[option].label}
                    </span>
                    <span className="mt-1 text-xs leading-5 text-muted-foreground">
                      {elementTypes[option].establishes}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="element-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="element-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={info.placeholderName}
              maxLength={60}
              required
              autoComplete="off"
              aria-invalid={taken || undefined}
              aria-describedby="element-handle"
              className="mt-2 h-11 text-base"
            />
            <p
              id="element-handle"
              className={cn(
                "mt-2 text-xs",
                taken ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {taken ? (
                `@${handle} is already in your Elements. Choose another name.`
              ) : handle ? (
                <>
                  Mention it as{" "}
                  <span className="font-medium text-tungsten">@{handle}</span>
                </>
              ) : (
                `The name becomes its mention, like @${info.placeholderName}.`
              )}
            </p>
          </div>

          <div>
            <label htmlFor="element-thought" className="text-sm font-medium">
              Describe it
            </label>
            <p
              id="element-thought-hint"
              className="mt-1 text-xs leading-5 text-muted-foreground"
            >
              What makes it recognizable: the details that should stay the same
              in every shot.
            </p>
            <textarea
              id="element-thought"
              aria-describedby="element-thought-hint"
              value={thought}
              onChange={(event) => setThought(event.target.value)}
              placeholder={info.placeholderThought}
              rows={4}
              maxLength={1200}
              className="mt-3 w-full resize-y rounded-xl border border-input bg-transparent p-4 text-base leading-7 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Starting material</legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {drafts.map((draft, index) => (
                <figure
                  key={draft.key}
                  className="relative size-24 overflow-hidden rounded-lg bg-surface"
                >
                  {draft.media === "video" ? (
                    <>
                      <video
                        src={draft.preview}
                        muted
                        playsInline
                        preload="metadata"
                        aria-label={draft.label}
                        className="size-full object-cover"
                      />
                      <Film
                        aria-hidden="true"
                        className="absolute bottom-1.5 left-1.5 size-3.5 text-foreground drop-shadow"
                      />
                    </>
                  ) : (
                    <img
                      src={draft.preview}
                      alt={draft.label}
                      className="size-full object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      release(draft);
                      setDrafts((current) =>
                        current.filter((_, i) => i !== index),
                      );
                    }}
                    className="absolute top-1 right-1 rounded-full bg-elevated/90 p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${draft.label}`}
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </figure>
              ))}
              <label className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-input text-xs text-muted-foreground transition-colors duration-150 hover:bg-surface hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                <ImagePlus
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={1.5}
                />
                {takesClips ? "Add images or clips" : "Add images"}
                <input
                  type="file"
                  accept={accepted}
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 text-muted-foreground"
              onClick={() => setPicking(true)}
            >
              <Images aria-hidden="true" /> Choose from Library
            </Button>
            <MediaPicker
              open={picking}
              onOpenChange={setPicking}
              kind={takesClips ? undefined : "image"}
              title="Starting material"
              description={
                takesClips
                  ? "Pick images or clips you uploaded or generated. They arrive as explorations."
                  : "Pick images you uploaded or generated. They arrive as explorations."
              }
              onSelect={(item) =>
                addDrafts([storedDraft(item.ref, item.title, item.kind)])
              }
            />
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {takesClips
                ? "A short clip of the empty place with the camera moving makes the best moving reference. "
                : ""}
              Uploads arrive as explorations. Nothing joins the reference sheet
              until you approve it.
            </p>
            <label className="mt-6 flex items-start gap-3">
              <input
                type="checkbox"
                checked={explore}
                onChange={(event) => setExplore(event.target.checked)}
                className="mt-1 size-4 accent-[var(--tungsten)]"
              />
              <span>
                <span className="block text-sm font-medium">
                  Explore looks from the description
                </span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  {canExplore
                    ? `Generates the ${anchor.label.toLowerCase()} first. Once you approve it, the rest of the sheet is made to match it in one step. ${type === "character" ? "FLUX 3 Image workflow · uses your Comfy Cloud credits." : "FLUX 3 Image · uses your Comfy Router credits."}`
                    : "Add a description to explore generated looks."}
                </span>
              </span>
            </label>
          </fieldset>

          {error && (
            <p role="alert" className="text-sm leading-6 text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3 border-t border-border pt-6">
            <Button type="submit" size="lg" disabled={busy || !handle || taken}>
              {willExplore && <Sparkles aria-hidden="true" />}
              {progress || `Create ${info.label}`}
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link to="/elements">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
