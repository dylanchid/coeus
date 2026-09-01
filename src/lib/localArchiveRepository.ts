import { createDemoArchive } from "./archiveFixtures.ts";
import { migrateArchiveData } from "./archiveValidation.ts";
import type { ArchiveData, ArchiveRepository } from "./archiveTypes";

const STORAGE_KEY = "bareaga.archive.v1";

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalStorageArchiveRepository implements ArchiveRepository {
  private readonly storage?: KeyValueStorage;

  constructor(storage?: KeyValueStorage) {
    this.storage = storage;
  }

  async load(): Promise<ArchiveData> {
    const storage = this.storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    if (!storage) return createDemoArchive();
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createDemoArchive();
      storage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    try {
      const result = migrateArchiveData(JSON.parse(raw));
      if (result.valid && result.migrated) {
        storage.setItem(STORAGE_KEY, JSON.stringify(result.data));
      }
      return result.data;
    } catch {
      return createDemoArchive();
    }
  }

  async save(data: ArchiveData): Promise<void> {
    const validated = migrateArchiveData(data);
    if (!validated.valid) throw new Error("Refusing to persist invalid archive data");
    const storage = this.storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(validated.data));
  }

  subscribe(listener: (data: ArchiveData) => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const refresh = () => void this.load().then(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }
}
