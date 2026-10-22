import {
  CLIP_PEOPLE,
  clipPersonHandle,
  clipPersonNumber,
  mentionTokens,
} from "@open-cinema/contracts";
import {
  stateHandle,
  type Element,
  type ElementState,
} from "@/features/elements/model";
import type { Box } from "./shot-checks";

/**
 * Copy the moves with several people. The creator pauses on a frame and
 * clicks someone; they become `@person1` in the words, with a cut-out of them
 * from that frame. "Replace @person1 with @Cal" then says who becomes whom.
 */
export interface ClipPerson {
  person: number;
  /** Where they were clicked, on the whole clip. */
  x: number;
  y: number;
  timeMs: number;
  /** The cut-out while it is made, then the box it was cut from. */
  status: "cutting" | "ready" | "failed";
  box: Box | null;
  /** Whether the pose model found them, rather than a box guessed around the click. */
  found: boolean;
  blob: Blob | null;
  /** An object URL for the cut-out's thumbnail. */
  url: string | null;
}

export interface CastPair {
  person: number;
  element: Element;
  state: ElementState | null;
}

/** The lowest free tag, or null when the clip has its four. */
export function nextPerson(people: readonly ClipPerson[]): number | null {
  for (let n = 1; n <= CLIP_PEOPLE.max; n++)
    if (!people.some((p) => p.person === n)) return n;
  return null;
}

export const personMention = (person: number) => `@${clipPersonHandle(person)}`;

/**
 * Pairs each tagged person with the Character named next to them, in either
 * order: "Replace @person1 with @Cal" and "@Cal takes over from @person1"
 * both pair 1 with Cal. A person keeps their first pairing; untagged
 * handles and other Element types are ignored.
 */
export function castFromWords(
  text: string,
  people: readonly Pick<ClipPerson, "person">[],
  characters: readonly Element[],
): CastPair[] {
  const byHandle = new Map(characters.map((c) => [c.handle.toLowerCase(), c]));
  const tagged = new Set(people.map((p) => p.person));
  const pairs: CastPair[] = [];
  let person: number | null = null;
  let waiting: Omit<CastPair, "person"> | null = null;
  const pair = (n: number, who: Omit<CastPair, "person">) => {
    if (n > 0 && !pairs.some((p) => p.person === n))
      pairs.push({ person: n, ...who });
    person = null;
    waiting = null;
  };
  for (const token of mentionTokens(text)) {
    const n = clipPersonNumber(token.handle);
    if (n !== null) {
      // An untagged person still takes the Character beside them, so it
      // never slides over to the next tag.
      if (waiting) pair(tagged.has(n) ? n : 0, waiting);
      else person = tagged.has(n) ? n : 0;
      continue;
    }
    const element = byHandle.get(token.handle.toLowerCase());
    if (!element) continue;
    const named = token.stateHandles[0]?.toLowerCase();
    const who = {
      element,
      state: named
        ? (element.states.find((s) => stateHandle(s) === named) ?? null)
        : null,
    };
    if (person !== null) pair(person, who);
    else waiting = who;
  }
  return pairs;
}

/** Drops a removed person's tag from the words, with the clause around it when it is only that. */
export function withoutPerson(text: string, person: number) {
  const mention = personMention(person);
  return text
    .replace(
      new RegExp(
        `\\s*(Replace|Swap)\\s+${mention}\\s+(with|for)\\s+@[A-Za-z0-9_:+-]*[.,]?`,
        "gi",
      ),
      "",
    )
    .replaceAll(mention, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
