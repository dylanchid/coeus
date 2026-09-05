import type { ArchiveCollection } from "./archiveTypes.ts";

export type ShareDestination = "social" | "friend" | "personal" | "public" | "community";

export function isCollectionDestination(destination: ShareDestination): boolean {
  return destination === "personal" || destination === "public" || destination === "community";
}

export function collectionsForDestination(
  collections: ArchiveCollection[],
  destination: ShareDestination
): ArchiveCollection[] {
  if (destination === "community") {
    return collections.filter((collection) => collection.kind === "community");
  }
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
