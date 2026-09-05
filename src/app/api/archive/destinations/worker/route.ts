import { timingSafeEqual } from "node:crypto";
import { SupabaseArchiveSyncStore } from "@/lib/archiveSyncStore.server";
import { runDestinationWorkerTick } from "@/lib/destinationWorker.server";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
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
  const supabase = createAdminSupabaseClient();
  const store = new SupabaseDestinationsStore(supabase, requiredEnvironment("DESTINATION_TOKEN_ENCRYPTION_KEY"));
  const result = await runDestinationWorkerTick(new SupabaseArchiveSyncStore(supabase), store);
  return Response.json(result);
}
