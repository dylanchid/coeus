/**
 * Kept separate from postPublicationStore.server.ts (which imports "server-only"
 * and @supabase/supabase-js) so API-layer tests can import this error class
 * under node --experimental-strip-types without pulling in a module that only
 * resolves inside Next's server bundle. Mirrors CollectionNotFoundError.
 */
export class PostItemNotFoundError extends Error {}
