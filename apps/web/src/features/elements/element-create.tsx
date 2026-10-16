import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Sparkles, X } from "lucide-react";
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
import { createElement, handleTaken, useElements } from "./store";
import { ACCEPTED_IMAGES, readReferenceImage } from "./upload";
import { typeIcons } from "./visuals";

const EXPLORATIONS = 2;

export function ElementCreate({
  initialType,
}: {
  initialType?: ElementType | undefined;
}) {
  const navigate = useNavigate();
  useElements();
  const { ready } = useJobViews();
  const [type, setType] = useState<ElementType>(initialType ?? "character");
  const [name, setName] = useState("");
  const [thought, setThought] = useState("");
  const [uploads, setUploads] = useState<{ url: string; fileName: string }[]>(
    [],
  );
  const [explore, setExplore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const info = elementTypes[type];
  const handle = toHandle(name);
  const taken = !!handle && handleTaken(handle);
  const canExplore = thought.trim().length >= 3;
  const willExplore = explore && canExplore;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const next: { url: string; fileName: string }[] = [];
    for (const file of Array.from(files)) {
      try {
        next.push({ url: await readReferenceImage(file), fileName: file.name });
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "That file could not be used.",
        );
      }
    }
    setUploads((current) => [...current, ...next].slice(0, 12));
  }

  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const element = await createElement({
        type,
        name,
        description: thought,
        references: uploads.map((upload) => ({
          source: { kind: "upload", ...upload },
          view: null,
          stateId: null,
        })),
      });
      if (willExplore) {
        const slots = info.slots
          .filter((s) => s.required)
          .slice(0, EXPLORATIONS);
        try {
          await generateViews(element, slots, null, ready);
        } catch (e) {
          // The Element exists; surface the generation problem on its page.
          await navigate({
            to: "/elements/$elementId",
            params: { elementId: element.id },
            search: {
              notice:
                e instanceof Error
                  ? e.message
                  : "Explorations could not be started.",
            },
          });
          return;
        }
      }
      await navigate({
        to: "/elements/$elementId",
        params: { elementId: element.id },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The Element could not be created.",
      );
      setBusy(false);
    }
  }

  return (
    <section
      className="mx-auto w-full max-w-3xl px-6 pt-8 pb-32 md:px-12 md:pt-12"
      aria-labelledby="page-title"
    >
      <Link
        to="/elements"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Elements
      </Link>
      <h1
        id="page-title"
        className="mt-6 text-3xl font-semibold tracking-tight text-balance"
      >
        New {info.label}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
        Start from a thought, a few images, or both. You will choose which
        results become its approved reference sheet.
      </p>

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
                      ? "border-foreground bg-secondary/60"
                      : "border-border hover:bg-secondary/40",
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
                    className="size-5"
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
            {taken
              ? `@${handle} is already in your Elements. Choose another name.`
              : handle
                ? `Mention it as @${handle}`
                : "The name becomes its mention, like @" + info.placeholderName}
          </p>
        </div>

        <div>
          <label htmlFor="element-thought" className="text-sm font-medium">
            Describe it
          </label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            What makes it recognizable: the details that should stay the same in
            every shot.
          </p>
          <textarea
            id="element-thought"
            value={thought}
            onChange={(event) => setThought(event.target.value)}
            placeholder={info.placeholderThought}
            rows={4}
            maxLength={1200}
            className="mt-3 w-full resize-y rounded-xl border border-input bg-background p-4 text-base leading-7 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Starting material</legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {uploads.map((upload, index) => (
              <figure
                key={`${upload.fileName}-${index}`}
                className="relative size-24 overflow-hidden rounded-lg bg-secondary"
              >
                <img
                  src={upload.url}
                  alt={upload.fileName}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setUploads((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                  className="absolute top-1 right-1 rounded-full bg-background/90 p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${upload.fileName}`}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </figure>
            ))}
            <label className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors duration-150 hover:bg-secondary/40 hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
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
                  void addFiles(event.target.files);
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
              className="mt-1 size-4 accent-foreground"
            />
            <span>
              <span className="block text-sm font-medium">
                Explore looks from the description
              </span>
              <span className="block text-xs leading-5 text-muted-foreground">
                {canExplore
                  ? `Generates ${EXPLORATIONS} first views: ${info.slots
                      .filter((s) => s.required)
                      .slice(0, EXPLORATIONS)
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
            {busy
              ? willExplore
                ? "Starting explorations…"
                : "Creating…"
              : `Create ${info.label}`}
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link to="/elements">Cancel</Link>
          </Button>
        </div>
      </form>
    </section>
  );
}
