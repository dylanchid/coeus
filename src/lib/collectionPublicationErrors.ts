/**
 * Kept separate from collectionPublicationStore.server.ts (which imports
 * "server-only" and @supabase/supabase-js) so API-layer tests can import
 * these error classes under node --experimental-strip-types without pulling
 * in a module that only resolves inside Next's server bundle.
 */
export class CollectionNotFoundError extends Error {}
export class SlugExhaustedError extends Error {}
