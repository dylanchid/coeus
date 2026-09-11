import type { Visibility } from "../visibility.ts";

export type { Visibility } from "../visibility.ts";

export type ArchiveState = "unread" | "read" | "kept";
/**
 * Collection visibility in the synced archive snapshot — the same four-value
 * model as object visibility server-side (src/lib/visibility.ts). "followers"
 * was added in Phase 2; older snapshots only ever carry the other three.
 */
export type CollectionVisibility = Visibility;
export type CollectionKind = "personal" | "community";

export interface ArchiveItem {
  id: string;
  articleId: string;
  title: string;
  url: string;
  sourceName: string;
  topic: string;
  summary: string;
  author: string;
  publishedAt: string | null;
  savedAt: string;
  state: ArchiveState;
  starred: boolean;
  collectionIds: string[];
  tags: string[];
  note: string;
}

export interface ArchiveCollection {
  id: string;
  name: string;
  description: string;
  visibility: CollectionVisibility;
  kind: CollectionKind;
  createdAt: string;
}

export interface SocialPost {
  id: string;
  itemId: string;
  excerpt: string;
  commentary: string;
  /**
   * Who the post is shared with. The legacy value "friends" — from a mutuals
   * model that no longer exists — is normalised to "followers" on read by
   * archiveValidation; see the comment there.
   */
  audience: Visibility;
  createdAt: string;
  author: string;
}

export interface ArchiveData {
  version: 1;
  items: ArchiveItem[];
  collections: ArchiveCollection[];
  socialPosts: SocialPost[];
}

export interface ArchiveRepository {
  load(): Promise<ArchiveData>;
  save(data: ArchiveData): Promise<void>;
  subscribe(listener: (data: ArchiveData) => void): () => void;
}
