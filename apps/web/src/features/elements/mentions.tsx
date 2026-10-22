import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";
import {
  approvedMotionReferences,
  approvedReferences,
  combineStates,
  mentionTokens,
  STATE_KIND_LABELS,
  type MentionToken,
  type AssetRef,
  type ElementMention,
  type ElementType,
} from "@open-cinema/contracts";
import {
  assetUrl,
  elementTypes,
  stateHandle,
  type Element,
  type ElementState,
  type ReferenceView,
} from "./model";
import { useElements } from "./store";

export type { MentionToken };

export function parseMentions(text: string): MentionToken[] {
  return mentionTokens(text);
}

export interface MentionReference {
  id: string;
  view: ReferenceView | null;
  asset: AssetRef;
  url: string;
  fromState: boolean;
}

export interface ResolvedMention {
  token: MentionToken;
  element: Element | null;
  /** The first selected state; `states` holds every combined one. */
  state: ElementState | null;
  states: ElementState[];
  /** Approved state references first, then approved identity references. */
  references: MentionReference[];
  /** Approved moving references (a Location's clips), with the same order. */
  moves: MentionReference[];
  problem: string | null;
  /**
   * A state that does not resolve, or two that clash: generating would
   * quietly drop it, so the composer waits for a fix. Missing references are
   * only a warning.
   */
  blocking: boolean;
}

/** The first mention problem that should stop a generation. */
export function blockingMentionProblem(
  mentions: readonly ResolvedMention[],
): string | null {
  return mentions.find((m) => m.blocking)?.problem ?? null;
}

/**
 * The references the server resolves for this mention (`approvedReferences`):
 * the states' own first, then the base sheet's views they do not replace.
 */
function approved(
  element: Element,
  stateIds: string[],
  moving = false,
): MentionReference[] {
  return (
    moving
      ? approvedMotionReferences(element, stateIds)
      : approvedReferences(element, stateIds)
  ).map((r) => ({
    id: r.id,
    view: r.view,
    asset: r.asset,
    url: assetUrl(r.asset),
    fromState: r.stateId !== null,
  }));
}

/** Pure resolver: turns mentions in `text` into Elements, states and approved references. */
export function resolveMentions(
  text: string,
  elements: readonly Element[],
): ResolvedMention[] {
  const byHandle = new Map(elements.map((e) => [e.handle.toLowerCase(), e]));
  return parseMentions(text).map((token) => {
    const element = byHandle.get(token.handle.toLowerCase()) ?? null;
    if (!element)
      return {
        token,
        element,
        state: null,
        states: [],
        references: [],
        moves: [],
        problem: `No Element is named @${token.handle}.`,
        blocking: false,
      };
    const found = token.stateHandles.map(
      (name) =>
        element.states.find((s) => stateHandle(s) === name.toLowerCase()) ??
        name,
    );
    const unknown = found.find((s): s is string => typeof s === "string");
    const combined = combineStates(
      element,
      found.flatMap((s) => (typeof s === "string" ? [] : [s.id])),
    );
    const states = combined.states;
    const references = approved(
      element,
      states.map((s) => s.id),
    );
    const moves = approved(
      element,
      states.map((s) => s.id),
      true,
    );
    const problem = unknown
      ? `@${element.handle} has no state named “${unknown}”.`
      : combined.problem
        ? combined.problem
        : references.length + moves.length === 0
          ? `@${element.handle} has no approved references yet.`
          : null;
    return {
      token,
      element,
      state: states[0] ?? null,
      states,
      references,
      moves,
      problem,
      blocking: !!(unknown || combined.problem),
    };
  });
}

/** Live resolution against the creator's Elements. */
export function useMentions(text: string): ResolvedMention[] {
  const { elements } = useElements();
  return useMemo(() => resolveMentions(text, elements), [text, elements]);
}

/**
 * What a generation request carries for its mentions: each Element and selected
 * state, plus the approved reference images in mention order without repeats.
 */
export function mentionPayload(mentions: readonly ResolvedMention[]): {
  mentions: ElementMention[];
  references: AssetRef[];
} {
  const seen = new Set<string>();
  const payload: { mentions: ElementMention[]; references: AssetRef[] } = {
    mentions: [],
    references: [],
  };
  for (const mention of mentions) {
    if (!mention.element) continue;
    const key = `${mention.element.id}:${mention.states.map((s) => s.id).join("+")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [first, ...rest] = mention.states;
    payload.mentions.push({
      elementId: mention.element.id,
      ...(first ? { stateId: first.id } : {}),
      ...(rest.length ? { stateIds: rest.map((s) => s.id) } : {}),
    });
    for (const reference of mention.references)
      if (!seen.has(reference.id)) {
        seen.add(reference.id);
        payload.references.push(reference.asset);
      }
  }
  return payload;
}

interface Query {
  /** Offset of the `@`. */
  start: number;
  end: number;
  handle: string;
  /** Present once the creator typed `:` (or `+`) after a known handle. */
  stateQuery: string | null;
  /** States already chosen before a `+`. */
  chosen: string[];
}
const ACTIVE =
  /(^|[^\p{L}\p{N}_@])@([A-Za-z0-9_]*)(?::((?:[A-Za-z0-9-]+\+)*)([A-Za-z0-9-]*))?$/u;
function activeQuery(text: string, caret: number): Query | null {
  const match = ACTIVE.exec(text.slice(0, caret));
  if (!match) return null;
  const start = match.index + match[1]!.length;
  const rest = /^[A-Za-z0-9_:+-]*/.exec(text.slice(caret))![0];
  const colon = match[3] !== undefined;
  return {
    start,
    end: caret + rest.length,
    handle: match[2]!,
    stateQuery: colon ? (match[4] ?? "") : null,
    chosen: colon && match[3] ? match[3].split("+").filter(Boolean) : [],
  };
}

interface Suggestion {
  key: string;
  insert: string;
  /** Null for a person tagged in a clip, which is not an Element. */
  element: Element | null;
  state: ElementState | null;
  thumbnail: string | null;
  name: string;
  label: string;
}

/** Something to mention that is not an Element, e.g. `@person1` tagged on a frame. */
export interface ExtraMention {
  handle: string;
  name: string;
  label: string;
  thumbnail: string | null;
}
function suggestionsFor(
  query: Query,
  elements: readonly Element[],
): Suggestion[] {
  const thumbnail = (element: Element, stateId: string | null) => {
    const reference =
      element.references.find(
        (r) => r.status === "approved" && r.stateId === stateId,
      ) ??
      element.references.find((r) => r.status === "approved" && !r.stateId);
    return reference ? assetUrl(reference.asset) : null;
  };
  if (query.stateQuery !== null) {
    const element = elements.find(
      (e) => e.handle.toLowerCase() === query.handle.toLowerCase(),
    );
    if (!element) return [];
    const q = query.stateQuery.toLowerCase();
    // After a `+`, offer only states that can combine with those chosen.
    const chosen = query.chosen
      .map((name) =>
        element.states.find((s) => stateHandle(s) === name.toLowerCase()),
      )
      .filter((s): s is ElementState => !!s);
    const prefix = `@${element.handle}:${query.chosen.map((c) => `${c}+`).join("")}`;
    return element.states
      .filter(
        (s) =>
          !chosen.some((c) => c.id === s.id) &&
          !chosen.some((c) => c.kind !== "other" && c.kind === s.kind) &&
          (stateHandle(s).includes(q) || s.name.toLowerCase().includes(q)),
      )
      .map((state) => ({
        key: state.id,
        insert: `${prefix}${stateHandle(state)}`,
        element,
        state,
        thumbnail: thumbnail(element, state.id),
        name: `${element.name} · ${state.name}`,
        label: STATE_KIND_LABELS[state.kind],
      }));
  }
  const q = query.handle.toLowerCase();
  return elements
    .filter(
      (e) =>
        e.handle.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
    )
    .sort(
      (a, b) =>
        Number(!a.handle.toLowerCase().startsWith(q)) -
        Number(!b.handle.toLowerCase().startsWith(q)),
    )
    .slice(0, 8)
    .map((element) => ({
      key: element.id,
      insert: `@${element.handle}`,
      element,
      state: null,
      thumbnail: thumbnail(element, null),
      name: element.name,
      label: elementTypes[element.type].label,
    }));
}

function extraSuggestions(
  query: Query,
  extra: readonly ExtraMention[],
): Suggestion[] {
  if (query.stateQuery !== null) return [];
  const q = query.handle.toLowerCase();
  return extra
    .filter((m) => m.handle.toLowerCase().startsWith(q))
    .map((m) => ({
      key: `extra-${m.handle}`,
      insert: `@${m.handle}`,
      element: null,
      state: null,
      thumbnail: m.thumbnail,
      name: m.name,
      label: m.label,
    }));
}

type TextareaProps = Omit<
  ComponentProps<"textarea">,
  "value" | "onChange" | "defaultValue"
>;

/** A prompt textarea that suggests Elements after `@` and states after `@Name:`. */
export function MentionTextarea({
  value,
  onValueChange,
  className,
  onKeyDown,
  onBlur,
  focusAtEnd = false,
  types,
  extra,
  inputRef,
  ...props
}: TextareaProps & {
  value: string;
  onValueChange: (value: string) => void;
  /** Focus with the caret after the text, to keep writing after a mention. */
  focusAtEnd?: boolean;
  /** Only these Element types are suggested; every type when left out. */
  types?: readonly ElementType[];
  /** Offered after the Elements, e.g. people tagged on a frame. */
  extra?: readonly ExtraMention[];
  /** The textarea, for focusing it from outside. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const { elements: all } = useElements();
  const elements = useMemo(
    () => (types ? all.filter((e) => types.includes(e.type)) : all),
    [all, types?.join()],
  );
  const listId = useId();
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  // Stable, so it runs when the textarea mounts, not on every keystroke.
  const attach = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textarea.current = node;
      if (inputRef) inputRef.current = node;
      if (!node || !focusAtEnd) return;
      node.focus({ preventScroll: true });
      node.setSelectionRange(node.value.length, node.value.length);
    },
    [focusAtEnd, inputRef],
  );
  const [caret, setCaret] = useState<number | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(0);
  const query = caret === null ? null : activeQuery(value, caret);
  const suggestions = useMemo(
    () =>
      query
        ? [
            ...suggestionsFor(query, elements),
            ...extraSuggestions(query, extra ?? []),
          ]
        : [],
    [query?.start, query?.handle, query?.stateQuery, elements, extra],
  );
  const open = !!query && dismissedAt !== query.start && suggestions.length > 0;
  const active = open ? Math.min(highlight, suggestions.length - 1) : -1;

  function track(target: HTMLTextAreaElement) {
    setCaret(
      target.selectionStart === target.selectionEnd
        ? target.selectionStart
        : null,
    );
  }
  function choose(suggestion: Suggestion) {
    if (!query) return;
    const after = value.slice(query.end);
    // Offer states next when this Element has any; otherwise close with a space.
    const offersStates =
      !suggestion.state && !!suggestion.element?.states.length;
    const trailing = offersStates ? "" : after.startsWith(" ") ? "" : " ";
    const next =
      value.slice(0, query.start) + suggestion.insert + trailing + after;
    const position = query.start + suggestion.insert.length + trailing.length;
    onValueChange(next);
    setHighlight(0);
    setCaret(position);
    setDismissedAt(offersStates ? null : query.start);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(position, position);
    });
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (!open || event.defaultPrevented) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((active + delta + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(suggestions[active]!);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDismissedAt(query!.start);
    }
  }

  return (
    <div className="relative">
      <textarea
        {...props}
        ref={attach}
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          onValueChange(event.target.value);
          setHighlight(0);
          track(event.target);
        }}
        onSelect={(event) => track(event.currentTarget)}
        onFocus={(event) => {
          track(event.currentTarget);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setCaret(null);
          onBlur?.(event);
        }}
        onKeyDown={keyDown}
        className={cn(
          "w-full resize-y rounded-xl border border-input bg-background p-4 text-base leading-7 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          className,
        )}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={query?.stateQuery !== null ? "States" : "Elements"}
        hidden={!open}
        className="mention-list absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-floating"
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={suggestion.key}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            // Keep focus in the textarea while picking with a pointer.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => choose(suggestion)}
            onPointerMove={() => index !== active && setHighlight(index)}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 aria-selected:bg-secondary"
          >
            <span className="size-9 shrink-0 overflow-hidden rounded-md bg-secondary">
              {suggestion.thumbnail && (
                <img
                  src={suggestion.thumbnail}
                  alt=""
                  className="size-full object-cover"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {suggestion.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {suggestion.insert}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {suggestion.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shows what each mention will carry into a generation. */
export function MentionSummary({
  mentions,
  className,
}: {
  mentions: readonly ResolvedMention[];
  className?: string;
}) {
  if (!mentions.length) return null;
  return (
    <ul
      aria-label="Mentioned Elements"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {mentions.map((mention) => (
        <li
          key={`${mention.token.start}-${mention.token.raw}`}
          className={cn(
            "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs",
            mention.problem
              ? "border-dashed border-destructive/50"
              : "border-border",
          )}
        >
          <span className="flex -space-x-2">
            {mention.references.slice(0, 3).map((reference) => (
              <span
                key={reference.id}
                className="size-6 overflow-hidden rounded-full bg-secondary ring-2 ring-background"
              >
                {reference.url && (
                  <img
                    src={reference.url}
                    alt=""
                    className="size-full object-cover"
                  />
                )}
              </span>
            ))}
            {!mention.references.length && (
              <span className="size-6 rounded-full bg-secondary" />
            )}
          </span>
          <span className="font-medium">{mention.token.raw}</span>
          <span
            className={
              mention.problem ? "text-destructive" : "text-muted-foreground"
            }
          >
            {mention.problem ??
              `${mention.references.length} ${mention.references.length === 1 ? "reference" : "references"}${mention.moves.length ? ` · ${mention.moves.length === 1 ? "a moving reference" : `${mention.moves.length} moving references`}` : ""}${mention.states.length ? ` · ${mention.states.map((s) => s.name).join(" + ")}` : ""}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
