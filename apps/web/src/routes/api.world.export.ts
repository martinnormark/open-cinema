import { createFileRoute } from "@tanstack/react-router";
import { env } from "@open-cinema/runtime";
import { pruneWorldMedia, WORLD_MANIFEST_PATH } from "@open-cinema/contracts";
import { createDatabase } from "@open-cinema/database";
import { collectWorld } from "@open-cinema/database/queries";
import { zipStream } from "@/lib/zip";
import { requireSession } from "@/server/session";

/** A file name the browser keeps as given: letters, digits and dashes. */
function downloadName(name: string | undefined) {
  const slug = (name ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `${slug || "open-cinema"}.world.zip`;
}

/**
 * Downloads a world bundle: `world.json` first, then each media file streamed
 * from storage. Files are checked before the download starts, so the manifest
 * never lists one the archive does not carry.
 */
async function exportWorld(request: Request) {
  const session = await requireSession();
  const projectId = new URL(request.url).searchParams.get("project");
  if (projectId !== null && (!projectId || projectId.length > 100))
    return new Response("Invalid project", { status: 400 });
  const scope = { ownerId: session.userId };
  const world = await collectWorld(createDatabase(env.DB), scope, {
    ...(projectId ? { projectId } : {}),
  });
  if (!world) return new Response("Project not found", { status: 404 });

  const present = await Promise.all(
    world.files.map(async (file) =>
      (await env.GENERATED_ASSETS.head(file.r2Key)) ? file : null,
    ),
  );
  const files = present.filter((f) => f !== null);
  const manifest = pruneWorldMedia(
    world.manifest,
    new Set(files.map((f) => f.path)),
  );
  const body = zipStream([
    {
      name: WORLD_MANIFEST_PATH,
      open: async () =>
        new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    },
    ...files.map((file) => ({
      name: file.path,
      open: async () =>
        (await env.GENERATED_ASSETS.get(file.r2Key))?.body ?? null,
    })),
  ]);
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${downloadName(manifest.project?.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/world/export")({
  server: { handlers: { GET: ({ request }) => exportWorld(request) } },
});
