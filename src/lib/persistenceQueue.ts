export type PersistenceState = {
  status: "idle" | "saving" | "saved" | "error";
  message?: string;
};

export class PersistenceQueue<T> {
  private latest: T | null = null;
  private version = 0;
  private pending: { value: T; version: number } | null = null;
  private running = false;
  private scheduled = false;
  private readonly waiters = new Map<number, (saved: boolean) => void>();
  private readonly save: (value: T) => Promise<void>;
  private readonly publish: (state: PersistenceState) => void;
  private readonly errorMessage: string;

  constructor(
    save: (value: T) => Promise<void>,
    publish: (state: PersistenceState) => void,
    errorMessage: string
  ) {
    this.save = save;
    this.publish = publish;
    this.errorMessage = errorMessage;
  }

  enqueue(value: T): Promise<boolean> {
    this.latest = value;
    const version = ++this.version;
    this.pending = { value, version };
    this.publish({ status: "saving" });
    const result = new Promise<boolean>((resolve) => this.waiters.set(version, resolve));
    if (!this.scheduled && !this.running) {
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        void this.drain();
      });
    }
    return result;
  }

  private async drain(): Promise<void> {
    if (this.running || !this.pending) return;
    this.running = true;
    const next = this.pending;
    this.pending = null;
    let saved = true;
    try {
      await this.save(next.value);
      if (next.version === this.version) this.publish({ status: "saved" });
    } catch {
      saved = false;
      if (next.version === this.version) {
        this.publish({ status: "error", message: this.errorMessage });
      }
    } finally {
      for (const [version, resolve] of this.waiters) {
        if (version <= next.version) {
          this.waiters.delete(version);
          resolve(saved);
        }
      }
      this.running = false;
      if (this.pending) void this.drain();
    }
  }

  retry(): Promise<boolean> {
    return this.latest === null ? Promise.resolve(false) : this.enqueue(this.latest);
  }
}
