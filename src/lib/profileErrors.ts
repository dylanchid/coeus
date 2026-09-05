/**
 * Kept out of profileStore.server.ts (which imports "server-only" and
 * @supabase/supabase-js) so profileApi tests can import the error class under
 * node --experimental-strip-types without pulling in a server-only module.
 */
export class HandleTakenError extends Error {}
