import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Clapperboard,
  PackageOpen,
  Plus,
  Wand2,
} from "lucide-react";
import {
  assetRefKey,
  type Project,
  type Revision,
} from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DurationBadge,
  Thumbnail,
  useLibrary,
  type MediaItem,
} from "@/features/library";
import { useGeneration } from "@/features/generation/store";
import {
  ProjectLook,
  ProjectShots,
} from "@/features/direction/project-direction";
import type { ProjectShot } from "@/server/projects";
import { useElements } from "@/features/elements/store";
import {
  elementTypeOrder,
  elementTypes,
  assetUrl as elementAssetUrl,
} from "@/features/elements/model";
import {
  posterUrl,
  phaseLabels,
  replacementKinds,
  revisionKindOf,
  revisionPhase,
  revisionResult,
} from "./model";

export function ProjectHome({
  project: loaded,
  revisions,
  shots,
}: {
  project: Project;
  revisions: Revision[];
  shots: ProjectShot[];
}) {
  const [project, setProject] = useState(loaded);
  const items = useLibrary((s) => s.items);
  const videos = items.filter((item) => item.kind === "video");
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-8 pb-32 md:px-12 md:pt-10"
      aria-labelledby="page-title"
    >
      <Link
        to="/projects"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" /> Projects
      </Link>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1
            id="page-title"
            className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-balance"
          >
            {project.name}
          </h1>
          {project.direction && (
            <p className="mt-2 max-w-2xl text-[0.9375rem] leading-6 text-muted-foreground">
              {project.direction}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" asChild>
            <Link to="/world" search={{ project: project.id }}>
              <PackageOpen aria-hidden="true" /> Save as world
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/revisions/new" search={{ project: project.id }}>
              <Wand2 aria-hidden="true" /> New revision
            </Link>
          </Button>
          <Button asChild>
            <Link to="/" search={{ project: project.id }}>
              <Clapperboard aria-hidden="true" /> Make a shot
            </Link>
          </Button>
        </div>
      </header>

      <ProjectLook project={project} onSaved={setProject} />
      <ProjectShots project={project} shots={shots} />
      <Revisions project={project} revisions={revisions} />
      <Sources project={project} videos={videos} />
      <ProjectElements />
    </section>
  );
}

function Revisions({
  project,
  revisions,
}: {
  project: Project;
  revisions: Revision[];
}) {
  const { snapshot } = useGeneration();
  const jobs = snapshot?.jobs ?? [];
  return (
    <section className="mt-12" aria-labelledby="revisions-title">
      <h2 id="revisions-title" className="text-lg font-medium">
        Revisions
      </h2>
      {revisions.length === 0 ? (
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Move a shot to a new Location or recast one of its characters. Each
          revision keeps its original beside it for comparison.{" "}
          <Link to="/revisions/new" search={{ project: project.id }}>
            Start the first one
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {revisions.map((revision) => {
            const job = jobs.find((j) => j.id === revision.jobId);
            const result = revisionResult(revision, job);
            const phase = revisionPhase(revision.status, job, !!result);
            const kind = revisionKindOf(revision.workflowKind);
            return (
              <li key={revision.id}>
                <Link
                  to="/revisions/$revisionId"
                  params={{ revisionId: revision.id }}
                  className="group block no-underline"
                >
                  <span className="relative block aspect-video overflow-hidden rounded-lg bg-black">
                    <Thumbnail
                      src={posterUrl(result ?? revision.source)}
                      kind="video"
                      className={cn(
                        "size-full transition-opacity duration-(--duration-fast)",
                        result ? "opacity-100" : "opacity-45",
                      )}
                    />
                    <span
                      className={cn(
                        "absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-medium",
                        phase === "kept"
                          ? "text-success"
                          : phase === "failed" || phase === "attention"
                            ? "text-destructive"
                            : phase === "ready"
                              ? "text-white"
                              : "text-tungsten",
                      )}
                    >
                      {phaseLabels[phase]}
                    </span>
                  </span>
                  <span className="mt-2 block text-sm font-medium group-hover:underline">
                    {replacementKinds[kind].label}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                    {revision.intent}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Sources({
  project,
  videos,
}: {
  project: Project;
  videos: readonly MediaItem[];
}) {
  return (
    <section className="mt-14" aria-labelledby="sources-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="sources-title" className="text-lg font-medium">
          Sources
        </h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/revisions/new" search={{ project: project.id }}>
            <Plus aria-hidden="true" /> Add a clip
          </Link>
        </Button>
      </div>
      {videos.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Upload footage or generate a video, then revise it here.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {videos.slice(0, 12).map((item) => (
            <li key={item.id} className="group">
              <span className="relative block overflow-hidden rounded-lg">
                <Thumbnail
                  src={item.thumbnailUrl}
                  kind="video"
                  className="aspect-video"
                />
                <DurationBadge item={item} className="right-1.5 bottom-1.5" />
              </span>
              <span className="mt-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">
                  {item.title}
                </span>
                <Link
                  to="/revisions/new"
                  search={{
                    source: assetRefKey(item.ref),
                    project: project.id,
                  }}
                  className="shrink-0 text-xs"
                  aria-label={`Revise ${item.title}`}
                >
                  Revise
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectElements() {
  const { elements } = useElements();
  return (
    <section className="mt-14" aria-labelledby="elements-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="elements-title" className="text-lg font-medium">
          Elements
        </h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/elements">All Elements</Link>
        </Button>
      </div>
      {elements.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Characters, Locations and Things you establish here can be cast into
          any shot. <Link to="/elements/new">Create an Element</Link>.
        </p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {elementTypeOrder.flatMap((type) =>
            elements
              .filter((e) => e.type === type)
              .map((element) => {
                const reference = element.references.find(
                  (r) => r.status === "approved" && !r.stateId,
                );
                const image = reference
                  ? elementAssetUrl(reference.asset)
                  : null;
                return (
                  <li key={element.id}>
                    <Link
                      to="/elements/$elementId"
                      params={{ elementId: element.id }}
                      search={{}}
                      className="flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 text-sm no-underline transition-colors hover:bg-surface"
                    >
                      <span className="size-7 overflow-hidden rounded-full bg-secondary">
                        {image && (
                          <img
                            src={image}
                            alt=""
                            className="size-full object-cover"
                          />
                        )}
                      </span>
                      {element.name}
                      <span className="text-xs text-muted-foreground">
                        {elementTypes[element.type].label}
                      </span>
                    </Link>
                  </li>
                );
              }),
          )}
        </ul>
      )}
    </section>
  );
}
