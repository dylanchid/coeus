import { send } from "@vercel/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disposable support fixture: a fixed synthetic pair, deduplicated per deployment.
export async function POST() {
  const results = [];
  for (const mode of ["success", "fail-once"]) {
    const { messageId } = await send("destination_delivery", { probe: "vercel-queue-support", mode }, {
      retentionSeconds: 900,
      idempotencyKey: `support:${process.env.VERCEL_DEPLOYMENT_ID}:${mode}`,
    });
    results.push({ mode, messageId });
  }
  return Response.json({ deploymentId: process.env.VERCEL_DEPLOYMENT_ID, publisherEnvironment: process.env.VERCEL_ENV, results });
}
