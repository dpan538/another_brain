export const R28SHIP0_Q4_WORKER_LIFECYCLE_VERSION = "r28ship0-q4-worker-lifecycle-v1";

export class Q4WorkerLifecycle {
  constructor(options = {}) {
    this.workerFactory = options.workerFactory || (() => null);
    this.maxRestarts = Math.max(0, Number(options.maxRestarts ?? 1));
    this.worker = null;
    this.started = 0;
    this.restarts = 0;
    this.terminated = 0;
  }

  start() {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.started += 1;
    }
    return this.worker;
  }

  terminate() {
    if (this.worker && typeof this.worker.terminate === "function") {
      this.worker.terminate();
    }
    if (this.worker) this.terminated += 1;
    this.worker = null;
  }

  restartOnce() {
    if (this.restarts >= this.maxRestarts) {
      return { restarted: false, blocker: "worker_restart_already_used", restarts: this.restarts };
    }
    this.terminate();
    this.restarts += 1;
    this.start();
    return { restarted: true, blocker: "", restarts: this.restarts };
  }

  snapshot() {
    return {
      started: this.started,
      restarts: this.restarts,
      terminated: this.terminated,
      has_worker: Boolean(this.worker),
      version: R28SHIP0_Q4_WORKER_LIFECYCLE_VERSION
    };
  }
}
