import { Database } from "bun:sqlite";
import { expect, it } from "bun:test";
import { createDatabase } from "@open-cinema/database";
import { getElement, getSequence } from "@open-cinema/database/queries";
import { applyMigrations, env, reset, sql } from "./runtime";

const KEPT = [
  "GenerationJob",
  "Element",
  "ElementState",
  "ElementReference",
  "MediaAsset",
  "Revision",
  "Sequence",
  "Shot",
  "ShotTake",
];

function counts() {
  const db = new Database(env.DB, { readonly: true });
  try {
    return Object.fromEntries(
      KEPT.map((table) => [
        table,
        (
          db.query(`SELECT count(*) AS n FROM "${table}"`).get() as {
            n: number;
          }
        ).n,
      ]),
    );
  } finally {
    db.close();
  }
}

// Element and Sequence are rebuilt to lose projectId; their states,
// references, shots and takes cascade from them and must survive it.
it("drops projects without losing anything that was filed under one", async () => {
  await reset();
  await applyMigrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((name) => name < "0011"),
  );
  sql(`INSERT INTO User (id) VALUES ('owner');
    INSERT INTO Project (id,ownerId,name,updatedAt,look) VALUES ('p','owner','Lighthouse',CURRENT_TIMESTAMP,'{"palette":"teal-orange"}');
    INSERT INTO GenerationJob (id,ownerId,state,version,idempotencyKey,requestHash,workflowSnapshot,inputsSnapshot,projectId,updatedAt) VALUES ('job','owner','succeeded',2,'key','hash','{}','{}','p',CURRENT_TIMESTAMP);
    INSERT INTO Element (id,ownerId,projectId,type,name,handle,updatedAt) VALUES ('el','owner','p','character','Cal','cal',CURRENT_TIMESTAMP);
    INSERT INTO ElementState (id,elementId,name,updatedAt) VALUES ('st','el','Soaked',CURRENT_TIMESTAMP);
    INSERT INTO ElementReference (id,elementId,stateId,assetType,mediaAssetId,status,roles,updatedAt) VALUES ('ref','el','st','media-asset','media','approved','["identity"]',CURRENT_TIMESTAMP);
    INSERT INTO MediaAsset (id,ownerId,projectId,kind,status,mediaType,filename,r2Key,updatedAt) VALUES ('media','owner','p','image','ready','image/png','cal.png','owner/media.png',CURRENT_TIMESTAMP);
    INSERT INTO Revision (id,ownerId,projectId,sourceType,sourceAssetId,workflowKind,intent,status,updatedAt) VALUES ('rev','owner','p','media-asset','media','video.background-replace','By the sea','pending',CURRENT_TIMESTAMP);
    INSERT INTO Sequence (id,ownerId,projectId,title,updatedAt) VALUES ('seq','owner','p','Storm',CURRENT_TIMESTAMP);
    INSERT INTO Shot (id,sequenceId,sortOrder,title,framing,camera,durationSeconds,updatedAt) VALUES ('shot','seq',0,'Arrival','wide','static',5,CURRENT_TIMESTAMP);
    INSERT INTO ShotTake (id,shotId,role,origin,status,updatedAt) VALUES ('take','shot','keyframe','generated','candidate',CURRENT_TIMESTAMP);`);
  const before = counts();

  await applyMigrations(env.DB, env.TEST_MIGRATIONS);

  expect(counts()).toEqual(before);
  const db = createDatabase(env.DB);
  const scope = { ownerId: "owner" };
  const element = await getElement(db, scope, "el");
  expect(element?.states.map((s) => s.id)).toEqual(["st"]);
  expect(element?.references.map((r) => r.id)).toEqual(["ref"]);
  const sequence = await getSequence(db, scope, "seq");
  expect(sequence?.shots[0]?.takes.map((t) => t.id)).toEqual(["take"]);
  const raw = new Database(env.DB, { readonly: true });
  try {
    expect(
      raw
        .query(
          "SELECT name FROM sqlite_master WHERE sql LIKE '%project%' COLLATE NOCASE",
        )
        .all(),
    ).toEqual([]);
  } finally {
    raw.close();
  }
});
