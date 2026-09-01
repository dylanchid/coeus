export type ArchiveState = "unread" | "read" | "kept";
export type CollectionVisibility = "private" | "unlisted" | "public";
export type CollectionKind = "personal" | "community";
export type SocialAudience = "public" | "friends";

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
  audience: SocialAudience;
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
