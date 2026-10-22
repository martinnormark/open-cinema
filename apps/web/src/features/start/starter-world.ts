import type { WorldManifestInput, WorldMedia } from "@open-cinema/contracts";
import {
  readWorldManifest,
  WORLD_FORMAT,
  WORLD_VERSION,
} from "@open-cinema/contracts";
import type { OpenedWorld } from "@/features/world/import";

/**
 * The Tide Mill: a small world every studio ships, so a first visit has a
 * cast, a place, a prop, a look and a scene to direct instead of empty pages.
 * It is an ordinary world bundle whose media is served from
 * `public/starter/tide-mill/media`, and it is brought in through the same
 * import as any .world.zip, so everything it creates is the creator's own.
 *
 * Every picture and clip was made during this studio's own evaluations
 * (Cal's sheets, the storm lantern, the tide mill moves); none is stock.
 */
export const STARTER_BASE = "/starter/tide-mill/";

type StarterMedia = Omit<WorldMedia, "origin" | "kind" | "mediaType"> & {
  filename: string;
};

function image(
  name: string,
  filename: string,
  width: number,
  height: number,
  sizeBytes: number,
): StarterMedia {
  return {
    path: `media/${name}.jpg`,
    filename,
    width,
    height,
    sizeBytes,
    durationMs: null,
  };
}
function video(
  name: string,
  filename: string,
  width: number,
  height: number,
  sizeBytes: number,
  durationMs: number,
): StarterMedia {
  return {
    path: `media/${name}.mp4`,
    filename,
    width,
    height,
    sizeBytes,
    durationMs,
  };
}

const MEDIA = [
  image("cal-portrait", "Cal, close portrait.jpg", 880, 1184, 169348),
  image("cal-smile", "Cal, smiling.jpg", 880, 1184, 171355),
  image("cal-sheet", "Cal, character sheet.jpg", 1600, 680, 97256),
  image("cal-wet-portrait", "Cal wet, close portrait.jpg", 880, 1184, 176456),
  image("cal-wet-sheet", "Cal wet, character sheet.jpg", 1600, 680, 121538),
  image(
    "cal-injured-portrait",
    "Cal injured, close portrait.jpg",
    880,
    1184,
    157774,
  ),
  image(
    "cal-injured-sheet",
    "Cal injured, character sheet.jpg",
    1600,
    680,
    113760,
  ),
  image(
    "tide-mill-establishing",
    "Tide Mill, establishing.jpg",
    1280,
    720,
    78432,
  ),
  image("tide-mill-bridge", "Tide Mill, footbridge.jpg", 1280, 720, 106733),
  video(
    "tide-mill-push-in",
    "Tide Mill, push in.mp4",
    1280,
    720,
    1267452,
    5042,
  ),
  image("lantern-hero", "Storm lantern.jpg", 1024, 1024, 87161),
  image(
    "lantern-turnaround",
    "Storm lantern, turnaround.jpg",
    1600,
    680,
    110435,
  ),
  image("lantern-detail", "Storm lantern, details.jpg", 1024, 1024, 144578),
  image(
    "lantern-harbour-wall",
    "Storm lantern on the harbour wall.jpg",
    1024,
    1024,
    205611,
  ),
  video(
    "cal-crosses-the-bridge",
    "Cal crosses the footbridge.mp4",
    1280,
    720,
    1120648,
    5042,
  ),
  video("cal-at-the-mill", "Cal at the mill.mp4", 720, 1280, 1105387, 8042),
  // Not part of any Element: a filmed take to try the take goals on.
  video(
    "kitchen-table",
    "Kitchen table, sample take.mp4",
    1280,
    720,
    1414809,
    6120,
  ),
];

/** The take the front page offers to anyone with no footage of their own. */
export const SAMPLE_TAKE = MEDIA.at(-1)!;

const manifest = {
  format: WORLD_FORMAT,
  version: WORLD_VERSION,
  exportedAt: "2026-10-22T00:00:00.000Z",
  studio: { workflows: [], capabilities: [] },
  project: {
    name: "The Tide Mill",
    direction:
      "A flooded brick tide mill on the salt marsh, the morning after a storm. Grey skies, still water, cold light, and one warm lantern.",
    look: {
      palette: "cool-muted",
      lighting: "overcast",
      lens: "normal-35",
      texture: "film-35",
      pacing: "measured",
    },
  },
  elements: [
    {
      key: "cal",
      type: "character",
      name: "Cal",
      handle: "Cal",
      description:
        "A retired lock keeper in his late sixties. Swept-back silver hair, pale blue eyes, a weathered face. Charcoal wool overcoat over a navy jumper.",
      states: [
        {
          key: "cal-wet",
          name: "Wet",
          description: "Caught in the storm: hair plastered down, coat soaked.",
          kind: "weather",
        },
        {
          key: "cal-injured",
          name: "Injured",
          description:
            "After the fall: a bruised cheek, a cut brow, a torn undershirt.",
          kind: "condition",
        },
      ],
      references: [
        {
          media: "media/cal-portrait.jpg",
          status: "approved",
          view: "face-closeup",
          roles: ["identity"],
        },
        {
          media: "media/cal-smile.jpg",
          status: "approved",
          view: "smile",
          roles: ["identity"],
        },
        {
          media: "media/cal-sheet.jpg",
          status: "approved",
          view: "sheet",
          roles: ["identity", "wardrobe"],
        },
        {
          media: "media/cal-wet-portrait.jpg",
          stateKey: "cal-wet",
          status: "approved",
          view: "face-closeup",
          roles: ["identity", "appearance"],
        },
        {
          media: "media/cal-wet-sheet.jpg",
          stateKey: "cal-wet",
          status: "approved",
          view: "sheet",
          roles: ["appearance", "wardrobe"],
        },
        {
          media: "media/cal-injured-portrait.jpg",
          stateKey: "cal-injured",
          status: "approved",
          view: "face-closeup",
          roles: ["identity", "appearance"],
        },
        {
          media: "media/cal-injured-sheet.jpg",
          stateKey: "cal-injured",
          status: "approved",
          view: "sheet",
          roles: ["appearance", "wardrobe"],
        },
      ],
    },
    {
      key: "tide-mill",
      type: "location",
      name: "Tide Mill",
      handle: "TideMill",
      description:
        "A long two-storey brick mill standing in flood water on an open salt marsh. Arched iron windows, a slate roof, and a black iron footbridge to the side door.",
      references: [
        {
          media: "media/tide-mill-establishing.jpg",
          status: "approved",
          view: "establishing",
          roles: ["layout", "lighting"],
        },
        {
          media: "media/tide-mill-bridge.jpg",
          status: "approved",
          view: "alternate-angle",
          roles: ["layout"],
        },
        {
          media: "media/tide-mill-push-in.mp4",
          status: "approved",
          view: "push-in",
          roles: ["layout"],
        },
      ],
    },
    {
      key: "storm-lantern",
      type: "thing",
      name: "Storm Lantern",
      handle: "StormLantern",
      description:
        "A brass hurricane lantern with a green glass chimney, a wire guard and a turned wooden handle. Worn, polished where it is held.",
      references: [
        {
          media: "media/lantern-hero.jpg",
          status: "approved",
          view: "three-quarter",
          roles: ["identity", "material"],
        },
        {
          media: "media/lantern-turnaround.jpg",
          status: "approved",
          view: "turnaround",
          roles: ["identity"],
        },
        {
          media: "media/lantern-detail.jpg",
          status: "approved",
          view: "detail",
          roles: ["material"],
        },
      ],
    },
  ],
  sequences: [
    {
      key: "the-morning-after",
      title: "The morning after",
      idea: "The storm has passed. @Cal walks out across the marsh to the @TideMill, crosses the footbridge and stops at the door. On the harbour wall behind him, the @StormLantern he left burning all night is still alight.",
      shots: [
        {
          title: "The mill at first light",
          beat: "The flooded mill, alone on the marsh.",
          prompt: "@TideMill, still water, grey morning",
          staging:
            "No one in frame. The camera starts at the footbridge on the left and moves toward the mill; flat light from an overcast sky.",
          framing: "wide",
          camera: "push-in",
          durationSeconds: 5,
          continuity: "fresh",
          takes: [
            {
              role: "motion",
              origin: "generated",
              status: "approved",
              media: "media/tide-mill-push-in.mp4",
            },
          ],
        },
        {
          title: "Cal crosses the footbridge",
          beat: "@Cal reaches the footbridge and crosses to the mill.",
          prompt: "@Cal crosses the iron footbridge to the @TideMill",
          staging:
            "Cal enters from the left on the marsh bank and crosses the footbridge away from camera to the side door; the long wall of the mill fills the right.",
          framing: "wide",
          camera: "static",
          durationSeconds: 5,
          continuity: "fresh",
          takes: [
            {
              role: "motion",
              origin: "generated",
              status: "approved",
              media: "media/cal-crosses-the-bridge.mp4",
            },
          ],
        },
        {
          title: "Cal at the mill",
          beat: "Closer: @Cal walks the bank beside the mill.",
          prompt: "@Cal walks along the bank in front of the @TideMill",
          staging:
            "Cal walks toward camera along the bank, the mill behind him across the water; the camera backs away at his pace.",
          framing: "medium",
          camera: "tracking",
          durationSeconds: 8,
          continuity: "fresh",
          takes: [
            {
              role: "motion",
              origin: "revision",
              status: "approved",
              media: "media/cal-at-the-mill.mp4",
            },
          ],
        },
        {
          title: "The lantern still burning",
          beat: "The @StormLantern on the harbour wall, still lit, the sea behind it.",
          prompt:
            "@StormLantern hanging on the harbour wall, flame still lit, waves breaking behind",
          staging:
            "The lantern hangs from an iron hook on the left wall, the open sea on the right, waves breaking on the rocks below.",
          framing: "close",
          camera: "static",
          durationSeconds: 4,
          continuity: "fresh",
          takes: [
            {
              role: "keyframe",
              origin: "generated",
              status: "approved",
              media: "media/lantern-harbour-wall.jpg",
            },
          ],
        },
      ],
    },
  ],
  media: MEDIA.map(({ filename, ...m }) => ({
    ...m,
    kind: m.path.endsWith(".mp4") ? ("video" as const) : ("image" as const),
    mediaType: m.path.endsWith(".mp4") ? "video/mp4" : "image/jpeg",
    origin: { type: "upload" as const, filename },
  })),
} satisfies WorldManifestInput;

export const starterManifest: WorldManifestInput = manifest;

export function starterMediaUrl(path: string) {
  return STARTER_BASE + path;
}

/**
 * The starter world as an opened bundle: each file is fetched only when the
 * import uploads it, so opening it costs nothing.
 */
export async function openStarterWorld(): Promise<OpenedWorld> {
  const parsed = readWorldManifest(manifest);
  const files = new Map(
    parsed.media.map((m) => [
      m.path,
      {
        name: m.path,
        size: m.sizeBytes ?? 0,
        blob: async () => {
          const response = await fetch(starterMediaUrl(m.path));
          if (!response.ok)
            throw new Error(`${m.path} could not be loaded. Try again.`);
          return response.blob();
        },
      },
    ]),
  );
  return {
    manifest: parsed,
    raw: manifest,
    files,
    bytes: parsed.media.reduce((n, m) => n + (m.sizeBytes ?? 0), 0),
  };
}
