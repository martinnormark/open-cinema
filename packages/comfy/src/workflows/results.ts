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

/** Replaces `@Handle` tokens with Element names so text-only models read them naturally. */
export function expandMentions(
  prompt: string,
  mentions: readonly {
    handle: string;
    name: string;
    stateName: string | null;
  }[],
): string {
  return prompt.replace(/@([A-Za-z][A-Za-z0-9_]{0,39})/g, (token, handle) => {
    const mention = mentions.find((m) => m.handle === handle);
    if (!mention) return token;
    return mention.stateName
      ? `${mention.name} (${mention.stateName})`
      : mention.name;
  });
}
