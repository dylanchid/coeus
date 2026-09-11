/**
 * Kept separate from collectionPublicationStore.server.ts (which imports
 * "server-only" and @supabase/supabase-js) so API-layer tests can import
 * these error classes under node --experimental-strip-types without pulling
 * in a module that only resolves inside Next's server bundle.
 */
export class CollectionNotFoundError extends Error {}
/** The publication exists, but the actor is not allowed to see it — so cannot follow it. */
export class CollectionForbiddenError extends Error {}
export class SlugExhaustedError extends Error {}
