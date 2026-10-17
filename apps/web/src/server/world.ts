import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { readWorldManifest, WorldFormatError } from "@open-cinema/contracts";
import { createDatabase } from "@open-cinema/database";
import { listProjects } from "@open-cinema/database/queries";
import { importWorld } from "@open-cinema/database/mutations";
import { requireSameOrigin, requireSession } from "./session";

async function optionalSession() {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof Response && error.status === 401) return null;
    throw error;
  }
}

export const getWorldHome = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await optionalSession();
    if (!session) return { signedIn: false as const };
    const projects = await listProjects(createDatabase(env.DB), {
      ownerId: session.userId,
    });
    return {
      signedIn: true as const,
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
    };
  },
);

/**
 * Creates a bundle's records once the browser has uploaded its media. The
 * manifest is read again here; nothing the browser parsed is trusted.
 */
export const importMyWorld = createServerFn({ method: "POST" })
  .validator(
    z.object({
      manifest: z.unknown(),
      media: z.record(z.string().max(200), z.string().min(1).max(100)),
    }),
  )
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    try {
      const manifest = readWorldManifest(data.manifest);
      return await importWorld(
        createDatabase(env.DB),
        { ownerId: session.userId },
        manifest,
        data.media,
      );
    } catch (error) {
      if (error instanceof Response) throw error;
      throw new Error(
        error instanceof WorldFormatError || error instanceof Error
          ? error.message
          : "The world could not be brought in. Try again.",
      );
    }
  });
