import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { createDatabase } from "@open-cinema/database";
import { listProjectJobs } from "@open-cinema/database/queries";
import { updateProject } from "@open-cinema/database/mutations";
import {
  resultOutputs,
  updateProjectInputSchema,
  type DirectionSnapshot,
  type ResolvedMention,
} from "@open-cinema/contracts";
import { requireSameOrigin, requireSession } from "./session";

const db = () => createDatabase(env.DB);

/** Saves a project's name, brief or shared look; shots are never rewritten. */
export const saveProject = createServerFn({ method: "POST" })
  .validator(updateProjectInputSchema)
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    const project = await updateProject(
      db(),
      { ownerId: session.userId },
      data,
    );
    if (!project) throw new Error("This project is no longer available.");
    return project;
  });

export interface ProjectShot {
  jobId: string;
  state: string;
  prompt: string;
  kind: "image" | "video";
  model: string;
  createdAt: string;
  url: string | null;
  posterUrl: string | null;
  outputId: string | null;
  direction: DirectionSnapshot | null;
  mentions: Pick<ResolvedMention, "handle" | "name" | "type" | "stateName">[];
}

/** The project's generated shots (not revisions), with the direction each used. */
export const getProjectShots = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<ProjectShot[]> => {
    const session = await requireSession();
    const jobs = await listProjectJobs(
      db(),
      { ownerId: session.userId },
      data.projectId,
    );
    return jobs
      .filter(
        ({ job }) =>
          job.workflowKind === "image.flux" ||
          job.workflowKind === "image.flux-reference" ||
          job.workflowKind === "video.ltx",
      )
      .map(({ job, request, mentions }) => {
        const output = resultOutputs(job.outputs).find((o) => o.r2Key);
        const url = output
          ? `/api/jobs/output?job=${encodeURIComponent(job.id)}&output=${encodeURIComponent(output.id)}`
          : null;
        const kind = job.workflowKind === "video.ltx" ? "video" : "image";
        const direction =
          request && "direction" in request.inputs
            ? (request.inputs.direction ?? null)
            : null;
        return {
          jobId: job.id,
          state: job.state,
          prompt: job.prompt,
          kind,
          model: job.model,
          createdAt: job.createdAt,
          url,
          posterUrl: url && kind === "video" ? `${url}&variant=poster` : url,
          outputId: output?.id ?? null,
          direction,
          mentions: mentions.map((m) => ({
            handle: m.handle,
            name: m.name,
            type: m.type,
            stateName: m.stateName,
          })),
        };
      });
  });
