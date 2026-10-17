import {
  approvedReferences,
  parseMentionHandles,
  requestMentions,
  requestPrompt,
  type Element,
  type GenerationRequest,
  type OwnerScope,
  type ResolvedMention,
} from "@open-cinema/contracts";
import type { DatabaseContext } from "@open-cinema/database";
import {
  getElementsByHandles,
  getElementsByIds,
} from "@open-cinema/database/queries";

const MAX_MENTIONS = 8;
const MAX_REFERENCES_PER_MENTION = 8;

export class MentionError extends Error {}

function snapshot(element: Element, stateId: string | null): ResolvedMention {
  const state = stateId
    ? element.states.find((s) => s.id === stateId)
    : undefined;
  if (stateId && !state)
    throw new MentionError(`${element.name} no longer has that state.`);
  return {
    elementId: element.id,
    handle: element.handle,
    name: element.name,
    type: element.type,
    version: element.version,
    description: element.description,
    stateId: state?.id ?? null,
    stateName: state?.name ?? null,
    stateDescription: state?.description ?? null,
    references: approvedReferences(element, state?.id)
      .slice(0, MAX_REFERENCES_PER_MENTION)
      .map((ref) => ({ asset: ref.asset, view: ref.view, roles: ref.roles })),
  };
}

/**
 * Explicit mentions (with their selected states) come first, then `@Handle`
 * tokens in the prompt that name an Element. Unknown handles stay plain text.
 */
export async function resolveMentions(
  db: DatabaseContext,
  scope: OwnerScope,
  request: GenerationRequest,
): Promise<ResolvedMention[]> {
  const explicit = requestMentions(request);
  const handles = parseMentionHandles(requestPrompt(request));
  if (!explicit.length && !handles.length) return [];
  const [byId, byHandle] = await Promise.all([
    getElementsByIds(
      db,
      scope,
      explicit.map((m) => m.elementId),
    ),
    getElementsByHandles(db, scope, handles),
  ]);
  const resolved: ResolvedMention[] = [];
  for (const mention of explicit) {
    const element = byId.find((e) => e.id === mention.elementId);
    if (!element)
      throw new MentionError("A mentioned Element is no longer available.");
    resolved.push(snapshot(element, mention.stateId ?? null));
  }
  for (const handle of handles) {
    const element = byHandle.find((e) => e.handle === handle);
    if (element && !resolved.some((m) => m.elementId === element.id))
      resolved.push(snapshot(element, null));
  }
  if (resolved.length > MAX_MENTIONS)
    throw new MentionError(
      `Mention at most ${MAX_MENTIONS} Elements in one generation.`,
    );
  return resolved;
}
