Subject: Cross-environment Queue publish reaches production callback, but callback identity cannot settle it

This replaces the original draft alleging a general Queue v2beta acknowledgment failure. No report has been sent.

Project: coeus-queue-staging (`prj_pv3RXhdVR4BCZJXr6eRPl7xdyQBg`)

Region: iad1. Runtime: Next.js 16.3.8, Node.js 24.x, @vercel/queue 0.8.0. Trigger: queue/v2beta, topic destination_delivery, retryAfterSeconds 60. Callback visibility timeout: 300 seconds.

## Finding

The local publishing identity inspected during the follow-up investigation has OIDC `environment: development`. The deployed consumer uses a production identity. Pinning the publish to a production deployment ID does not change the publisher token's environment. Vercel's [Queue API reference](https://vercel.com/docs/queues/api#authentication) states that team, project and environment claims scope requests.

A standalone Next.js app with no database or destination integration reproduced the acknowledgment failure with that local identity. A controlled comparison on deployment `dpl_EN1p77fbV2xtLxfr9zhdRw6UVgLd` then demonstrated that a production runtime publisher succeeds while a development publisher targeting the identical consumer fails.

| Publisher identity | Message | Consumer identity | AcknowledgeMessage | Callback result |
| --- | --- | --- | --- | --- |
| production runtime | `2x-1M1i78Scw0N4yEAtbuur8T9ubDWT60bS` | production | HTTP 204 at 04:00:55.024 UTC | HTTP 200, status success |
| development local token | `6O-1M1hMGs9HJkkz2SMMDZ6VvSf2kO8xPsY` | production | HTTP 409 at 04:01:16.423 UTC | HTTP 200, status skipped, reason not_available |
| production runtime, intentional first failure | `4J-1M1epPq6XouIC7Ngc5sSZ6Q03lFhBS2E` | production | HTTP 204 at 04:06:00.118 UTC after redelivery | HTTP 200, status success |

All timestamps are 2026-10-15 UTC. Both acknowledgment requests used the same region, topic, consumer group (`src_Sapp_Sapi_Sarchive_Sdestinations_Squeue_Sroute_Djs`), deployment ID header, and production identity. Both outbound receipts matched their incoming callback receipts byte for byte. Only synthetic JSON was processed. The matching case's Queue service request ID is `iad1:iad1::iad1::n5qqx-1792036854995-7458accad4e5`; the mismatched case's is `iad1:iad1::iad1::2qskv-1792036876385-bb5f7578c7f3`.

The matching-environment failure probe first threw at 04:00:55 UTC. At 04:05:59.986 UTC, its next callback had no receipt and performed ReceiveMessageById, which returned HTTP 200. The SDK reentered the handler at delivery count 2 and acknowledged with HTTP 204. No polling or manual lookup intervened for this production message. The development-published control's callback returned HTTP 404 from ReceiveMessageById at 04:06:21.431 UTC on the identical consumer deployment. Both initial settlement and retry therefore work when the environments match; the original claim that push retry is generally broken is not supported.

The original 03:27:08 delivery (`64-1M1eB49KLcoFLuPaDJUl9sVKPUXliRF4`) did complete its worker in 3.07 seconds before acknowledgment failed. Those runtime facts were verified from Vercel logs. However, the original report omitted the publisher's OIDC environment, so those facts alone do not establish that a correctly scoped consumer cannot acknowledge a valid lease. Removing the deployment ID header also does not align OIDC environments.

## SDK observations

SDK 0.8.0 forwards the incoming receipt and scopes follow-up calls with the runtime identity. It treats acknowledgment `MessageNotAvailableError` as a skipped delivery and returns HTTP 200. Its retry hook is also called for acknowledgment failures after successful handler completion.

A callback without a receipt is a supported SDK path: it calls ReceiveMessageById before invoking the handler. If that fetch returns 404, neither the handler nor its retry hook runs. Missing receipts alone do not establish malformed callbacks. Local synthetic HTTP contract checks verified these behaviors.

The earlier observation that a local poller could claim and acknowledge an otherwise unacknowledged message is consistent with a poller using the original publishing environment. It does not isolate push mode as the cause. The initial polling trace was not independently recovered for this packet; its earlier delivery counts are intentionally excluded from the revised support claim.

This was independently verified with the two standalone development-published probes on deployment `dpl_3Dwbwm3hGkD9bdjG8gqrmyNjgujk`. Production callback lookups returned HTTP 404 at 04:02:32 UTC. At 04:04:09–04:04:10 UTC, a local poller using their development identity fetched each same message by ID with HTTP 200 at delivery count 2, acknowledged each with HTTP 204, and verified HTTP 410 afterward. The change in authenticated environment explains the apparent difference between polling and push. See `poll-comparison.jsonl`.

## Remaining service question

If this cross-environment flow is unsupported, should publishing with a development identity and a production deployment ID be rejected before dispatch? Currently it can invoke the production callback with a receipt that its runtime identity cannot settle, and retries can fail lookup in that identity's environment. Please confirm the supported environment rules and whether earlier validation or a clearer error is planned.

The supported configuration to test is a publisher and consumer using the same project, OIDC environment and region. Use the deployed `/api/probe` fixture to publish with its runtime identity. The external publisher helper now checks its token's environment before sending. No application workaround that suppresses acknowledgment errors is proposed.

The original staging application's alias was restored and verified as `dpl_22Md5gZMHQWGSwbUL7pcEwWwExzu`. The probes used separate deployment IDs. The full destination-drain and production-rollout gates remain in the parent staging task; this synthetic proof verifies Queue settlement and retry only.

## Attachments

- `repro/`: standalone app, exact dependency versions, lockfile, synthetic publisher and consumer.
- `matched-environment-logs.jsonl`: comparison on one consumer deployment, including safe operation traces and service request IDs.
- `probe-logs.jsonl`: initial standalone failure using the development publisher identity.
- `poll-comparison.jsonl`: the development identity successfully settles those same synthetic messages after production callbacks failed lookup.
- `function-logs.jsonl`: selected original function events, with application fields omitted.
- `sdk-contract.test.mjs`: executable SDK contract checks with synthetic values.

No OIDC tokens, receipt values, destination credentials, owner or destination identifiers, or archive contents are included. Runtime request IDs, deployment IDs, project ID and Queue message IDs are retained for Vercel correlation.
