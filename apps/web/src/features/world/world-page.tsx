import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, FolderOpen, PackageOpen } from "lucide-react";
import type { WorldImportResult } from "@open-cinema/contracts";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes } from "@/features/library/model";
import { refreshLibrary } from "@/features/library";
import { importMyWorld } from "@/server/world";
import { openWorld, uploadWorldMedia, type OpenedWorld } from "./import";

const EVERYTHING = "everything";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function WorldPage({
  projects,
  initialProjectId,
}: {
  projects: { id: string; name: string }[];
  initialProjectId?: string | undefined;
}) {
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <div className="max-w-4xl">
        <PageHeader
          title="Move your world"
          description="Take your cast, places, recipes and sequences to another project or another Open Cinema. Everything travels with its approved references and the prompts that made it."
        />
        <div className="mt-10 grid gap-10">
          <ExportWorld
            projects={projects}
            initialProjectId={initialProjectId}
          />
          <ImportWorld />
        </div>
      </div>
    </section>
  );
}

function ExportWorld({
  projects,
  initialProjectId,
}: {
  projects: { id: string; name: string }[];
  initialProjectId?: string | undefined;
}) {
  const [scope, setScope] = useState(
    projects.some((p) => p.id === initialProjectId)
      ? initialProjectId!
      : EVERYTHING,
  );
  const href =
    scope === EVERYTHING
      ? "/api/world/export"
      : `/api/world/export?project=${encodeURIComponent(scope)}`;
  return (
    <section aria-labelledby="export-title">
      <h2 id="export-title" className="text-lg font-medium">
        Save a world
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        A project brings its look, its Elements and the ones its shots mention,
        and its sequences with their approved takes. Your recipes always come
        along. Rejected references stay here.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">What to save</span>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EVERYTHING}>
                Everything in this studio
              </SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button asChild>
          <a href={href} download>
            <Download aria-hidden="true" />
            Download world
          </a>
        </Button>
      </div>
    </section>
  );
}

type Phase =
  | { name: "idle"; error: string | null }
  | { name: "opening" }
  | { name: "ready"; world: OpenedWorld }
  | { name: "bringing"; world: OpenedWorld; sent: number; step: string }
  | { name: "done"; result: WorldImportResult };

function ImportWorld() {
  const [phase, setPhase] = useState<Phase>({ name: "idle", error: null });
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  async function choose(file: File) {
    setPhase({ name: "opening" });
    try {
      setPhase({ name: "ready", world: await openWorld(file) });
    } catch (error) {
      setPhase({
        name: "idle",
        error:
          error instanceof Error
            ? error.message
            : "This file could not be opened.",
      });
    }
  }

  async function bring(world: OpenedWorld) {
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ name: "bringing", world, sent: 0, step: "Uploading media" });
    try {
      const media = await uploadWorldMedia(
        world,
        (sent) =>
          setPhase({ name: "bringing", world, sent, step: "Uploading media" }),
        controller.signal,
      );
      setPhase({
        name: "bringing",
        world,
        sent: world.bytes,
        step: "Creating Elements, recipes and sequences",
      });
      const result = await importMyWorld({
        data: { manifest: world.raw, media },
      });
      void refreshLibrary();
      setPhase({ name: "done", result });
    } catch (error) {
      setPhase({
        name: "idle",
        error: controller.signal.aborted
          ? "Stopped. Files already uploaded stay in your Library."
          : error instanceof Error
            ? error.message
            : "The world could not be brought in. Try again.",
      });
    } finally {
      abort.current = null;
    }
  }

  return (
    <section aria-labelledby="import-title">
      <h2 id="import-title" className="text-lg font-medium">
        Bring in a world
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        Open a .world.zip saved from any Open Cinema. Everything arrives as new
        records; nothing here is changed or replaced.
      </p>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void choose(file);
        }}
      />
      <div className="mt-4" aria-live="polite">
        {phase.name === "idle" && (
          <div className="grid gap-4">
            <div>
              <Button variant="outline" onClick={() => input.current?.click()}>
                <FolderOpen aria-hidden="true" />
                Choose a world
              </Button>
            </div>
            {phase.error && (
              <Alert variant="destructive">
                <AlertTitle>That world did not come in</AlertTitle>
                <AlertDescription>{phase.error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
        {phase.name === "opening" && (
          <p className="text-sm text-muted-foreground">Reading the world…</p>
        )}
        {phase.name === "ready" && (
          <WorldPreview
            world={phase.world}
            onBring={() => void bring(phase.world)}
            onCancel={() => setPhase({ name: "idle", error: null })}
          />
        )}
        {phase.name === "bringing" && (
          <div className="grid max-w-xl gap-3 rounded-xl border border-border p-5">
            <p className="text-sm font-medium">{phase.step}…</p>
            <Progress
              value={
                phase.world.bytes ? (phase.sent / phase.world.bytes) * 100 : 100
              }
              aria-label="Upload progress"
            />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="tabular">
                {formatBytes(phase.sent)} of {formatBytes(phase.world.bytes)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => abort.current?.abort()}
              >
                Stop
              </Button>
            </div>
          </div>
        )}
        {phase.name === "done" && (
          <WorldResult
            result={phase.result}
            onAnother={() => setPhase({ name: "idle", error: null })}
          />
        )}
      </div>
    </section>
  );
}

function WorldPreview({
  world,
  onBring,
  onCancel,
}: {
  world: OpenedWorld;
  onBring: () => void;
  onCancel: () => void;
}) {
  const { manifest } = world;
  const shots = manifest.sequences.reduce((n, s) => n + s.shots.length, 0);
  const contents = [
    plural(manifest.elements.length, "Element"),
    plural(manifest.recipes.length, "recipe"),
    `${plural(manifest.sequences.length, "sequence")} (${plural(shots, "shot")})`,
    `${plural(manifest.media.length, "file")}, ${formatBytes(world.bytes)}`,
  ];
  return (
    <div className="grid max-w-xl gap-4 rounded-xl border border-border p-5">
      <div>
        <p className="font-medium">
          {manifest.project ? manifest.project.name : "A studio's world"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved {new Date(manifest.exportedAt).toLocaleDateString()} ·{" "}
          {contents.join(" · ")}
        </p>
      </div>
      {manifest.elements.length > 0 && (
        <p className="text-sm leading-6">
          {manifest.elements
            .slice(0, 12)
            .map((e) => `@${e.handle}`)
            .join("  ")}
          {manifest.elements.length > 12 &&
            ` and ${manifest.elements.length - 12} more`}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {manifest.project
          ? "It arrives as a new project with its look."
          : "Its Elements and sequences arrive outside any project."}
      </p>
      <div className="flex gap-2">
        <Button onClick={onBring}>
          <PackageOpen aria-hidden="true" />
          Bring it in
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Choose another
        </Button>
      </div>
    </div>
  );
}

function WorldResult({
  result,
  onAnother,
}: {
  result: WorldImportResult;
  onAnother: () => void;
}) {
  return (
    <div className="grid max-w-xl gap-4 rounded-xl border border-border p-5">
      <div>
        <p className="font-medium">The world is here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {[
            plural(result.elements, "Element"),
            plural(result.recipes, "recipe"),
            plural(result.sequences.length, "sequence"),
          ].join(" · ")}
        </p>
      </div>
      {result.renamed.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">Renamed to stay unique</p>
          <ul className="mt-1 grid gap-0.5 text-muted-foreground">
            {result.renamed.map((r) => (
              <li key={r.from}>
                @{r.from} is now @{r.to}; its shots were updated.
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.adaptations.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">What changed on the way</p>
          <ul className="mt-1 grid gap-2 text-muted-foreground">
            {result.adaptations.map((a) => (
              <li key={a.subject}>
                <span className="text-foreground">{a.subject}.</span> {a.change}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {result.projectId ? (
          <Button asChild>
            <Link
              to="/projects/$projectId"
              params={{ projectId: result.projectId }}
            >
              Open the project
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link to="/elements">See your Elements</Link>
          </Button>
        )}
        {result.sequences[0] && (
          <Button variant="outline" asChild>
            <Link
              to="/sequences/$sequenceId"
              params={{ sequenceId: result.sequences[0].id }}
            >
              Open “{result.sequences[0].title}”
            </Link>
          </Button>
        )}
        <Button variant="ghost" onClick={onAnother}>
          Bring in another
        </Button>
      </div>
    </div>
  );
}
