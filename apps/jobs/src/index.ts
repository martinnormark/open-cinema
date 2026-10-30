import { resolve } from "node:path";
import { env, dataDirectory, type RuntimeEnv } from "@open-cinema/runtime";
import { CoordinatorStore } from "@open-cinema/database/storage";
import { GenerationCoordinator } from "./generation-coordinator";

/** One process owns a data volume. Wakes are persisted, timers are only a trigger. */
export class JobService {
  readonly store: CoordinatorStore;
  private coordinators = new Map<string, GenerationCoordinator>();
  private running = new Map<string, Promise<void>>();
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    directory: string,
    private config: RuntimeEnv,
  ) {
    this.store = new CoordinatorStore(resolve(directory, "jobs.sqlite"));
  }
  get(owner: string) {
    let coordinator = this.coordinators.get(owner);
    if (!coordinator) {
      coordinator = new GenerationCoordinator(
        this.store.forOwner(owner),
        this.config,
      );
      this.coordinators.set(owner, coordinator);
    }
    return coordinator;
  }
  /** Also used by administrative recovery: concurrent wakes join the same work. */
  wake(owner: string): Promise<void> {
    const existing = this.running.get(owner);
    if (existing) return existing;
    const work = this.get(owner)
      .alarm()
      .finally(() => this.running.delete(owner));
    this.running.set(owner, work);
    return work;
  }
  start() {
    if (this.timer) return;
    const tick = () => {
      for (const owner of this.store.due()) {
        if (this.running.has(owner)) continue;
        void this.wake(owner).catch(() =>
          console.error(JSON.stringify({ event: "job_wake_failed" })),
        );
      }
    };
    this.timer = setInterval(tick, 100);
    this.timer.unref();
    tick();
  }
  disconnect() {
    for (const coordinator of this.coordinators.values()) coordinator.close();
  }
  async close() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.disconnect();
    await Promise.allSettled(this.running.values());
    this.coordinators.clear();
    await this.store.close();
  }
}
let service: JobService | undefined;
export function jobService() {
  return (service ??= new JobService(dataDirectory, env));
}
export function getCoordinator(ownerId: string) {
  return jobService().get(ownerId);
}
