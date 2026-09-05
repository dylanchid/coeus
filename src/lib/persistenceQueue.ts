export type PersistenceState = {
  status: "idle" | "saving" | "saved" | "error";
  message?: string;
};

export class PersistenceQueue<T> {
  private tail: Promise<void> = Promise.resolve();
  private latest: T | null = null;
  private version = 0;
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
    this.publish({ status: "saving" });
    const operation = this.tail.then(() => this.save(value));
    this.tail = operation.catch(() => undefined);
    return operation.then(() => {
      if (version === this.version) this.publish({ status: "saved" });
      return true;
    }).catch(() => {
      if (version === this.version) {
        this.publish({ status: "error", message: this.errorMessage });
      }
      return false;
    });
  }

  retry(): Promise<boolean> {
    return this.latest === null ? Promise.resolve(false) : this.enqueue(this.latest);
  }
}
