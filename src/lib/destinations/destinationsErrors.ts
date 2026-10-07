/**
 * Kept separate from destinationsStore.server.ts (which imports "server-only"
 * and @supabase/supabase-js) so API-layer tests can import these error
 * classes under node --experimental-strip-types without pulling in a module
 * that only resolves inside Next's server bundle.
 */
export class ArchiveNotFoundError extends Error {}
export class DestinationNotFoundError extends Error {}
