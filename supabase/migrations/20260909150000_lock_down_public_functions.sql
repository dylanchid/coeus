-- Finding F-29: 20260907100000_lock_down_public_tables.sql closed the public
-- tables to anon/authenticated but left EXECUTE on public functions wide open.
-- PostgREST exposes every such function as an RPC endpoint (`/rest/v1/rpc/…`),
-- and PostgreSQL grants EXECUTE to PUBLIC on every function by default — so
-- anon and authenticated can still call SECURITY DEFINER helpers like
-- initialize_archive / publish_collection directly, bypassing the BFF.
--
-- The BFF uses a service_role client, which is unaffected by these revokes.
-- Nothing in the browser client calls a public RPC (see the schema comment set
-- in the table-lockdown migration).

revoke execute on all functions in schema public from public, anon, authenticated;

-- Keep functions added by later migrations closed by default too. Migrations
-- run as postgres, which owns public-schema objects.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
