// Tagging people on a frame for Copy the moves: the words decide who becomes
// whom, so the pairing must read the way creators write it.
import { expect, test } from "bun:test";
import type { Element } from "@open-cinema/contracts";
import {
  castFromWords,
  nextPerson,
  withoutPerson,
} from "../src/features/revision/clip-people";

const character = (handle: string, states: string[] = []) =>
  ({
    id: handle.toLowerCase(),
    handle,
    name: handle,
    type: "character",
    states: states.map((name) => ({ id: `${handle}-${name}`, name })),
  }) as unknown as Element;
const cal = character("Cal", ["Wet"]);
const dot = character("GrandmaDot");
const people = [1, 2, 3].map((person) => ({ person }));
const pairs = (text: string) =>
  castFromWords(text, people, [cal, dot]).map(
    (p) =>
      `${p.person}:${p.element.handle}${p.state ? `:${p.state.name}` : ""}`,
  );

test("pairs each tag with the Character named next to it", () => {
  expect(
    pairs("Replace @person1 with @Cal. Replace @person2 with @GrandmaDot"),
  ).toEqual(["1:Cal", "2:GrandmaDot"]);
});

test("reads either order and keeps states", () => {
  expect(pairs("@Cal:wet takes over from @person3")).toEqual(["3:Cal:Wet"]);
});

test("ignores untagged people, unknown handles and a dangling @", () => {
  expect(pairs("Replace @person4 with @Cal, @person2 with @Nobody")).toEqual(
    [],
  );
  expect(pairs("Replace @person1 with @")).toEqual([]);
});

test("a person keeps their first pairing", () => {
  expect(
    pairs("Swap @person1 for @Cal, then @person1 for @GrandmaDot"),
  ).toEqual(["1:Cal"]);
});

test("gives the lowest free tag, up to four", () => {
  expect(nextPerson([{ person: 1 }, { person: 3 }] as never)).toBe(2);
  expect(
    nextPerson([1, 2, 3, 4].map((person) => ({ person })) as never),
  ).toBeNull();
});

test("removing a person drops their clause from the words", () => {
  expect(
    withoutPerson(
      "Replace @person1 with @Cal. Replace @person2 with @GrandmaDot. Keep the lights.",
      2,
    ),
  ).toBe("Replace @person1 with @Cal. Keep the lights.");
});
