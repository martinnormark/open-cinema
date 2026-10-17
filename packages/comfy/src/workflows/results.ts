/** Accepts only credential-free https URLs from provider result documents. */
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Reads `result.<field>` from a Router result document. */
export function resultField(data: unknown, field: string): unknown {
  if (!data || typeof data !== "object" || !("result" in data)) return null;
  const result = data.result;
  if (!result || typeof result !== "object" || !(field in result)) return null;
  return (result as Record<string, unknown>)[field];
}

const EXTENSIONS: ReadonlyArray<[RegExp, string]> = [
  [/\.png$/, "image/png"],
  [/\.jpe?g$/, "image/jpeg"],
  [/\.webp$/, "image/webp"],
  [/\.mp4$/, "video/mp4"],
  [/\.webm$/, "video/webm"],
  [/\.mov$/, "video/quicktime"],
];

/** A hint from the URL path; archival records the stored Content-Type. */
export function mediaTypeFromUrl(url: string, fallback: string): string {
  const path = new URL(url).pathname.toLowerCase();
  return EXTENSIONS.find(([pattern]) => pattern.test(path))?.[1] ?? fallback;
}

interface MentionText {
  handle: string;
  name: string;
  description?: string;
  stateName: string | null;
  stateDescription?: string | null;
}

/**
 * How much a mention says in the prompt. `name` suits a model that sees the
 * Element's references and its states' own sheets; `state` adds what the
 * selected states change; `full` also says who the Element is, for text-only
 * models (LTX on Router, FLUX with no references) that would otherwise only
 * read a name.
 */
export type MentionDetail = "name" | "state" | "full";

function clip(text: string, max: number) {
  const t = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trim();
}

function mentionText(mention: MentionText, detail: MentionDetail) {
  const details: string[] = [];
  if (detail === "full" && mention.description?.trim())
    details.push(clip(mention.description, 240));
  if (mention.stateName) {
    const change =
      detail !== "name" && mention.stateDescription?.trim()
        ? `: ${clip(mention.stateDescription, 200)}`
        : "";
    details.push(`${mention.stateName.toLowerCase()}${change}`);
  }
  return details.length
    ? `${mention.name} (${details.join("; ")})`
    : mention.name;
}

/**
 * Replaces `@Handle` and `@Handle:state+state` tokens with Element names (and
 * as much detail as `detail` asks for) so models read them naturally.
 */
export function expandMentions(
  prompt: string,
  mentions: readonly MentionText[],
  detail: MentionDetail = "name",
): string {
  return prompt.replace(
    /@([A-Za-z][A-Za-z0-9_]{0,39})(?::[A-Za-z0-9-]+(?:\+[A-Za-z0-9-]+)*)?/g,
    (token, handle: string) => {
      const mention = mentions.find((m) => m.handle === handle);
      return mention ? mentionText(mention, detail) : token;
    },
  );
}
