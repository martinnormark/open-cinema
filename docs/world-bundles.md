# World bundles

A world bundle moves a creator's reusable work between projects and between
Open Cinema installations: Elements with their states and reference sheets,
recipes, a project's look, and sequences with their approved takes. It is a
plain ZIP, so it can be inspected, backed up or re-zipped by hand.

Creators use it from **Move your world** (`/world`), from **Save as world** on a
project, or from Settings.

## Format

```
my-project.world.zip
├── world.json        the manifest, read first
└── media/…           every image and video the manifest points at
```

`world.json` is described by `worldManifestSchema` in
`packages/contracts/src/world.ts`:

- `format: "open-cinema.world"` and `version` (currently 1). A newer bundle is
  refused with a message rather than half-imported; teach `readWorldManifest`
  an older shape when the version is bumped.
- `studio`: the workflows, models and capabilities of the studio that saved
  it, so an import can explain differences.
- `project`: name, legacy direction text and structured look, or `null` for a
  whole-studio save.
- `elements`, `recipes`, `sequences`: records connected by `key`s (the source's
  ids, used only inside the bundle).
- `media`: one entry per file with its type, size, dimensions and provenance:
  the upload's filename, or the workflow kind, model and prompt that made it.

What a save includes:

- **A project:** its look, its own Elements, studio-wide Elements its shots
  mention, all recipes, and its sequences with approved takes.
- **Everything:** all Elements, recipes and sequences.
- Rejected references and unapproved takes stay behind. A stored file that is
  missing is left out together with the records that pointed at it
  (`pruneWorldMedia`), so the archive is always whole.

## Export

`GET /api/world/export[?project=<id>]` (`apps/web/src/routes/api.world.export.ts`)
reads the caller's records with `collectWorld`, checks each file exists, then
streams a stored ZIP (`apps/web/src/lib/zip.ts`): `world.json` first, then each
file straight from R2 with a data descriptor after it. Nothing is buffered,
so a large clip costs no Worker memory. Archives stay under 4 GB (no ZIP64).

## Import

1. The browser opens the chosen file with `readZip`, which reads only the
   central directory and hands stored entries on as slices of the file. It
   also reads deflated entries, so an archive re-zipped by an operating system
   still opens. Every entry's CRC is checked.
2. `readWorldManifest` validates `world.json` and that every referenced file is
   listed and present; the creator sees what the world holds before anything
   is written.
3. Media uploads one file at a time through the ordinary `/api/media/upload`
   route, so it gets the same type, size and ownership checks as any upload.
4. `importMyWorld` (`apps/web/src/server/world.ts`) reads the manifest again on
   the server and calls `importWorld`
   (`packages/database/src/mutations/world.ts`), which only accepts uploads the
   caller owns and creates everything as new records:
   - a project with the bundle's look, when there is one;
   - Elements, renamed with a number when a handle is taken here. Shot prompts,
     beats and the idea are rewritten to the new handles;
   - recipes, after `adaptRecipeSpec` drops capabilities this studio does not
     offer. A spec this studio cannot read is skipped;
   - sequences with their takes, approved as they were.
5. The result lists renamed handles and adaptations in plain words: results
   made with a workflow this studio does not run (the media and prompt still
   arrive), recipes imported without a capability, and recipes not imported.

## Changing the format

- Additive fields with defaults keep `version` 1; older bundles still parse.
- Renames or meaning changes bump `WORLD_VERSION` and add a branch in
  `readWorldManifest` that upgrades the older shape.
- `apps/jobs/test/world.test.ts` round-trips a project between two owners and
  covers renames, adaptations and refusals; extend it with the change.
