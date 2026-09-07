-- The browser client is deliberately limited to Auth and profile-media Storage.
-- Every application-table read/write goes through the authenticated Next BFF,
-- which uses service_role after it has applied the product visibility rules.
-- RLS alone is not enough here: permissive table grants make raw PostgREST
-- responses an alternate, unsanitised API surface.

revoke all privileges on all tables in schema public from anon, authenticated;

-- Keep newly-created application tables closed by default as well. Migrations
-- run as postgres in Supabase, which owns public-schema objects.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;

comment on schema public is
  'Application data is server-BFF-only. Browser clients use Auth and profile-media Storage, never public tables or RPCs.';
