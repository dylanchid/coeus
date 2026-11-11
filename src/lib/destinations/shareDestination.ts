import type { ArchiveCollection } from "../archive/archiveTypes.ts";

export type ShareDestination = "friend" | "personal" | "public";

export function isCollectionDestination(destination: ShareDestination): boolean {
  return destination === "personal" || destination === "public";
}

export function collectionsForDestination(
  collections: ArchiveCollection[],
  destination: ShareDestination
): ArchiveCollection[] {
  if (destination === "public") {
    return collections.filter(
      (collection) => collection.kind === "personal" && collection.visibility === "public"
    );
  }
  if (destination === "personal") {
    return collections.filter(
      (collection) => collection.kind === "personal" && collection.visibility !== "public"
    );
  }
  return [];
}

export function resolveCollectionId(
  collections: ArchiveCollection[],
  requestedId: string
): string | null {
  if (requestedId && collections.some((collection) => collection.id === requestedId)) {
    return requestedId;
  }
  return collections[0]?.id ?? null;
}

export function isShareCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
