# Synced archive architecture

Status: accepted foundation (2026-09-04); fully implemented. This document defines
`bareaga_web-6j1` (closed 2026-09-04). Accounts and archive sync are now wired in
the UI — `SyncedArchiveRepository` is the repository `AppProviders` configures.

## Decision

Use **Supabase Auth, Postgres, and private Storage**, accessed through Coeus's
Next.js route handlers:

- Accounts remain optional. Anonymous users continue using the existing local
  repository without network requests.
- Initial authentication is passwordless email (magic link or OTP). OAuth can be
  added without changing archive ownership because Supabase Auth supplies the
  stable user ID.
- Browser sessions use secure, same-site cookies and are refreshed through the
  server auth boundary. Route handlers verify the user and archive ownership on
  every request; a browser never receives the service role credential.
- Postgres stores ownership, immutable revisions, idempotent operations, and
  snapshot metadata. A private Storage bucket stores optional captured content.
- Row-level security is defense in depth. Revision writes remain service-role-only
  so a client cannot skip validation or manufacture history.

This is intentionally a backend-for-frontend boundary. It keeps the client
repository replaceable and prevents Supabase-specific data access from spreading
through UI components.

## Durable model

The executable schema is in
`supabase/migrations/20260904120000_synced_archives.sql`.

Each account owns one archive. `archives.current_revision` points to an immutable
`archive_revisions` row containing a complete recovery snapshot and its per-field
revision map. `archive_operations` provides idempotency by `(archive_id,
operation_id)` and records any conflicts. A future retention job may compact old
operations, but revisions are retained until recovery/export controls define a
user-visible retention promise.

Captured pages are separate from archive metadata. `content_snapshots` always
retains the item ID and canonical URL alongside fetch URL, media type, byte count,
and SHA-256 digest. Content is optional and private; an archive item remains useful
and exportable when capture fails or is deleted.

Storage object names use:

```text
users/{owner_id}/{archive_id}/{item_id}/{snapshot_id}
```

## Synchronization contract v1

The runtime contract and pure reference reducer live in `src/lib/archiveSync.ts`.

1. A client begins with a complete snapshot at revision `N`.
2. Local edits are durable locally first and queued with a unique operation ID,
   stable client ID, base revision `N`, entity ID, and exact changed fields.
3. The client sends at most 500 operations in one authenticated batch.
4. The server locks the archive row, deduplicates operation IDs, applies the batch,
   writes revision `N+1`, records operations, and advances `current_revision` in
   one database transaction.
5. The response returns the complete current snapshot, accepted operation IDs,
   and structured conflicts. The client replaces its confirmed base, removes
   accepted operations from its queue, reapplies still-local operations, and
   publishes the result to subscribers.

Archive schema version and sync protocol version are independent. Both begin at
1, and unknown sync versions are rejected rather than guessed.

## Conflict rules

- Changes to different entities always merge.
- Changes to different fields on the same entity merge.
- If a field changed on the server after the client's base revision, the accepted
  server value wins and the incoming field is reported as `field_changed`.
- A stale delete never erases a newer edit (`delete_raced_with_update`).
- A stale update never recreates an entity deleted after its base
  (`entity_deleted`).
- A user can intentionally override by reviewing the returned state and issuing a
  new operation based on the latest revision.
- The server never silently picks a value using a device clock. Server revisions,
  not wall-clock timestamps, establish causality.

The merge unit is a field, not a whole archive document. This avoids losing a note
edited offline merely because another device changed the same item's starred
state. Arrays such as tags and collection IDs are fields in v1; simultaneous edits
to the same array conflict instead of attempting a surprising set merge.

## API boundary

- `GET /api/archive` returns the latest snapshot and `ETag: "revision-N"`.
- `POST /api/archive/sync` accepts the v1 batch and returns the sync result.
- `GET /api/archive/export` streams a lossless JSON export including canonical
  source context and snapshot manifests (captured bytes are a separate download).
- Snapshot capture and retrieval use dedicated authenticated endpoints; the server
  fetch path must apply the same SSRF controls as feed preview.

All of these are implemented: the transactional Supabase store, `GET
/api/archive/export`, and the authenticated `/api/archive/snapshots` capture and
retrieval endpoints (`bareaga_web-6j1`, closed 2026-09-04).

The sync POST is non-cacheable and bounded by body size, operation count, and rate
limits. Authentication, authorization, validation, and transaction boundaries are
server responsibilities even though Postgres RLS also protects reads.

## Migration and recovery

On first sign-in, the client converts valid `coeus.archive.v1` data to revision
0 locally and offers to upload it. It does not delete the local copy. If a remote
archive already exists, local entities are expressed as operations against the
downloaded base so conflicts follow the same rules as ordinary offline work.

Sign-out stops network sync but retains an explicitly labeled local copy. Account
deletion, local-data removal, snapshot retention, recovery selection, and lossless
JSON export must be exposed before cloud sync is described as generally available.

## Rejected alternatives

- Whole-document last-write-wins: simple, but loses unrelated offline edits.
- Device timestamps for conflict resolution: vulnerable to clock skew and gives
  users no reliable recovery boundary.
- Storing captured HTML in Postgres: makes database backups and revision reads
  unnecessarily heavy.
- Direct browser writes to revision tables: weakens validation and makes atomic,
  idempotent application harder to enforce.
