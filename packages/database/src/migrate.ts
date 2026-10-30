import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
export function migrateDatabase(
  filename: string,
  names = readdirSync(migrationsDirectory)
    .filter((n) => n.endsWith(".sql"))
    .sort(),
) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  try {
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=OFF;",
    );
    db.exec(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    );
    for (const name of names) {
      if (db.query("SELECT 1 FROM _migrations WHERE name=?").get(name))
        continue;
      db.transaction(() => {
        db.exec(readFileSync(resolve(migrationsDirectory, name), "utf8"));
        if (db.query("PRAGMA foreign_key_check").all().length)
          throw new Error(`Foreign key violation in ${name}`);
        db.query("INSERT INTO _migrations (name) VALUES (?)").run(name);
      })();
    }
  } finally {
    db.close();
  }
}
if (import.meta.main) {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  migrateDatabase(
    resolve(process.env.DATA_DIR ?? resolve(root, ".data"), "catalog.sqlite"),
  );
}
