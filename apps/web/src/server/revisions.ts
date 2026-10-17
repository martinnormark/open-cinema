import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { createDatabase } from "@open-cinema/database";
import {
  getProject,
  getRevision,
  listProjects,
  listRevisions,
  resolveAssetRef,
} from "@open-cinema/database/queries";
import {
  createProject,
  setRevisionStatus,
} from "@open-cinema/database/mutations";
import {
  commandResultSchema,
  createProjectInputSchema,
  generationRequestSchema,
  revisionSchema,
  setRevisionStatusInputSchema,
  workflowCommandSchema,
  type CommandResult,
  type Project,
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
import { requireSameOrigin, requireSession } from "./session";

const db = () => createDatabase(env.DB);

async function optionalSession() {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof Response && error.status === 401) return null;
    throw error;
  }
}

/** Decisions sit beside the D1 row so history can explain how a result was made. */
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
    if (!revision || revision.workflowKind !== "video.character-replace")
      return false;
    await env.GENERATED_ASSETS.put(
      checksKey(session.userId, revision.id),
      JSON.stringify(data.checks),
      { httpMetadata: { contentType: "application/json" } },
    );
    return true;
  });

/** Written at submission so a revision page works before D1 catches up. */
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

export interface ProjectSummary extends Project {
  revisionCount: number;
  lastRevisionAt: string | null;
}

export const getProjects = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ signedIn: boolean; projects: ProjectSummary[] }> => {
    const session = await optionalSession();
    if (!session) return { signedIn: false, projects: [] };
    const scope = { ownerId: session.userId };
    const [projects, revisions] = await Promise.all([
      listProjects(db(), scope),
      listRevisions(db(), scope),
    ]);
    return {
      signedIn: true,
      projects: projects.map((project) => {
        const own = revisions.filter((r) => r.projectId === project.id);
        return {
          ...project,
          revisionCount: own.length,
          lastRevisionAt: own[0]?.createdAt ?? null,
        };
      }),
    };
  },
);

export const startProject = createServerFn({ method: "POST" })
  .validator(createProjectInputSchema)
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    return createProject(db(), { ownerId: session.userId }, data);
  });

export const getProjectHome = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const session = await optionalSession();
    if (!session) return { signedIn: false as const };
    const scope = { ownerId: session.userId };
    const project = await getProject(db(), scope, data.projectId);
    if (!project) return { signedIn: true as const, project: null };
    const revisions = await listRevisions(db(), scope, {
      projectId: project.id,
    });
    return { signedIn: true as const, project, revisions };
  });

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
    // The coordinator projects a revision to D1 with its job; until then the
    // record written at submission stands in, marked pending.
    const revision =
      (await getRevision(db(), scope, data.revisionId)) ??
      (await readPending(session.userId, data.revisionId))?.revision ??
      null;
    if (!revision) return { signedIn: true as const, revision: null };
    const [lineage, project] = await Promise.all([
      listRevisions(db(), scope, { source: revision.source }),
      revision.projectId
        ? getProject(db(), scope, revision.projectId)
        : Promise.resolve(null),
    ]);
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
      project,
      checks:
        revision.workflowKind === "video.character-replace"
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

/** Starts a background replacement or recast and records it as a revision of its source. */
export const submitRevision = createServerFn({ method: "POST" })
  .validator(revisionSubmissionSchema)
  .handler(async ({ data }): Promise<SubmitRevisionResult> => {
    requireSameOrigin();
    const session = await requireSession();
    const scope = { ownerId: session.userId };
    const request = generationRequestSchema.safeParse(data.request);
    if (
      !request.success ||
      (request.data.workflowKind !== "video.background-replace" &&
        request.data.workflowKind !== "video.character-replace")
    )
      return {
        ok: false,
        error: "Choose a clip and what should change, then try again.",
      };
    const source = request.data.inputs.source;
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
        projectId: data.projectId,
        revision: {
          intent: data.intent,
          parentRevisionId: data.parentRevisionId,
        },
      }),
    );
    if (!stamped.ok) return { ok: false, error: stamped.error };
    const command = stamped.command;
    using submitted = await getCoordinator(session.userId).submit(
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
      projectId: data.projectId ?? null,
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
