import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Download,
  GitBranch,
  RotateCcw,
  X,
} from "lucide-react";
import {
  assetRefKey,
  outputVariant,
  resultOutputs,
  type AssetRef,
  type Job,
  type Project,
  type Revision,
} from "@open-cinema/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useGeneration } from "@/features/generation/store";
import { useLibrary } from "@/features/library";
import { cancelGeneration, reconcileGeneration } from "@/server/functions";
import { decideRevision, type RevisionEntry } from "@/server/revisions";
import { CompareViewer, Segmented } from "./compare-viewer";
import {
  assetUrl,
  phaseLabels,
  preservedLabels,
  replacementKinds,
  revisionPhase,
  revisionResult,
  wardrobeIntents,
  type ReplacementKind,
  type RevisionDecisions,
  type RevisionPhase,
  variantLabels,
} from "./model";
import "./revision.css";

const kindOf = (revision: Pick<Revision, "workflowKind">): ReplacementKind =>
  revision.workflowKind === "video.character-replace"
    ? "character"
    : "background";

function phaseVariant(phase: RevisionPhase) {
  switch (phase) {
    case "kept":
      return "success" as const;
    case "failed":
    case "attention":
      return "destructive" as const;
    case "rejected":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

export function RevisionView({
  revision,
  project,
  decisions,
  history,
}: {
  revision: Revision;
  project: Project | null;
  decisions: RevisionDecisions | null;
  history: RevisionEntry[];
}) {
  const router = useRouter();
  const { snapshot } = useGeneration();
  const jobs = snapshot?.jobs ?? [];
  const job = jobs.find((j) => j.id === revision.jobId);
  const stored = revisionResult(revision, job);
  // Variants of the same job (the lock and the relit edit) can be swapped in place.
  const variants = job
    ? resultOutputs(job.outputs).filter((o) => o.r2Key && outputVariant(o))
    : [];
  const [chosen, setChosen] = useState<string | null>(null);
  const chosenOutput = variants.find((o) => o.id === chosen);
  const result: AssetRef | null =
    chosenOutput && job
      ? { type: "job-output", jobId: job.id, outputId: chosenOutput.id }
      : stored;
  const resultVariant =
    result?.type === "job-output"
      ? variants.find((o) => o.id === result.outputId)
      : undefined;
  const phase = revisionPhase(revision.status, job, !!result);
  // Viewing a different version than the stored one makes Keep a real choice again.
  const viewingStored =
    !result ||
    !stored ||
    result.type !== "job-output" ||
    stored.type !== "job-output" ||
    result.outputId === stored.outputId;
  const kept = revision.status === "kept" && viewingStored;
  const kind = kindOf(revision);
  const items = useLibrary((s) => s.items);
  const [deciding, setDeciding] = useState<"kept" | "rejected" | null>(null);
  const [error, setError] = useState("");

  async function decide(status: "kept" | "rejected") {
    setDeciding(status);
    setError("");
    try {
      const switched =
        status === "kept" && !viewingStored && result?.type === "job-output";
      const saved = await decideRevision({
        data: {
          id: revision.id,
          status,
          ...(switched ? { resultOutputId: result.outputId } : {}),
        },
      });
      if (!saved)
        setError(
          "This result is still being saved. Try again once it shows as ready.",
        );
      await router.invalidate();
    } catch {
      setError("Your decision was not saved. Try again.");
    } finally {
      setDeciding(null);
    }
  }

  const sourceKey = assetRefKey(revision.source);
  const resultKey = result ? assetRefKey(result) : null;
  const sourceTitle =
    decisions?.sourceTitle ??
    items
      .find((item) => assetRefKey(item.ref) === sourceKey)
      ?.title.replace(/\.[a-z0-9]{2,4}$/i, "") ??
    "this clip";
  const resultType = items.find(
    (item) => resultKey && assetRefKey(item.ref) === resultKey,
  )?.mediaType;
  const extension = resultType === "video/webm" ? "webm" : "mp4";
  const download = result
    ? `${replacementKinds[kind].label} – ${sourceTitle}`.replace(
        /[\\/:*?"<>|]+/g,
        " ",
      )
    : "";

  return (
    <section
      className="mx-auto w-full max-w-7xl px-6 pt-8 pb-32 md:px-10 md:pt-10"
      aria-labelledby="page-title"
    >
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        {project ? (
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="inline-flex items-center gap-1 no-underline hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" /> {project.name}
          </Link>
        ) : (
          <Link
            to="/revisions/new"
            className="inline-flex items-center gap-1 no-underline hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" /> New revision
          </Link>
        )}
      </nav>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            id="page-title"
            className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-balance"
          >
            {replacementKinds[kind].label}
            <span className="text-muted-foreground"> · {sourceTitle}</span>
          </h1>
          <p className="mt-2 max-w-3xl text-[0.9375rem] leading-6 text-muted-foreground">
            {revision.intent}
          </p>
        </div>
        <Badge variant={phaseVariant(phase)} className="mt-1.5" role="status">
          {phaseLabels[phase]}
        </Badge>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {result ? (
            <div className="result-reveal">
              <CompareViewer
                key={revision.id}
                sourceUrl={assetUrl(revision.source)}
                resultUrl={assetUrl(result)}
                footer={
                  variants.length > 1 && resultVariant ? (
                    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:gap-4">
                      <Segmented
                        label="Version"
                        value={resultVariant.id}
                        onChange={setChosen}
                        options={variants.map((o) => ({
                          value: o.id,
                          label: variantLabels[outputVariant(o)!].label,
                        }))}
                      />
                      <p
                        className="max-w-prose text-xs leading-5 text-muted-foreground"
                        aria-live="polite"
                      >
                        {
                          variantLabels[outputVariant(resultVariant)!]
                            .description
                        }
                      </p>
                    </div>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <PendingStage
              revision={revision}
              job={job}
              phase={phase}
              connected={!!snapshot}
              estimate={decisions?.estimate?.time ?? null}
            />
          )}

          {result && (
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
              <Button
                variant={kept ? "default" : "secondary"}
                aria-pressed={kept}
                disabled={!!deciding}
                onClick={() => void decide("kept")}
              >
                <Check aria-hidden="true" />
                {kept
                  ? "Kept"
                  : revision.status === "kept"
                    ? "Keep this version"
                    : "Keep"}
              </Button>
              <Button
                variant={revision.status === "rejected" ? "default" : "ghost"}
                aria-pressed={revision.status === "rejected"}
                disabled={!!deciding}
                onClick={() => void decide("rejected")}
              >
                <X aria-hidden="true" />
                {revision.status === "rejected" ? "Rejected" : "Reject"}
              </Button>
              <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
              <Button variant="ghost" asChild>
                <a
                  href={assetUrl(result)}
                  download={`${download}.${extension}`}
                >
                  <Download aria-hidden="true" /> Download
                </a>
              </Button>
              {result.type === "job-output" && (
                <Button variant="ghost" asChild>
                  <Link
                    to="/revisions/new"
                    search={{
                      source: assetRefKey(result),
                      parent: revision.id,
                      project: revision.projectId ?? undefined,
                    }}
                  >
                    <GitBranch aria-hidden="true" /> Revise this result
                  </Link>
                </Button>
              )}
              <p className="w-full text-xs leading-5 text-muted-foreground sm:ml-auto sm:w-auto">
                {kept
                  ? "Kept alongside the original. Nothing was overwritten."
                  : revision.status === "rejected"
                    ? "Rejected. It stays in history in case you change your mind."
                    : "Keeping it does not replace the original."}
              </p>
              {error && (
                <p role="alert" className="w-full text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-8" aria-label="Revision details">
          <DecisionList revision={revision} decisions={decisions} />
          <History currentId={revision.id} history={history} jobs={jobs} />
        </aside>
      </div>
    </section>
  );
}

function PendingStage({
  revision,
  job,
  phase,
  connected,
  estimate,
}: {
  revision: Revision;
  job: Job | undefined;
  phase: RevisionPhase;
  connected: boolean;
  estimate: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const failed = phase === "failed" || phase === "attention";
  const progress = job?.progress ?? null;
  const kind = kindOf(revision);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        <video
          src={`${assetUrl(revision.source)}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          className={cn(
            "absolute inset-0 size-full object-contain transition-opacity duration-(--duration-slow)",
            failed ? "opacity-40" : "opacity-55",
          )}
        />
        {!failed && <div className="generating-sweep" aria-hidden="true" />}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-5 pt-16">
          <p className="text-sm font-medium text-white" aria-live="polite">
            {failed
              ? phase === "attention"
                ? "The generation service stopped answering about this job."
                : "This revision did not finish."
              : phase === "saving"
                ? "Saving the result to your library…"
                : phase === "generating"
                  ? job?.stage
                    ? `${job.stage}…`
                    : kind === "background"
                      ? "Replacing the background…"
                      : "Recasting the character…"
                  : "Waiting for a free slot…"}
          </p>
          {!failed && (
            <Progress
              value={
                progress !== null
                  ? Math.round(progress * 100)
                  : phase === "saving"
                    ? 95
                    : 6
              }
              aria-label="Revision progress"
              className="mt-3 h-1 bg-white/15 [&>[data-slot=progress-indicator]]:bg-tungsten"
            />
          )}
          <p className="mt-2 text-xs leading-5 text-white/70">
            {failed
              ? (job?.error ??
                "Nothing was charged for the unfinished result. Your original is unchanged.")
              : `${progress !== null ? `${Math.round(progress * 100)}% · ` : ""}${estimate ? `Usually ${estimate}. ` : ""}It keeps running if you leave this page.`}
          </p>
        </div>
      </div>
      {!connected && (
        <p className="mt-3 text-xs text-muted-foreground">
          Connecting to live progress…
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {failed && (
          <Button asChild variant="secondary">
            <Link
              to="/revisions/new"
              search={{
                source: assetRefKey(revision.source),
                kind,
                project: revision.projectId ?? undefined,
              }}
            >
              <RotateCcw aria-hidden="true" /> Try again
            </Link>
          </Button>
        )}
        {phase === "attention" && job && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(() => reconcileGeneration({ data: { jobId: job.id } }))
            }
          >
            Check again
          </Button>
        )}
        {(phase === "queued" || phase === "generating") && job && (
          <Button
            variant="ghost"
            disabled={busy || job.state === "cancelling"}
            onClick={() =>
              void run(() => cancelGeneration({ data: { jobId: job.id } }))
            }
          >
            {job.state === "cancelling" ? "Cancelling…" : "Cancel"}
          </Button>
        )}
      </div>
    </div>
  );
}

function DecisionList({
  revision,
  decisions,
}: {
  revision: Revision;
  decisions: RevisionDecisions | null;
}) {
  const kind = kindOf(revision);
  return (
    <section aria-labelledby="decisions-title">
      <h2 id="decisions-title" className="text-sm font-medium">
        Decisions behind this result
      </h2>
      {decisions ? (
        <dl className="mt-3 flex flex-col gap-3 text-sm">
          {decisions.element && (
            <div>
              <dt className="text-xs text-muted-foreground">
                {kind === "background" ? "Location" : "Character"}
              </dt>
              <dd className="mt-0.5">
                {decisions.element.name}
                {decisions.element.stateName && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {decisions.element.stateName}
                  </span>
                )}
                <span className="block text-xs text-muted-foreground">
                  @{decisions.element.handle} ·{" "}
                  {decisions.element.referenceCount} approved{" "}
                  {decisions.element.referenceCount === 1
                    ? "reference"
                    : "references"}
                </span>
              </dd>
            </div>
          )}
          {kind === "character" && decisions.target && (
            <div>
              <dt className="text-xs text-muted-foreground">Recast</dt>
              <dd className="mt-0.5">{decisions.target}</dd>
            </div>
          )}
          {decisions.wardrobe && (
            <div>
              <dt className="text-xs text-muted-foreground">Wardrobe</dt>
              <dd className="mt-0.5">
                {decisions.wardrobe === "describe"
                  ? decisions.wardrobeNote
                  : wardrobeIntents[decisions.wardrobe].label}
              </dd>
            </div>
          )}
          {decisions.direction && (
            <div>
              <dt className="text-xs text-muted-foreground">Direction</dt>
              <dd className="mt-0.5 leading-6">{decisions.direction}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Kept as shot</dt>
            <dd className="mt-1.5 flex flex-wrap gap-1">
              {decisions.preserve.map((aspect) => (
                <span
                  key={aspect}
                  className="rounded-full bg-secondary px-2 py-0.5 text-xs"
                >
                  {preservedLabels[aspect]}
                </span>
              ))}
            </dd>
            <dd className="mt-1.5 text-xs text-muted-foreground">
              {decisions.allowIntegration
                ? "Scoped integration allowed: shadows, edge light, colour match."
                : "No integration changes allowed."}
            </dd>
          </div>
          {decisions.estimate && (
            <div>
              <dt className="text-xs text-muted-foreground">Estimated</dt>
              <dd className="tabular mt-0.5 text-xs">
                {decisions.estimate.cost} · {decisions.estimate.time} ·{" "}
                {decisions.estimate.basis.toLowerCase()}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {revision.intent}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Started{" "}
        <time dateTime={revision.createdAt}>
          {new Date(revision.createdAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </time>
      </p>
    </section>
  );
}

function History({
  currentId,
  history,
  jobs,
}: {
  currentId: string;
  history: RevisionEntry[];
  jobs: readonly Job[];
}) {
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title" className="text-sm font-medium">
        Revisions of this clip
      </h2>
      <ol className="mt-3 flex flex-col">
        {history.map(({ revision, decisions }) => {
          const job = jobs.find((j) => j.id === revision.jobId);
          const phase = revisionPhase(
            revision.status,
            job,
            !!revisionResult(revision, job),
          );
          const current = revision.id === currentId;
          return (
            <li key={revision.id} className="relative pl-5">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-3.5 left-0 size-2 rounded-full",
                  current
                    ? "bg-tungsten"
                    : phase === "kept"
                      ? "bg-success"
                      : "bg-input",
                )}
              />
              <span
                aria-hidden="true"
                className="absolute top-6 bottom-0 left-[3.5px] w-px bg-border"
              />
              <Link
                to="/revisions/$revisionId"
                params={{ revisionId: revision.id }}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-md px-2 py-2 no-underline transition-colors hover:bg-surface",
                  current && "bg-surface",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">
                    {replacementKinds[kindOf(revision)].label}
                    {decisions?.element ? ` · ${decisions.element.name}` : ""}
                  </span>
                  <span
                    className={cn(
                      phase === "kept"
                        ? "text-success"
                        : phase === "failed" || phase === "attention"
                          ? "text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {phaseLabels[phase]}
                  </span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                  {revision.intent}
                </span>
                {revision.parentRevisionId && (
                  <span className="mt-0.5 flex items-center gap-1 text-[0.6875rem] text-subtle-foreground">
                    <GitBranch aria-hidden="true" className="size-3" /> Branched
                    from an earlier result
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
