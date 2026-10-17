import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Sparkles, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { generateViews, useJobViews } from "./generate";
import {
  elementTypeOrder,
  elementTypes,
  toHandle,
  type ElementType,
} from "./model";
import { addReference, createElement, handleTaken, useElements } from "./store";
import { ACCEPTED_IMAGES, uploadReferenceImage } from "./upload";
import { SessionRequired, typeIcons } from "./visuals";

const EXPLORATIONS = 2;

interface Draft {
  file: File;
  preview: string;
}

export function ElementCreate({
  initialType,
}: {
  initialType?: ElementType | undefined;
}) {
  const navigate = useNavigate();
  const { status } = useElements();
  const { ready } = useJobViews();
  const [type, setType] = useState<ElementType>(initialType ?? "character");
  const [name, setName] = useState("");
  const [thought, setThought] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [explore, setExplore] = useState(true);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const info = elementTypes[type];
  const handle = name.trim() ? toHandle(name) : "";
  const taken = !!handle && handleTaken(handle);
  const canExplore = thought.trim().length >= 3;
  const willExplore = explore && canExplore;
  const firstViews = info.slots
    .filter((s) => s.required)
    .slice(0, EXPLORATIONS);
  const busy = !!progress;

  if (status === "signed-out") return <SessionRequired />;

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const accepted = ACCEPTED_IMAGES.split(",");
    const next = Array.from(files).filter((file) =>
      accepted.includes(file.type),
    );
    if (next.length < files.length)
      setError("Only PNG, JPEG and WebP images can join a reference sheet.");
    setDrafts((current) =>
      [
        ...current,
        ...next.map((file) => ({ file, preview: URL.createObjectURL(file) })),
      ].slice(0, 12),
    );
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
      for (const [index, draft] of drafts.entries()) {
        setProgress(`Uploading ${index + 1} of ${drafts.length}…`);
        try {
          await addReference({
            elementId: element.id,
            asset: {
              type: "media-asset",
              assetId: await uploadReferenceImage(draft.file),
            },
            status: "experiment",
          });
        } catch (e) {
          problems.push(
            e instanceof Error
              ? e.message
              : `${draft.file.name} was not added.`,
          );
        }
      }
      if (willExplore) {
        setProgress("Starting explorations…");
        await generateViews(element, firstViews, null, ready).catch(
          (e: unknown) =>
            problems.push(
              e instanceof Error
                ? e.message
                : "Explorations could not be started.",
            ),
        );
      }
      for (const draft of drafts) URL.revokeObjectURL(draft.preview);
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
      className="mx-auto w-full max-w-3xl px-6 pt-8 pb-32 md:px-12 md:pt-12"
      aria-labelledby="page-title"
    >
      <Link
        to="/elements"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Elements
      </Link>
      <PageHeader
        title={`New ${info.label}`}
        description="Start from a thought, a few images, or both. You choose which results become its approved reference sheet."
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
            What makes it recognizable: the details that should stay the same in
            every shot.
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
                key={draft.preview}
                className="relative size-24 overflow-hidden rounded-lg bg-surface"
              >
                <img
                  src={draft.preview}
                  alt={draft.file.name}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(draft.preview);
                    setDrafts((current) =>
                      current.filter((_, i) => i !== index),
                    );
                  }}
                  className="absolute top-1 right-1 rounded-full bg-elevated/90 p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${draft.file.name}`}
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
              Add images
              <input
                type="file"
                accept={ACCEPTED_IMAGES}
                multiple
                className="sr-only"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
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
                  ? `Generates ${firstViews.length} first views: ${firstViews
                      .map((s) => s.label.toLowerCase())
                      .join(
                        " and ",
                      )}. FLUX 3 Image · uses your Comfy Router credits.`
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
    </section>
  );
}
