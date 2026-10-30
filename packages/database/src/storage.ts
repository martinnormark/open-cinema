import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface CheckpointTransaction {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(timestamp: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
export interface CheckpointStorage extends CheckpointTransaction {
  transaction<T>(
    work: (transaction: CheckpointTransaction) => Promise<T>,
  ): Promise<T>;
}

/** Checkpoints and their next wake time commit together in a local SQLite WAL. */
export class CoordinatorStore {
  private db: Database;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS coordinators (owner TEXT PRIMARY KEY, data TEXT NOT NULL, wake_at INTEGER);
      CREATE INDEX IF NOT EXISTS coordinators_due ON coordinators(wake_at);`);
  }
  due(now = Date.now()): string[] {
    return (
      this.db
        .query(
          "SELECT owner FROM coordinators WHERE wake_at <= ? ORDER BY wake_at LIMIT 100",
        )
        .all(now) as { owner: string }[]
    ).map((row) => row.owner);
  }
  forOwner(owner: string): CheckpointStorage {
    const transaction = <T>(
      work: (tx: CheckpointTransaction) => Promise<T>,
    ): Promise<T> => {
      const result = this.tail.then(async () => {
        const row = this.db
          .query("SELECT data, wake_at FROM coordinators WHERE owner=?")
          .get(owner) as { data: string; wake_at: number | null } | null;
        const data: Record<string, unknown> = row ? JSON.parse(row.data) : {};
        let wake = row?.wake_at ?? null;
        let dirty = false;
        const value = await work({
          get: async <V>(key: string) =>
            structuredClone(data[key]) as V | undefined,
          put: async (key, value) => {
            data[key] = structuredClone(value);
            dirty = true;
          },
          getAlarm: async () => wake,
          setAlarm: async (timestamp) => {
            wake = timestamp;
            dirty = true;
          },
          deleteAlarm: async () => {
            wake = null;
            dirty = true;
          },
        });
        if (dirty)
          this.db
            .query(
              "INSERT INTO coordinators (owner,data,wake_at) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET data=excluded.data,wake_at=excluded.wake_at",
            )
            .run(owner, JSON.stringify(data), wake);
        return value;
      });
      this.tail = result.catch(() => {});
      return result;
    };
    return {
      transaction,
      get: (key) => transaction((tx) => tx.get(key)),
      put: (key, value) => transaction((tx) => tx.put(key, value)),
      getAlarm: () => transaction((tx) => tx.getAlarm()),
      setAlarm: (time) => transaction((tx) => tx.setAlarm(time)),
      deleteAlarm: () => transaction((tx) => tx.deleteAlarm()),
    };
  }
  async close() {
    await this.tail;
    this.db.close();
  }
}
