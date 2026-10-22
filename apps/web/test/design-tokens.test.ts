// Design tokens: DESIGN.md and styles.css must agree, and components must use
// tokens rather than hard-coded colours, shadows or type sizes.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const src = join(root, "src");
const styles = readFileSync(join(src, "styles.css"), "utf8");
const design = readFileSync(join(root, "../../DESIGN.md"), "utf8");

/** Lines may opt out with this marker and a reason, e.g. canvas mask pixels. */
const EXEMPT = "design-token-exempt:";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(tsx?|css)$/.test(entry.name) && entry.name !== "routeTree.gen.ts"
      ? [path]
      : [];
  });
}

/** The `colors:` block of DESIGN.md's frontmatter, as name → value. */
function designColors() {
  const front = design.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const block = front.match(/^colors:\n((?: {2}.+\n?)+)/m)?.[1] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/^ {2}([\w-]+): "([^"]+)"/gm)].map((m) => [m[1], m[2]]),
  );
}

test("every colour in DESIGN.md is the value styles.css defines", () => {
  const colors = designColors();
  expect(Object.keys(colors).length).toBeGreaterThan(10);
  const drift = Object.entries(colors).flatMap(([name, value]) => {
    // `{colors.brand-bone}` in DESIGN.md is `var(--brand-bone)` in CSS.
    const expected = value.replace(/^\{colors\.([\w-]+)\}$/, "var(--$1)");
    const defined = styles.match(new RegExp(`--${name}: ([^;]+);`))?.[1];
    return defined === expected
      ? []
      : [`${name}: DESIGN.md ${value}, styles.css ${defined}`];
  });
  expect(drift).toEqual([]);
});

test("the brand primitives match the showcase film", () => {
  expect(designColors()).toMatchObject({
    "brand-tungsten": "#f2a945",
    "brand-ink": "#2a1c08",
    "brand-bone": "#f1ece2",
    "brand-graphite": "#151311",
  });
});

const rules: [string, RegExp, string?][] = [
  [
    "colour literal",
    /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i,
  ],
  ["named colour", /:\s*(?:black|white)\b/, ".css"],
  [
    "Tailwind palette colour",
    /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|caret|accent|divide)-(?:black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/,
  ],
  ["arbitrary type size", /\btext-\[(?:\d|clamp)/],
  ["arbitrary tracking", /\btracking-\[/],
  ["arbitrary shadow colour", /\bshadow-\[[^\]]*(?:rgb|hsl|oklch|#)/],
];

test("components use tokens, not hard-coded colours or type sizes", () => {
  const found = files(src)
    .filter((path) => !path.endsWith("styles.css"))
    .flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, i, lines) => {
          if (line.includes(EXEMPT) || lines[i - 1]?.includes(EXEMPT))
            return [];
          return rules
            .filter(
              ([, pattern, only]) =>
                (!only || path.endsWith(only)) && pattern.test(line),
            )
            .map(([name]) => `${relative(root, path)}:${i + 1} ${name}`);
        }),
    );
  expect(found).toEqual([]);
});
