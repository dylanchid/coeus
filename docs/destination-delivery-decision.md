# Destination delivery dispatch decision

**Status:** accepted for a staging proof; production rollout is conditional on the exit criteria below.  
**Date:** 2026-09-11  
**Owner:** `bareaga_web-m31`

## Decision

Use **Vercel Queues directly** for destination-delivery dispatch after a staging proof. Do not use Vercel Workflows or introduce Inngest for this workload. Keep Supabase's destination lease, delivery watermarks, and `record_delivery_outcomes` as the authority for mutual exclusion, idempotency, and the user-visible history.

The queue's responsibility is only to wake a bounded worker promptly and retry a lost invocation. It is not a second system of record and it must not hold destination credentials or item content.

Until the proof passes, retain the current `after()` trigger, manual Sync now route, and daily cron sweep. The daily sweep remains the reconciliation path after rollout as well.

## Current constraint and evidence

`runDestinationWorkerTick()` processes active destinations sequentially, guards each with a durable database lease, and caps each invocation at 100 items. Archive sync currently schedules it with `after()`; the Vercel cron is the daily catch-up. A first connection does not start a tick. An archive at the 5,000-item ceiling therefore needs up to 50 ticks per destination.

On Vercel Hobby, cron runs at most daily and its timing can vary by nearly an hour, so it cannot provide a dependable drain loop. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

Vercel Queues provides durable, at-least-once message delivery with retries and visibility timeouts. Its documentation explicitly requires idempotent consumers, which matches the existing delivery watermarks and database lease. [Queues concepts](https://vercel.com/docs/queues/concepts)

## Options considered

| Option | Cost / operations | Lock-in | Fit and decision |
| --- | --- | --- | --- |
| Keep `after()` + daily cron | No new service cost | Low | Reject: an aborted hook can leave work until the daily sweep, and first connect does not dispatch. |
| Vercel Workflows | Usage-priced managed persistence and workflow events | High, plus a new workflow programming model | Reject: Workflows suit stateful, multi-step flows; delivery is a message-driven, bounded worker. [Vercel's comparison](https://vercel.com/docs/queues/concepts) makes Queues the closer abstraction. |
| **Vercel Queues** | Hobby includes the first 1,000,000 queue API operations; push consumer compute is billed separately. [Pricing and limits](https://vercel.com/docs/queues/pricing) | High, but the payload and consumer stay small and portable | **Choose, conditionally.** It supplies the missing durable dispatch while preserving the existing idempotency boundary. |
| Inngest | Separate provider account, SDK, endpoint, and usage pricing | High, external control plane | Keep as fallback only. It is a valid durable-execution option, but adds a second vendor where Vercel already provides the queue primitive. [Inngest's Next.js guide](https://www.inngest.com/docs/getting-started/nextjs-quick-start) |
| Self-hosted/external worker | Ongoing hosting, monitoring, and secret-management cost | Medium | Reject for now: operational burden exceeds the current two-destination workload. Reconsider if Queue beta status or regional requirements fail the proof. |

## Target design

1. After a successful archive sync, publish a compact `destination.delivery.requested` message containing an opaque request id, `ownerId`, optional destination id, and correlation id. On destination connect, publish the same event scoped to the newly connected destination.
2. Use a Vercel Queue push consumer that constructs the existing `SupabaseArchiveSyncStore` and `SupabaseDestinationsStore`, then calls the existing worker with the message scope. The consumer never accepts public traffic; Vercel Queue push consumers are internally triggered.
3. Retain the 100-item cap. If a destination is still dirty after a tick, the worker publishes the next request only after releasing its database lease. This produces a drain chain without waiting for another archive edit.
4. A queue retry, duplicate publish, manual Sync now action, daily cron, or old `after()` hook may overlap. The database lease is still acquired first; the losing invocation is a safe no-op. Delivery outcome rows remain the durable evidence of external writes.
5. Keep the daily cron as reconciliation for missed or expired messages and add queue-age / retry / consumer-failure alerts alongside the current `destination_delivery.*` logs.

Message payloads must contain no encrypted destination token, external API secret, archive body, URL content, or user-provided note. The consumer reads the latest snapshot and encrypted secret from Supabase only after it has the database lease.

## Staging proof and production gate

Vercel Queues is currently beta, so this is not a no-risk platform commitment. Before removing `after()` as a primary trigger, prove all of the following in staging:

- Queue publish and the private push consumer work from the project/region that hosts Coeus, with production-equivalent environment variables.
- A 5,000-item Notion and Obsidian destination drains through chained 100-item ticks without duplicate external writes, including a simulated consumer timeout and redelivery.
- Queue retry and the daily cron can overlap without changing the resulting delivery watermarks or producing duplicate outcome rows.
- Consumer metrics expose age, retries, and failures; an alert fires for a message near its configured retention deadline.
- Measured function duration fits the **actual** project plan limit. The repository currently requests `maxDuration = 300`, while Vercel's current Hobby-plan documentation lists a configurable maximum of 60 seconds; verify the deployed limit before sizing the queue visibility timeout. [Hobby plan limits](https://vercel.com/docs/plans/hobby)

If any gate fails because Queue beta behavior, plan availability, or regional placement is unsuitable, do not partially migrate. Keep the current durable database boundaries and evaluate Inngest as the fallback; it supports event-triggered background functions on Next.js without operating a worker. [Inngest background jobs](https://www.inngest.com/docs/guides/background-jobs)

## Consequences

- The first connected destination starts draining promptly, independent of an archive edit or cron timing.
- Retries become durable at the dispatch boundary, but external calls remain at-least-once; correctness continues to rely on the existing database state.
- Coeus accepts an intentionally narrow Vercel dependency: queue publish and consume. Moving providers later requires replacing those adapters, not the delivery algorithm or schema.
- The implementation needs a feature flag and a rollback path: disable queue publishing/consumption, retain the cron and manual route, and let active database leases expire rather than attempting to cancel in-flight work.
