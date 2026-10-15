import { QueueClient } from "@vercel/queue";

if (!process.env.VERCEL_OIDC_TOKEN || !process.env.VERCEL_DEPLOYMENT_ID) {
  throw new Error("Set VERCEL_OIDC_TOKEN and VERCEL_DEPLOYMENT_ID locally; do not include their values in attachments.");
}
const claims = JSON.parse(Buffer.from(process.env.VERCEL_OIDC_TOKEN.split(".")[1], "base64url").toString());
const expectedEnvironment = process.env.QUEUE_TARGET_ENVIRONMENT ?? "production";
if (claims.environment !== expectedEnvironment) {
  throw new Error(`Publisher identity is scoped to ${claims.environment}; target environment is ${expectedEnvironment}. Publish through the deployed /api/probe endpoint to use its runtime identity.`);
}
const mode = process.argv[2] ?? "success";
if (!["success", "fail-once"].includes(mode)) throw new Error("Use success or fail-once");
const client = new QueueClient({ region: "iad1", deploymentId: process.env.VERCEL_DEPLOYMENT_ID });
const result = await client.send("destination_delivery", { probe: "vercel-queue-support", mode }, { retentionSeconds: 900 });
console.log(JSON.stringify({ ts: new Date().toISOString(), mode, messageId: result.messageId }));
