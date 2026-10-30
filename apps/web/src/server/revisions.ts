import { createServerFn } from "@tanstack/react-start";
import { env } from "@open-cinema/runtime";
import { z } from "zod";
import { createDatabase } from "@open-cinema/database";
import {
  getRevision,
  listRevisions,
  resolveAssetRef,
} from "@open-cinema/database/queries";
import { setRevisionStatus } from "@open-cinema/database/mutations";
import {
  commandResultSchema,
  generationRequestSchema,
  revisionSchema,
  setRevisionStatusInputSchema,
  workflowCommandSchema,
  type CommandResult,
  type Revision,
} from "@open-cinema/contracts";
import {
  revisionDecisionsSchema,
  revisionSubmissionSchema,
  type RevisionDecisions,
} from "@/features/revision/model";
import {
  resultChecksSchema,
  type ResultChecks,
} from "@/features/revision/shot-checks";
import { stampDirection } from "./direction";
import { getCoordinator } from "./jobs";
import { optionalSession, requireSameOrigin, requireSession } from "./session";

const db = () => createDatabase(env.DB);

/** Decisions sit beside the SQLite row so history can explain how a result was made. */
const decisionsKey = (ownerId: string, revisionId: string) =>
  `revisions/${ownerId}/${revisionId}/decisions.json`;

async function readDecisions(
  ownerId: string,
  revisionId: string,
): Promise<RevisionDecisions | null> {
  try {
    const object = await env.GENERATED_ASSETS.get(
      decisionsKey(ownerId, revisionId),
    );
    if (!object) return null;
    const body: unknown = await object.json();
    const parsed = revisionDecisionsSchema.safeParse(
      body && typeof body === "object" && "decisions" in body
        ? body.decisions
        : body,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Post-run likeness and bystander checks, measured in the browser once per result. */
const CHECKED_KINDS = new Set([
  "video.character-replace",
  "video.object-swap",
  "video.restyle",
]);
const checksKey = (ownerId: string, revisionId: string) =>
  `revisions/${ownerId}/${revisionId}/checks.json`;

async function readChecks(
  ownerId: string,
  revisionId: string,
): Promise<ResultChecks | null> {
  try {
    const object = await env.GENERATED_ASSETS.get(
      checksKey(ownerId, revisionId),
    );
    if (!object) return null;
    const parsed = resultChecksSchema.safeParse(await object.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const saveRevisionChecks = createServerFn({ method: "POST" })
  .validator(
    z.object({
      revisionId: z.string().min(1).max(100),
      checks: resultChecksSchema,
    }),
  )
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    const revision = await getRevision(
      db(),
      { ownerId: session.userId },
      data.revisionId,
    );
    if (!revision || !CHECKED_KINDS.has(revision.workflowKind)) return false;
    await env.GENERATED_ASSETS.put(
      checksKey(session.userId, revision.id),
      JSON.stringify(data.checks),
      { httpMetadata: { contentType: "application/json" } },
    );
    return true;
  });

/** Written at submission so a revision page works before SQLite catches up. */
const pendingRevisionSchema = z.object({
  revision: revisionSchema,
  decisions: revisionDecisionsSchema,
});

async function readPending(ownerId: string, revisionId: string) {
  try {
    const object = await env.GENERATED_ASSETS.get(
      decisionsKey(ownerId, revisionId),
    );
    if (!object) return null;
    const parsed = pendingRevisionSchema.safeParse(await object.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Every revision, newest first, for the Revisions list. */
export const getRevisionsHome = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await optionalSession();
    if (!session) return { signedIn: false as const };
    const revisions = await listRevisions(db(), { ownerId: session.userId });
    return { signedIn: true as const, revisions };
  },
);

export interface RevisionEntry {
  revision: Revision;
  decisions: RevisionDecisions | null;
}

/** A revision with every other revision of the same source, newest first. */
export const getRevisionView = createServerFn({ method: "GET" })
  .validator(z.object({ revisionId: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const session = await optionalSession();
    if (!session) return { signedIn: false as const };
    const scope = { ownerId: session.userId };
    // The coordinator projects a revision to SQLite with its job; until then the
    // record written at submission stands in, marked pending.
    const revision =
      (await getRevision(db(), scope, data.revisionId)) ??
      (await readPending(session.userId, data.revisionId))?.revision ??
      null;
    if (!revision) return { signedIn: true as const, revision: null };
    const lineage = await listRevisions(db(), scope, {
      source: revision.source,
    });
    if (!lineage.some((entry) => entry.id === revision.id))
      lineage.unshift(revision);
    const history: RevisionEntry[] = await Promise.all(
      lineage.slice(0, 30).map(async (entry) => ({
        revision: entry,
        decisions: await readDecisions(session.userId, entry.id),
      })),
    );
    return {
      signedIn: true as const,
      revision,
      checks: CHECKED_KINDS.has(revision.workflowKind)
        ? await readChecks(session.userId, revision.id)
        : null,
      decisions:
        history.find((entry) => entry.revision.id === revision.id)?.decisions ??
        (await readDecisions(session.userId, revision.id)),
      history,
    };
  });

export const decideRevision = createServerFn({ method: "POST" })
  .validator(setRevisionStatusInputSchema)
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    return setRevisionStatus(db(), { ownerId: session.userId }, data);
  });

export type SubmitRevisionResult =
  | { ok: true; revisionId: string; result: CommandResult }
  | { ok: false; error: string };

/** Starts a revision (background, recast, swap, restyle or re-stage) and records it against its source. */
export const submitRevision = createServerFn({ method: "POST" })
  .validator(revisionSubmissionSchema)
  .handler(async ({ data }): Promise<SubmitRevisionResult> => {
    requireSameOrigin();
    const session = await requireSession();
    const scope = { ownerId: session.userId };
    const request = generationRequestSchema.safeParse(data.request);
    const source =
      request.success && "source" in request.data.inputs
        ? request.data.inputs.source
        : null;
    if (!request.success || !source)
      return {
        ok: false,
        error: "Choose a clip and what should change, then try again.",
      };
    if (!(await resolveAssetRef(db(), scope, source)))
      return {
        ok: false,
        error:
          "This clip is not ready for revisions yet. Choose another clip, or upload it again.",
      };
    const stamped = await stampDirection(
      db(),
      scope,
      workflowCommandSchema.parse({
        idempotencyKey: data.idempotencyKey,
        request: request.data,
        revision: {
          intent: data.intent,
          parentRevisionId: data.parentRevisionId,
        },
      }),
    );
    if (!stamped.ok) return { ok: false, error: stamped.error };
    const command = stamped.command;
    const submitted = await getCoordinator(session.userId).submit(
      scope,
      command,
    );
    const result = commandResultSchema.parse(submitted);
    if (!result.ok) return { ok: false, error: result.error };
    // A revision shares its job's ID; retries map to the same job.
    const job = result.snapshot.jobs.find((j) =>
      result.jobId
        ? j.id === result.jobId
        : j.workflowKind === command.request.workflowKind &&
          j.prompt === data.intent,
    );
    if (!job)
      return {
        ok: false,
        error:
          "The revision was accepted but could not be found. Check Activity before trying again.",
      };
    const now = new Date().toISOString();
    const revision = revisionSchema.parse({
      id: job.id,
      ownerId: session.userId,
      parentRevisionId: data.parentRevisionId ?? null,
      source,
      result: null,
      jobId: job.id,
      workflowKind: command.request.workflowKind,
      intent: data.intent,
      status: "pending",
      createdAt: job.createdAt ?? now,
      updatedAt: now,
    });
    await env.GENERATED_ASSETS.put(
      decisionsKey(session.userId, revision.id),
      JSON.stringify({ revision, decisions: data.decisions }),
      { httpMetadata: { contentType: "application/json" } },
    );
    return { ok: true, revisionId: revision.id, result };
  });
