# Notification Center Interactions Design

## Goal

Split `/notifications` into a formal mailbox and a compact interactions area while preserving every existing mailbox action. Aggregate future likes by recipient and target without deleting or rewriting legacy notifications.

## Current Constraints

- `notifications.type` currently contains only `system`, `badge`, and `announcement` in production.
- Existing like and comment triggers write interaction messages as `system` and do not store actor or target identifiers.
- `post_likes` and `comment_likes` already enforce one row per actor and target and toggle `is_active`.
- Historical interaction rows can be identified by their stable titles, but cannot be safely assigned to a post or comment.
- There is no reply UI today, although `comments.parent_id` is available for future reply records.

## Design

Extend `notifications` with nullable interaction metadata: `actor_id`, `post_id`, `comment_id`, `actor_count`, `recent_actor_ids`, and `last_activity_at`. New comments use `comment` or `reply`; post and comment likes use `like` with partial unique indexes that allow one row per recipient and target.

Like source rows remain authoritative. AFTER triggers recount active actors and update the single notification group. Unlike updates the group without marking it unread; zero active actors hides it. Reactivation restores the same group and marks it unread. Existing BEFORE triggers retain one-time growth rewards but stop creating notification rows.

The UI classifies explicit interaction types first and uses legacy title patterns as a fallback. Legacy rows stay intact and appear in interactions individually because they lack safe grouping identifiers. Navbar unread count remains a row count; each new like group is one row, while each comment or reply remains one row.

Residents retain RLS access to their own notifications. UPDATE column privileges are narrowed to `is_read`, `is_starred`, `is_important`, and `deleted_at`; interaction metadata remains trigger-controlled.

## Scope

Modify only the notification center, notification unread counting, and database triggers that create interaction notifications. Do not add push, email, chat, Admin features, or a separate notification service.
