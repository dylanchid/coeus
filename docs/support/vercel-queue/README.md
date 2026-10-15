# Vercel Queue investigation

The original broad push-failure diagnosis was narrowed to a publisher/consumer OIDC environment mismatch. Nothing has been submitted to Vercel. See `report.md` for the corrected evidence and remaining service question.

The `repro/` directory is a standalone Next.js application with synthetic messages only. It has no Coeus application imports, database client, destination credentials, or archive contents. Node.js 24, Next.js 16.3.8 and `@vercel/queue` 0.8.0 match the affected staging runtime. Dependency versions are locked.

## Reproduction

1. Copy `repro/` into a clean directory and install with `npm ci` under Node.js 24.
2. Link that directory to a disposable Vercel project and deploy it to `iad1`. Do not copy environment files from Coeus. The only required authentication is Vercel's runtime OIDC identity.
3. Invoke `POST /api/probe` on the new deployment, for example with `vercel curl /api/probe --deployment DEPLOYMENT_ID -- --request POST`. The runtime publishes a fixed pair of synthetic messages with its own OIDC identity. This endpoint deduplicates the pair per deployment; use a fresh deployment for another pair. Messages expire after 900 seconds.
4. For an external publisher, set `VERCEL_OIDC_TOKEN`, `VERCEL_DEPLOYMENT_ID`, and `QUEUE_TARGET_ENVIRONMENT` locally, then run `node publish.mjs success` or `node publish.mjs fail-once`. The helper checks the token's environment claim before publishing. A local CLI token can remain scoped to development even when sending to a production deployment ID. Keep token values out of the report and logs.
5. Inspect the function logs. A successful handler should produce an `AcknowledgeMessage` operation with HTTP 204 and a callback response with `status: "success"`. A failed first delivery should reenter the handler after its lease expires and then acknowledge successfully.

The trace wrapper forwards Queue fetches without changing their requests. It logs operation, topic, consumer group, deployment ID, status, service request ID and only the token's environment claim. It compares the outbound receipt to the incoming receipt in memory and exports only the boolean `receiptMatchesCallback`. It never logs tokens, request headers, request bodies, receipt values, or full lease URLs. `fail-once` deliberately throws only when `deliveryCount === 1`.

## Local SDK verification

From the Coeus repository root:

```sh
node --test docs/support/vercel-queue/sdk-contract.test.mjs
```

These checks mock the Queue HTTP boundary with synthetic values. They confirm SDK behavior, not service health:

- The incoming receipt is encoded once and forwarded to acknowledgment after the handler completes.
- An acknowledgment 409 invokes the retry hook and becomes HTTP 200 with `status: "skipped", reason: "not_available"`.
- A callback without a receipt uses `ReceiveMessageById`. A 404 returns HTTP 500 without invoking either the application handler or its retry hook.
- A 204 acknowledgment produces `status: "success"`.

All four checks passed. Focused ESLint and `git diff --check` also passed. The standalone application built successfully on Vercel with Next.js 16.3.8. Local checks used Node.js 26.10.0; the deployment requests Node.js 24.x.

## Evidence handling

`function-logs.jsonl` contains allowlisted facts from the original staging callbacks. `probe-logs.jsonl` contains allowlisted facts from the first standalone reproduction. `matched-environment-logs.jsonl` compares publishers against the same consumer deployment and includes a successful failure/redelivery cycle. `publish-results.json` records synthetic message IDs and publisher environments. `poll-comparison.jsonl` records settlement with the original publishing identity. Raw CLI logs and deployment metadata remain outside this directory. `sanitize-logs.py` omits application identifiers, arbitrary error strings, destination events, message bodies, headers and receipt values; only selected probe requests are exported.

Do not attach `.env` files, `.vercel` directories, raw logs, or whole repository/session exports. Attach only the explicitly prepared support archive.

## References

- [Vercel Queue SDK](https://vercel.com/docs/queues/sdk): successful handlers acknowledge automatically; a throwing handler retries.
- [Queue API](https://vercel.com/docs/queues/api): requests are scoped by OIDC team, project and environment; acknowledgment 409 means an expired lease or receipt mismatch; a receive 410 means already acknowledged.
- [Poll mode](https://vercel.com/docs/queues/poll-mode): documented alternative that requires a polling schedule.
- [Related SDK issue #17184](https://github.com/vercel/vercel/issues/17184): a different report about acknowledgment 404 after duplicate processing. It does not establish the cause of this initial-delivery 409.
