import { createDemoArchive } from "./archiveFixtures.ts";
import type {
  ArchiveCollection,
  ArchiveData,
  ArchiveItem,
  SocialPost,
} from "./archiveTypes.ts";

export interface ArchiveMigrationResult {
  data: ArchiveData;
  valid: boolean;
  migrated: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function archiveItem(value: unknown): ArchiveItem | null {
  const item = record(value);
  if (!item) return null;
  const stringFields = [
    "id", "articleId", "title", "url", "sourceName", "topic", "summary",
    "author", "savedAt", "note",
  ] as const;
  if (stringFields.some((field) => typeof item[field] !== "string")) return null;
  if (item.publishedAt !== null && typeof item.publishedAt !== "string") return null;
  if (!strings(item.collectionIds) || !strings(item.tags)) return null;
  if (!["unread", "read", "kept"].includes(String(item.state))) return null;
  if (typeof item.starred !== "boolean") return null;
  try {
    const url = new URL(item.url as string);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return item as unknown as ArchiveItem;
}

function collection(value: unknown): { value: ArchiveCollection; migrated: boolean } | null {
  const item = record(value);
  if (!item) return null;
  for (const field of ["id", "name", "description", "createdAt"] as const) {
    if (typeof item[field] !== "string") return null;
  }
  if (!(["private", "unlisted", "public"] as unknown[]).includes(item.visibility)) return null;
  const migrated = item.kind !== "personal" && item.kind !== "community";
  return {
    value: { ...item, kind: item.kind === "community" ? "community" : "personal" } as ArchiveCollection,
    migrated,
  };
}

function socialPost(value: unknown): SocialPost | null {
  const item = record(value);
  if (!item) return null;
  for (const field of ["id", "itemId", "excerpt", "commentary", "createdAt", "author"] as const) {
    if (typeof item[field] !== "string") return null;
  }
  if (item.audience !== "public" && item.audience !== "friends") return null;
  return item as unknown as SocialPost;
}

/** Validate persisted data and migrate the two legacy v1 omissions. */
export function migrateArchiveData(value: unknown): ArchiveMigrationResult {
  const data = record(value);
  if (data?.version !== 1 || !Array.isArray(data.items) || !Array.isArray(data.collections)) {
    return { data: createDemoArchive(), valid: false, migrated: false };
  }

  const items = data.items.map(archiveItem);
  const collections = data.collections.map(collection);
  const postsInput = data.socialPosts === undefined ? [] : data.socialPosts;
  if (
    items.some((item) => !item) ||
    collections.some((item) => !item) ||
    !Array.isArray(postsInput)
  ) {
    return { data: createDemoArchive(), valid: false, migrated: false };
  }
  const socialPosts = postsInput.map(socialPost);
  if (socialPosts.some((post) => !post)) {
    return { data: createDemoArchive(), valid: false, migrated: false };
  }

  const migrated = data.socialPosts === undefined || collections.some((item) => item?.migrated);
  return {
    data: {
      version: 1,
      items: items as ArchiveItem[],
      collections: collections.map((item) => item!.value),
      socialPosts: socialPosts as SocialPost[],
    },
    valid: true,
    migrated,
  };
}
