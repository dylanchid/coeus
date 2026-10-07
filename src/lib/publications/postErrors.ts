/**
 * Kept separate from postPublicationStore.server.ts (which pulls in
 * @supabase/supabase-js) so API-layer tests can import this error class under
 * node --experimental-strip-types with the smallest possible dependency.
 * Mirrors CollectionNotFoundError.
 */
export class PostItemNotFoundError extends Error {}
