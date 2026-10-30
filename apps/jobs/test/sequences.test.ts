import { applyMigrations, env, reset } from "./runtime";
import { beforeEach, expect, it } from "bun:test";
import {
  approvedTake,
  composeShotPrompt,
  splitIdeaIntoBeats,
} from "@open-cinema/contracts";
import { readPlan } from "@open-cinema/comfy";
import { createDatabase } from "@open-cinema/database";
import {
  addShot,
  addTake,
  createPendingMediaAsset,
  createSequence,
  deleteShot,
  markMediaAssetReady,
  moveShot,
  setTakeStatus,
  updateShot,
} from "@open-cinema/database/mutations";
import { getSequence, listSequences } from "@open-cinema/database/queries";

beforeEach(async () => {
  await reset();
  await applyMigrations(env.DB, env.TEST_MIGRATIONS);
});

async function readyImage(
  db: ReturnType<typeof createDatabase>,
  owner: { ownerId: string },
) {
  const id = crypto.randomUUID();
  await createPendingMediaAsset(db, owner, {
    id,
    r2Key: `uploads/${owner.ownerId}/${id}`,
    filename: "frame.png",
    mediaType: "image/png",
    sizeBytes: 1024,
  });
  await markMediaAssetReady(db, owner, id, { sizeBytes: 1024, etag: "e" });
  return { type: "media-asset" as const, assetId: id };
}

it("plans, orders and edits shots in an owner-scoped sequence", async () => {
  const db = createDatabase(env.DB);
  const owner = { ownerId: crypto.randomUUID() };
  const stranger = { ownerId: crypto.randomUUID() };
  const sequence = await createSequence(db, owner, {
    title: "Arrival",
    idea: "Mara arrives. She reads.",
    shots: [
      { title: "Arrival", framing: "wide" },
      { title: "Reading", prompt: "@Mara reads", camera: "push-in" },
    ],
  });
  expect(sequence.shots.map((s) => s.title)).toEqual(["Arrival", "Reading"]);
  expect(sequence.shots[1]).toMatchObject({
    framing: "medium",
    durationSeconds: 5,
    continuity: "fresh",
  });
  expect(await getSequence(db, stranger, sequence.id)).toBeNull();

  // Insert between, then move: order follows sortOrder, not creation.
  const inserted = await addShot(db, owner, {
    sequenceId: sequence.id,
    afterShotId: sequence.shots[0]!.id,
    title: "Door",
  });
  expect(inserted!.shots.map((s) => s.title)).toEqual([
    "Arrival",
    "Door",
    "Reading",
  ]);
  const moved = await moveShot(db, owner, {
    id: inserted!.shots[1]!.id,
    direction: "later",
  });
  expect(moved!.shots.map((s) => s.title)).toEqual([
    "Arrival",
    "Reading",
    "Door",
  ]);

  // A partial update leaves the other fields alone.
  const reading = moved!.shots[1]!;
  const updated = await updateShot(db, owner, {
    id: reading.id,
    framing: "close",
  });
  expect(updated!.shots[1]).toMatchObject({
    framing: "close",
    camera: "push-in",
    prompt: "@Mara reads",
  });
  expect(
    await updateShot(db, stranger, { id: reading.id, title: "x" }),
  ).toBeNull();

  const afterDelete = await deleteShot(db, owner, moved!.shots[2]!.id);
  expect(afterDelete!.shots).toHaveLength(2);
  const [summary] = await listSequences(db, owner);
  expect(summary).toMatchObject({
    shotCount: 2,
    approvedCount: 0,
    poster: null,
  });
});

it("keeps at most one approved take per role and only approves finished takes", async () => {
  const db = createDatabase(env.DB);
  const owner = { ownerId: crypto.randomUUID() };
  const stranger = { ownerId: crypto.randomUUID() };
  const sequence = await createSequence(db, owner, {
    title: "Takes",
    shots: [{ title: "One" }],
  });
  const shotId = sequence.shots[0]!.id;
  const pending = await addTake(db, owner, {
    shotId,
    role: "keyframe",
    origin: "generated",
    jobId: "job-1",
    prompt: "a frame",
  });
  const take = pending!.shots[0]!.takes[0]!;
  expect(take).toMatchObject({ status: "candidate", asset: null });
  await expect(
    setTakeStatus(db, owner, { id: take.id, status: "approved" }),
  ).rejects.toThrow(/finish/);

  const first = await readyImage(db, owner);
  const second = await readyImage(db, owner);
  await setTakeStatus(db, owner, {
    id: take.id,
    status: "approved",
    asset: first,
  });
  const replaced = await addTake(db, owner, {
    shotId,
    role: "keyframe",
    origin: "continued",
    asset: second,
    approve: true,
  });
  const shot = replaced!.shots[0]!;
  expect(approvedTake(shot, "keyframe")?.asset).toEqual(second);
  expect(shot.takes.filter((t) => t.status === "approved")).toHaveLength(1);

  // Someone else's media cannot become a take, and their takes are not reachable.
  const foreign = await readyImage(db, stranger);
  await expect(
    addTake(db, owner, {
      shotId,
      role: "keyframe",
      origin: "library",
      asset: foreign,
    }),
  ).rejects.toThrow(/not available/);
  expect(
    await setTakeStatus(db, stranger, { id: take.id, status: "rejected" }),
  ).toBeNull();
  const [summary] = await listSequences(db, owner);
  expect(summary!.poster).toEqual(second);
});

it("composes shot direction and plans from a model answer or the beat splitter", () => {
  expect(
    composeShotPrompt(
      {
        prompt: "@Mara reads by the window.",
        beat: "",
        staging:
          "She sits on the left, we look past her shoulder, low sun behind her.",
        framing: "close",
        camera: "push-in",
      },
      { role: "motion" },
    ),
  ).toBe(
    "@Mara reads by the window. She sits on the left, we look past her shoulder, low sun behind her. close-up on the face, shallow depth of field. slow push-in toward the subject.",
  );
  expect(
    composeShotPrompt(
      { prompt: "", beat: "She waits", framing: "wide", camera: "orbit" },
      { role: "keyframe" },
    ),
  ).toBe(
    "She waits. wide establishing shot, subjects small in a readable space.",
  );

  const beats = splitIdeaIntoBeats(
    "Mara arrives at dusk. She finds a letter! Theo watches?",
  );
  expect(beats.planner).toBe("beats");
  expect(beats.shots.map((s) => s.beat)).toEqual([
    "Mara arrives at dusk.",
    "She finds a letter!",
    "Theo watches?",
  ]);

  const plan = readPlan(
    {
      content: [
        { type: "text", text: "Here you go" },
        {
          type: "tool_use",
          name: "propose_shots",
          input: {
            title: "Arrival",
            shots: [
              {
                title: "Door",
                beat: "@Mara and @Ghost arrive",
                prompt: "@Mara:wet at the door with @Ghost:sad",
                framing: "sideways",
                camera: "push-in",
                durationSeconds: 7,
              },
            ],
          },
        },
      ],
    },
    { elements: [{ handle: "Mara" }], maxShots: 6 },
  );
  expect(plan).toMatchObject({
    planner: "model",
    shots: [
      {
        prompt: "@Mara:wet at the door with Ghost",
        beat: "@Mara and Ghost arrive",
        framing: "medium",
        camera: "push-in",
        durationSeconds: 5,
      },
    ],
  });
  expect(
    readPlan(
      { content: [{ type: "text", text: "no" }] },
      { elements: [], maxShots: 6 },
    ),
  ).toBeNull();
});
