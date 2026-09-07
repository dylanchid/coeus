/**
 * Kept out of profileStore.server.ts (which imports "server-only" and
 * @supabase/supabase-js) so profileApi tests can import the error classes under
 * node --experimental-strip-types without pulling in a server-only module.
 */

/** The requested handle is currently held by another account. */
export class HandleTakenError extends Error {}

/**
 * The requested handle was released by *another* account less than 30 days ago
 * and is inside its quarantine window. Distinct from {@link HandleTakenError}
 * because "someone has it" and "someone just gave it up" are different things to
 * tell the user — see public.handle_available() in
 * 20260906180000_handle_history.sql.
 */
export class HandleQuarantinedError extends Error {}

/**
 * This account has changed its handle too many times in the last year. Carries
 * the moment the next change becomes allowed, for the 429 `Retry-After` / body.
 */
export class HandleChangeRateLimitedError extends Error {
  readonly nextChangeAllowedAt: Date;
  constructor(nextChangeAllowedAt: Date) {
    super("Too many handle changes");
    this.nextChangeAllowedAt = nextChangeAllowedAt;
  }
}

/** How many times an account may change its handle per rolling 365 days. */
export const HANDLE_CHANGES_PER_YEAR = 3;
