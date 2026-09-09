import { timingSafeEqual } from "node:crypto";
import { ARCHIVE_BUDGET } from "@/lib/archiveBudget";
import { SupabaseArchiveSyncStore } from "@/lib/archiveSyncStore.server";
import { runDestinationWorkerTick } from "@/lib/destinationWorker.server";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
import { createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request, secret: string): boolean {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Cron fallback for the fire-and-forget delivery kicked off after every archive sync
 * (Vercel Hobby cron is once/day). Must read CRON_SECRET specifically: Vercel only
 * attaches the `Authorization: Bearer $CRON_SECRET` header for a variable with that
 * exact name (see vercel.json's crons entry for this route).
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request, requiredEnvironment("CRON_SECRET"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return instrument(
    { route: "archive.destinations.worker", operation: "cronTick", correlationId: requestCorrelationId(request) },
    () => runWorkerTick(),
  );
}

async function runWorkerTick(): Promise<Response> {
  const supabase = createAdminSupabaseClient();
  const store = new SupabaseDestinationsStore(supabase, requiredEnvironment("DESTINATION_TOKEN_ENCRYPTION_KEY"));
  const result = await runDestinationWorkerTick(new SupabaseArchiveSyncStore(supabase), store);

  // Phase 3 (docs/profile-page-plan.md §7): layer 2 of the polymorphic trade.
  // (target_type, target_id) on likes / reposts / replies is not a foreign key,
  // so a like or repost of a collection its owner later deletes leaves an orphan
  // row. canSeeIndirect() already hides these at read time; this daily sweep is
  // pure hygiene, keeping the tables from accreting dead rows.
  const { data: orphanSweep, error: sweepError } = await supabase
    .rpc("sweep_conversation_orphans")
    .single();

  // Revision retention: keep the recent N revisions and the last M days.
  const { data: retention, error: retentionError } = await supabase.rpc("prune_all_archive_revisions", {
    p_keep_count: ARCHIVE_BUDGET.retention.keepRevisions,
    p_keep_days: ARCHIVE_BUDGET.retention.keepDays,
  });
  const prunedRevisions = Array.isArray(retention)
    ? (retention as { deleted: number }[]).reduce((total, row) => total + (row.deleted ?? 0), 0)
    : 0;

  return Response.json({
    ...result,
    orphanSweep: sweepError ? { error: sweepError.message } : orphanSweep,
    retention: retentionError ? { error: retentionError.message } : { prunedRevisions },
  });
}
