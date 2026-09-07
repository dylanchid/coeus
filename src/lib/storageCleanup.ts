type StorageEntry = { name: string; id: string | null };

/** The small storage surface account deletion needs, kept testable without Supabase. */
export interface StorageObjectBucket {
  list(path?: string, options?: { limit?: number; offset?: number }): Promise<{ data: StorageEntry[] | null; error: Error | null }>;
  remove(paths: string[]): Promise<{ error: Error | null }>;
}

const STORAGE_PAGE_SIZE = 100;
const STORAGE_REMOVE_BATCH_SIZE = 100;

/**
 * Delete every object beneath one known prefix. Storage listing is directory
 * based, so folders are traversed rather than trusting database metadata; this
 * also removes replaced and orphaned uploads. Nothing outside `prefix` is ever
 * constructed or passed to remove().
 */
export async function removeStoragePrefix(bucket: StorageObjectBucket, prefix: string): Promise<void> {
  const directories = [prefix];
  const objects: string[] = [];

  while (directories.length) {
    const directory = directories.pop()!;
    for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
      const { data, error } = await bucket.list(directory, { limit: STORAGE_PAGE_SIZE, offset });
      if (error) throw error;
      for (const entry of data ?? []) {
        // Storage's list API returns immediate child names. Reject malformed
        // responses so an unexpected name can never escape the caller prefix.
        if (!entry.name || entry.name.includes("/") || entry.name === "." || entry.name === "..") {
          throw new Error("Storage returned an invalid object name during account deletion");
        }
        const path = `${directory}/${entry.name}`;
        if (entry.id === null) directories.push(path);
        else objects.push(path);
      }
      if ((data?.length ?? 0) < STORAGE_PAGE_SIZE) break;
    }
  }

  for (let start = 0; start < objects.length; start += STORAGE_REMOVE_BATCH_SIZE) {
    const { error } = await bucket.remove(objects.slice(start, start + STORAGE_REMOVE_BATCH_SIZE));
    if (error) throw error;
  }
}
