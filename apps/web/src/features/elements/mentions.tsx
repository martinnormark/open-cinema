import {
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { useJobViews } from "./generate";
import {
  elementTypes,
  referenceImageUrl,
  type CreativeElement,
  type ElementReference,
  type ElementState,
} from "./model";
import { useElements } from "./store";

/** `@Handle` or `@Handle:state` where the `@` starts a word. */
const MENTION = /(^|[^\p{L}\p{N}_@])@([\p{L}\p{N}_-]+)(?::([\p{L}\p{N}-]+))?/gu;

export interface MentionToken {
  /** Offset of the `@`. */
  start: number;
  end: number;
  raw: string;
  handle: string;
  stateHandle: string | null;
}

export function parseMentions(text: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  for (const match of text.matchAll(MENTION)) {
    const start = match.index + match[1]!.length;
    const raw = match[0].slice(match[1]!.length);
    tokens.push({
      start,
      end: start + raw.length,
      raw,
      handle: match[2]!,
      stateHandle: match[3] ?? null,
    });
  }
  return tokens;
}

export interface MentionReference {
  id: string;
  view: string | null;
  /** null while a generated reference's stored image is unavailable. */
  url: string | null;
  fromState: boolean;
}

export interface ResolvedMention {
  token: MentionToken;
  element: CreativeElement | null;
  state: ElementState | null;
  /** Approved state references first, then approved identity references. */
  references: MentionReference[];
  problem: string | null;
}

function approved(
  references: ElementReference[],
  stateId: string | null,
  outputs: ReadonlyMap<string, string>,
): MentionReference[] {
  return references
    .filter((r) => r.status === "approved" && r.stateId === stateId)
    .map((r) => ({
      id: r.id,
      view: r.view,
      url: referenceImageUrl(r, outputs),
      fromState: stateId !== null,
    }));
}

/** Pure resolver: turns mentions in `text` into Elements, states and approved references. */
export function resolveMentions(
  text: string,
  elements: readonly CreativeElement[],
  outputs: ReadonlyMap<string, string> = new Map(),
): ResolvedMention[] {
  const byHandle = new Map(elements.map((e) => [e.handle.toLowerCase(), e]));
  return parseMentions(text).map((token) => {
    const element = byHandle.get(token.handle.toLowerCase()) ?? null;
    if (!element)
      return {
        token,
        element,
        state: null,
        references: [],
        problem: `No Element is named @${token.handle}.`,
      };
    const state = token.stateHandle
      ? (element.states.find(
          (s) => s.handle === token.stateHandle!.toLowerCase(),
        ) ?? null)
      : null;
    const identity = approved(element.references, null, outputs);
    const references = [
      ...(state ? approved(element.references, state.id, outputs) : []),
      ...identity,
    ];
    const problem =
      token.stateHandle && !state
        ? `@${element.handle} has no state named “${token.stateHandle}”.`
        : identity.length === 0
          ? `@${element.handle} has no approved references yet.`
          : null;
    return { token, element, state, references, problem };
  });
}

/** Live resolution against the creator's Elements and stored generation outputs. */
export function useMentions(text: string): ResolvedMention[] {
  const { elements } = useElements();
  const { outputs } = useJobViews();
  return useMemo(
    () => resolveMentions(text, elements, outputs),
    [text, elements, outputs],
  );
}

interface Query {
  /** Offset of the `@`. */
  start: number;
  end: number;
  handle: string;
  /** Present once the creator typed `:` after a known handle. */
  stateQuery: string | null;
}
const ACTIVE = /(^|[^\p{L}\p{N}_@])@([\p{L}\p{N}_-]*)(?::([\p{L}\p{N}-]*))?$/u;
function activeQuery(text: string, caret: number): Query | null {
  const match = ACTIVE.exec(text.slice(0, caret));
  if (!match) return null;
  const start = match.index + match[1]!.length;
  const rest = /^[\p{L}\p{N}_:-]*/u.exec(text.slice(caret))![0];
  return {
    start,
    end: caret + rest.length,
    handle: match[2]!,
    stateQuery: match[3] ?? null,
  };
}

interface Suggestion {
  key: string;
  insert: string;
  element: CreativeElement;
  state: ElementState | null;
  thumbnail: string | null;
}
function suggestionsFor(
  query: Query,
  elements: readonly CreativeElement[],
  outputs: ReadonlyMap<string, string>,
): Suggestion[] {
  const thumbnail = (element: CreativeElement, stateId: string | null) => {
    const reference =
      element.references.find(
        (r) => r.status === "approved" && r.stateId === stateId,
      ) ??
      element.references.find((r) => r.status === "approved" && !r.stateId);
    return reference ? referenceImageUrl(reference, outputs) : null;
  };
  if (query.stateQuery !== null) {
    const element = elements.find(
      (e) => e.handle.toLowerCase() === query.handle.toLowerCase(),
    );
    if (!element) return [];
    const q = query.stateQuery.toLowerCase();
    return element.states
      .filter((s) => s.handle.includes(q) || s.name.toLowerCase().includes(q))
      .map((state) => ({
        key: state.id,
        insert: `@${element.handle}:${state.handle}`,
        element,
        state,
        thumbnail: thumbnail(element, state.id),
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
  ...props
}: TextareaProps & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { elements } = useElements();
  const { outputs } = useJobViews();
  const listId = useId();
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(0);
  const query = caret === null ? null : activeQuery(value, caret);
  const suggestions = useMemo(
    () => (query ? suggestionsFor(query, elements, outputs) : []),
    [query?.start, query?.handle, query?.stateQuery, elements, outputs],
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
    const trailing =
      !suggestion.state && suggestion.element.states.length
        ? ""
        : after.startsWith(" ")
          ? ""
          : " ";
    const next =
      value.slice(0, query.start) + suggestion.insert + trailing + after;
    const position = query.start + suggestion.insert.length + trailing.length;
    onValueChange(next);
    setHighlight(0);
    setCaret(position);
    setDismissedAt(
      !suggestion.state && suggestion.element.states.length
        ? null
        : query.start,
    );
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
        ref={textarea}
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
        onBlur={() => setCaret(null)}
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
        className="mention-list absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.18)]"
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
                {suggestion.state
                  ? `${suggestion.element.name} · ${suggestion.state.name}`
                  : suggestion.element.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {suggestion.insert}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {suggestion.state
                ? "State"
                : elementTypes[suggestion.element.type].label}
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
              `${mention.references.length} ${mention.references.length === 1 ? "reference" : "references"}${mention.state ? ` · ${mention.state.name}` : ""}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
