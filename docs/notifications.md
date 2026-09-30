# Notifications

Notifications v1 is an in-app inbox for four social events:

- a new profile follower
- a like on a published post or collection
- a reply to a published post or collection
- a repost of a published post or collection

## Delivery model

The `notifications` table is private to its recipient and is populated by database
triggers in the same transaction as the source follow, like, reply, or repost.
Self-events are suppressed. A follower who has not completed onboarding can still
produce a follow event; the inbox renders that actor as `Someone` until a profile
exists.

The inbox is available at `/notifications`. The header loads the unread count
through `/api/notifications`; the inbox supports keyset pagination and a
recipient-scoped “mark all as read” action.

Target context is resolved from the current target row. Deleted, unpublished, or
currently inaccessible target details are omitted rather than copied into the
notification row. Actor profiles remain live references, so a deleted actor is
rendered as `Someone`.

## Explicit non-goals

This first version is in-app only. It does not send email, batch or digest events,
or expose a client-direct Supabase read/write path. Those decisions need real event
volume and an email sender before they are worth designing.
