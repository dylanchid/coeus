-- Profile-media hardening — findings F-24 (bucket has no MIME/size limit and a
-- signed-in browser can write it directly with the publishable key) and F-25
-- (the avatar/cover CHECK matches any host, so a doctored avatar_url renders an
-- <img> at an attacker origin).
--
-- Decision (bareaga_web-dmm.5): profile-media becomes BFF-only for writes. All
-- avatar/cover uploads go through POST /api/account/profile/media, which
-- authenticates the caller, forces the object path to `<uid>/…`, and checks the
-- MIME type, size, and magic bytes before storing. The client's own session no
-- longer needs — and no longer has — insert/update rights on the bucket.

-- A. Drop the client write policies. Public read stays; owner delete stays
--    (harmless, and the orphan-sweep in the media route may still use it).
drop policy if exists "owners upload their own profile media" on storage.objects;
drop policy if exists "owners replace their own profile media" on storage.objects;

-- B. Cap the bucket itself, so even a service-role write cannot turn the public
--    bucket into a general-purpose file host. Mirrors profileUpload.ts.
update storage.buckets
set
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'],
  file_size_limit = 5 * 1024 * 1024
where id = 'profile-media';

-- C. Pin the avatar/cover URL shape. The CHECK cannot read
--    NEXT_PUBLIC_SUPABASE_URL, so it enforces what it can — https only, the
--    exact public-object path, and a uuid `<uid>/` first segment. The Supabase
--    host itself is pinned in validateProfileInput (src/lib/profile.ts), which
--    runs with the env value available on both the client and the BFF.
alter table public.profiles
  drop constraint if exists profiles_avatar_url_in_bucket,
  drop constraint if exists profiles_cover_url_in_bucket;

alter table public.profiles
  add constraint profiles_avatar_url_in_bucket
    check (
      avatar_url is null
      or avatar_url ~ '^https://[^/]+/storage/v1/object/public/profile-media/[0-9a-fA-F-]{36}/'
    ),
  add constraint profiles_cover_url_in_bucket
    check (
      cover_url is null
      or cover_url ~ '^https://[^/]+/storage/v1/object/public/profile-media/[0-9a-fA-F-]{36}/'
    );
