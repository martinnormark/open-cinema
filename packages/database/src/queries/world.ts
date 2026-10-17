import {
  capabilityIdSchema,
  parseMentionHandles,
  WORKFLOW_DESCRIPTORS,
  WORLD_FORMAT,
  WORLD_VERSION,
  worldMediaPath,
  type AssetRef,
  type OwnerScope,
  type WorldManifestInput,
  type WorldMedia,
} from "@open-cinema/contracts";
import type { DatabaseContext } from "../client";
import { getJob, getJobOutput } from "./jobs";
import { getMediaAsset } from "./media";
import { getProject } from "./projects";
import { listElements } from "./elements";
import { listRecipes } from "./recipes";
import { getSequence, listSequences } from "./sequences";

/** A media file the bundle carries, and where its bytes live in storage. */
export interface WorldFile {
  path: string;
  r2Key: string;
}

/**
 * Everything a world bundle carries for one project, or for the whole studio
 * when no project is given: its Elements (with every reference not rejected),
 * all recipes, its sequences with their approved takes, and the media those
 * point at. Only the caller's records are read; storage keys come from those
 * records, never from the request.
 */
export async function collectWorld(
  db: DatabaseContext,
  scope: OwnerScope,
  options: { projectId?: string; now?: Date } = {},
): Promise<{ manifest: WorldManifestInput; files: WorldFile[] } | null> {
  const project = options.projectId
    ? await getProject(db, scope, options.projectId)
    : null;
  if (options.projectId && !project) return null;
  const projectFilter = project ? { projectId: project.id } : {};

  const summaries = await listSequences(db, scope, projectFilter);
  const sequences = (
    await Promise.all(summaries.map((s) => getSequence(db, scope, s.id)))
  ).filter((s) => s !== null);

  // A project's own Elements, plus studio-wide ones its shots mention.
  const all = await listElements(db, scope);
  const mentioned = new Set(
    sequences.flatMap((s) =>
      s.shots.flatMap((shot) =>
        parseMentionHandles(`${shot.prompt} ${shot.beat}`),
      ),
    ),
  );
  const elements = project
    ? all.filter(
        (e) =>
          e.projectId === project.id ||
          (e.projectId === null && mentioned.has(e.handle)),
      )
    : all;
  const recipes = await listRecipes(db, scope);

  const media = new Map<string, WorldMedia>();
  const files: WorldFile[] = [];
  const seen = new Map<string, string | null>();
  /** The bundle path for a ref, reading its metadata once. */
  async function include(ref: AssetRef): Promise<string | null> {
    // Output ids already begin with their job's id.
    const key =
      ref.type === "media-asset"
        ? ref.assetId
        : ref.outputId.startsWith(ref.jobId)
          ? ref.outputId
          : `${ref.jobId}-${ref.outputId}`;
    if (seen.has(key)) return seen.get(key) ?? null;
    seen.set(key, null);
    if (ref.type === "media-asset") {
      const asset = await getMediaAsset(db, scope, ref.assetId);
      if (asset?.status !== "ready") return null;
      const path = worldMediaPath(key, asset.mediaType);
      media.set(path, {
        path,
        mediaType: asset.mediaType,
        kind: asset.kind,
        sizeBytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        origin: { type: "upload", filename: asset.filename },
      });
      files.push({ path, r2Key: asset.r2Key });
      seen.set(key, path);
      return path;
    }
    const [output, job] = await Promise.all([
      getJobOutput(db, scope, ref.jobId, ref.outputId),
      getJob(db, scope, ref.jobId),
    ]);
    if (!output?.r2Key || !job) return null;
    const path = worldMediaPath(key, output.mediaType);
    media.set(path, {
      path,
      mediaType: output.mediaType,
      kind: output.mediaType.startsWith("video/") ? "video" : "image",
      sizeBytes: output.sizeBytes,
      width: output.width ?? null,
      height: output.height ?? null,
      durationMs: output.durationMs ?? null,
      origin: {
        type: "generated",
        workflowKind: job.workflowKind,
        model: job.model,
        prompt: job.prompt.slice(0, 4000),
        createdAt: job.createdAt,
      },
    });
    files.push({ path, r2Key: output.r2Key });
    seen.set(key, path);
    return path;
  }

  const worldElements = [];
  for (const element of elements) {
    const references = [];
    for (const ref of element.references) {
      if (ref.status === "rejected") continue;
      const path = await include(ref.asset);
      if (!path) continue;
      references.push({
        media: path,
        stateKey: ref.stateId,
        status: ref.status,
        view: ref.view,
        roles: ref.roles,
        note: ref.note,
      });
    }
    worldElements.push({
      key: element.id,
      type: element.type,
      name: element.name,
      handle: element.handle,
      description: element.description,
      version: element.version,
      states: element.states.map((s) => ({
        key: s.id,
        name: s.name,
        description: s.description,
        kind: s.kind,
      })),
      references,
    });
  }

  const worldRecipes = [];
  for (const recipe of recipes)
    worldRecipes.push({
      key: recipe.id,
      name: recipe.name,
      summary: recipe.summary,
      spec: recipe.spec,
      version: recipe.version,
      history: recipe.history,
      cover: recipe.cover ? await include(recipe.cover) : null,
    });

  const worldSequences = [];
  for (const sequence of sequences) {
    const shots = [];
    for (const shot of sequence.shots) {
      const takes = [];
      for (const take of shot.takes) {
        if (take.status !== "approved" || !take.asset) continue;
        const path = await include(take.asset);
        if (path)
          takes.push({
            role: take.role,
            origin: take.origin,
            status: take.status,
            prompt: take.prompt,
            media: path,
          });
      }
      shots.push({
        title: shot.title,
        beat: shot.beat,
        prompt: shot.prompt,
        framing: shot.framing,
        camera: shot.camera,
        durationSeconds: shot.durationSeconds,
        continuity: shot.continuity,
        takes,
      });
    }
    worldSequences.push({
      key: sequence.id,
      title: sequence.title,
      idea: sequence.idea,
      shots,
    });
  }

  return {
    manifest: {
      format: WORLD_FORMAT,
      version: WORLD_VERSION,
      exportedAt: (options.now ?? new Date()).toISOString(),
      studio: {
        workflows: Object.values(WORKFLOW_DESCRIPTORS).map((d) => ({
          kind: d.kind,
          models: [...d.models],
        })),
        capabilities: [...capabilityIdSchema.options],
      },
      project: project
        ? { name: project.name, direction: project.direction, look: project.look }
        : null,
      elements: worldElements,
      recipes: worldRecipes,
      sequences: worldSequences,
      media: [...media.values()],
    },
    files,
  };
}
