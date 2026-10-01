-- A reply notification remains useful after its source reply is deleted.
-- The reply_id foreign key uses ON DELETE SET NULL, so the row-level check
-- must permit that historical state for kind = 'reply'.
alter table public.notifications
  drop constraint notifications_check;

alter table public.notifications
  add constraint notifications_check check (
    (kind = 'follow' and target_type is null and target_id is null and reply_id is null)
    or
    (kind in ('like', 'repost') and target_type is not null and target_id is not null and reply_id is null)
    or
    (kind = 'reply' and target_type is not null and target_id is not null)
  );
