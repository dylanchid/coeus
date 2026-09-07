/**
 * Kept separate from conversationStore.server.ts (which imports "server-only"
 * and @supabase/supabase-js) so API-layer tests can import these under
 * node --experimental-strip-types without pulling in a server-only module.
 * Mirrors PostItemNotFoundError.
 */

/** The (target_type, target_id) resolves to no live collection or post. */
export class TargetNotFoundError extends Error {}

/** The target exists, but the actor is not allowed to see it — so cannot act on it. */
export class TargetForbiddenError extends Error {}

/** A reply id that is not the actor's, or does not exist. */
export class ReplyNotFoundError extends Error {}

/** A parentId that names a reply on a different target. */
export class ParentReplyMismatchError extends Error {}
