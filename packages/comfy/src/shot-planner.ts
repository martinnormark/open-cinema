import {
  planSequenceInputSchema,
  sequencePlanSchema,
  shotCameraSchema,
  shotFramingSchema,
  splitIdeaIntoBeats,
  type PlanSequenceInput,
  type SequencePlan,
} from "@open-cinema/contracts";
import { loopbackRelay } from "./relay";

/**
 * Turns a rough idea into proposed shots with a language model on Router
 * (Anthropic's Messages API, passed through unchanged). The model only
 * proposes: every shot is editable and nothing is generated until the creator
 * asks. Any failure falls back to the offline beat splitter, labelled as such.
 */
export const SHOT_PLANNER_MODEL = "anthropic/claude-sonnet-5-5";

const DURATIONS = [2, 3, 4, 5, 6, 8, 10] as const;

const TOOL = {
  name: "propose_shots",
  description: "Propose a short sequence of shots for the creator to review.",
  input_schema: {
    type: "object",
    required: ["title", "shots"],
    properties: {
      title: { type: "string", description: "A short title, 2 to 6 words." },
      shots: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          required: ["title", "beat", "prompt", "framing", "camera"],
          properties: {
            title: { type: "string", description: "2 to 5 words." },
            beat: {
              type: "string",
              description: "The story beat this shot carries, one sentence.",
            },
            prompt: {
              type: "string",
              description:
                "What the frame shows: subjects, action, setting, light. Refer to Elements only as @Handle exactly as listed. No camera or lens words.",
            },
            framing: { type: "string", enum: shotFramingSchema.options },
            camera: { type: "string", enum: shotCameraSchema.options },
            durationSeconds: { type: "integer", enum: DURATIONS },
            continuity: {
              type: "string",
              enum: ["fresh", "continue"],
              description:
                "continue when this shot picks up exactly where the previous one ends (same moment, same place).",
            },
          },
        },
      },
    },
  },
} as const;

function system(input: ReturnType<typeof planSequenceInputSchema.parse>) {
  const cast = input.elements.length
    ? input.elements
        .map(
          (e) =>
            `- @${e.handle} (${e.type}): ${e.name}. ${e.description}`.trim() +
            (e.states.length ? ` States: ${e.states.join(", ")}.` : ""),
        )
        .join("\n")
    : "- (none yet)";
  return [
    "You are a director's assistant in a film studio app. Break the creator's idea into a short, coherent shot sequence.",
    `Propose at most ${input.maxShots} shots. Vary framing deliberately (establish wide, then move closer for emotion). Keep the same subjects and place recognizable across shots.`,
    "Use the creator's Elements wherever they fit, written as @Handle, or @Handle:state to show one of its listed states. Do not invent new handles or states; describe anything else in plain words.",
    "Keep each prompt under 60 words, concrete and visual. Keep the creator's own wording and intent.",
    input.direction
      ? `The project's look (applied separately, do not repeat it): ${input.direction}`
      : "",
    `Elements:\n${cast}`,
    `Answer only by calling ${TOOL.name} once.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function planSequence(
  raw: PlanSequenceInput,
  options: {
    apiKey: string;
    baseUrl?: string | undefined;
    fetch?: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<SequencePlan> {
  const input = planSequenceInputSchema.parse(raw);
  const fallback = (note: string) => ({
    ...splitIdeaIntoBeats(input.idea, input.maxShots),
    note,
  });
  if (!options.apiKey.trim())
    return fallback("Comfy is not configured, so shots follow your sentences.");
  const [provider, model] = SHOT_PLANNER_MODEL.split("/") as [string, string];
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(
      `${loopbackRelay(options.baseUrl) ?? "https://api.comfy.org"}/v2/models/${provider}/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          system: system(input),
          // Router rejects a forced tool_choice for this model, so the system
          // prompt asks for the call and readPlan ignores anything else.
          tools: [TOOL],
          messages: [{ role: "user", content: input.idea }],
        }),
        signal: options.signal ?? AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return fallback(
      "The planner did not answer, so shots follow your sentences.",
    );
  }
  if (!response.ok)
    return fallback(
      response.status === 402
        ? "There are not enough Comfy credits to plan, so shots follow your sentences."
        : "The planner was unavailable, so shots follow your sentences.",
    );
  const plan = readPlan(await response.json().catch(() => null), input);
  return (
    plan ??
    fallback(
      "The planner's answer was unusable, so shots follow your sentences.",
    )
  );
}

/** Reads the tool call, keeping only handles the creator actually has. */
export function readPlan(
  body: unknown,
  input: { elements: { handle: string }[]; maxShots: number },
): SequencePlan | null {
  const content = (body as { content?: unknown })?.content;
  if (!Array.isArray(content)) return null;
  const call = content.find(
    (part): part is { type: "tool_use"; input: unknown } =>
      part?.type === "tool_use" && part?.name === TOOL.name,
  );
  if (!call) return null;
  const known = new Set(input.elements.map((e) => e.handle.toLowerCase()));
  const clean = (text: unknown) =>
    String(text ?? "")
      .replace(
        /@([A-Za-z][A-Za-z0-9_]*)(:[A-Za-z0-9-]+)?/g,
        (match, handle: string) =>
          known.has(handle.toLowerCase()) ? match : handle,
      )
      .trim()
      .slice(0, 2000);
  const raw = call.input as { title?: unknown; shots?: unknown };
  if (!Array.isArray(raw.shots)) return null;
  const parsed = sequencePlanSchema.safeParse({
    title:
      String(raw.title ?? "")
        .trim()
        .slice(0, 120) || "Untitled sequence",
    planner: "model",
    shots: raw.shots
      .slice(0, input.maxShots)
      .map((shot: Record<string, unknown>) => ({
        title:
          String(shot.title ?? "Shot")
            .trim()
            .slice(0, 120) || "Shot",
        beat: clean(shot.beat),
        prompt: clean(shot.prompt),
        framing: shotFramingSchema.safeParse(shot.framing).data ?? "medium",
        camera: shotCameraSchema.safeParse(shot.camera).data ?? "static",
        durationSeconds: DURATIONS.includes(shot.durationSeconds as never)
          ? shot.durationSeconds
          : 5,
        continuity: shot.continuity === "continue" ? "continue" : "fresh",
      })),
  });
  return parsed.success ? parsed.data : null;
}
