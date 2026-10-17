import {
  approvedMotionReferences,
  approvedReferences,
  combineStates,
  mentionStateIds,
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
const MAX_MOTION_PER_MENTION = 3;

export class MentionError extends Error {}

function snapshot(element: Element, stateIds: string[]): ResolvedMention {
  const { states, problem } = combineStates(element, stateIds);
  if (problem) throw new MentionError(problem);
  const state = states[0];
  return {
    elementId: element.id,
    handle: element.handle,
    name: element.name,
    type: element.type,
    version: element.version,
    description: element.description,
    stateId: state?.id ?? null,
    // Combined states read as one: "Wet, Frightened".
    stateName: states.length ? states.map((s) => s.name).join(", ") : null,
    stateDescription: states.length
      ? states
          .map((s) => s.description.trim())
          .filter(Boolean)
          .join("; ") || null
      : null,
    states: states.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      kind: s.kind,
    })),
    references: approvedReferences(
      element,
      states.map((s) => s.id),
    )
      .slice(0, MAX_REFERENCES_PER_MENTION)
      .map((ref) => ({ asset: ref.asset, view: ref.view, roles: ref.roles })),
    motion: approvedMotionReferences(
      element,
      states.map((s) => s.id),
    )
      .slice(0, MAX_MOTION_PER_MENTION)
      .map((ref) => ({ asset: ref.asset, view: ref.view })),
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
    resolved.push(snapshot(element, mentionStateIds(mention)));
  }
  for (const handle of handles) {
    const element = byHandle.find((e) => e.handle === handle);
    if (element && !resolved.some((m) => m.elementId === element.id))
      resolved.push(snapshot(element, []));
  }
  if (resolved.length > MAX_MENTIONS)
    throw new MentionError(
      `Mention at most ${MAX_MENTIONS} Elements in one generation.`,
    );
  return resolved;
}
