# Notification Center Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split formal mail from community interactions and aggregate future likes into one reliable unread group per recipient and target.

**Architecture:** Extend the existing `notifications` table with nullable interaction metadata and synchronize like groups from existing like tables through database triggers. Keep the current mailbox UI and actions, add a compact interaction renderer, and classify legacy interaction rows by stable title patterns without rewriting them.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres 17, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-notification-center-interactions.md`

## Global Constraints

- Preserve historical notification rows and all mailbox actions.
- Reuse `notifications`, `post_likes`, `comment_likes`, `comments`, `posts`, and `profiles`.
- Do not add a new notification table or route.
- Keep `/notifications` and use client state for section/filter state.
- New like groups count as one unread row; comments and replies count individually.
- Keep the deep-night, quiet, soft community visual language.

---

### Task 1: Notification Classification Contract

**Files:**
- Create: `lib/notifications/model.ts`
- Create: `lib/notifications/model.test.ts`

**Interfaces:**
- Produces: `isInteractionNotification()`, `getInteractionKind()`, `filterMailboxNotifications()`, `filterInteractionNotifications()`, and shared notification types.

- [ ] Write failing tests proving explicit `like/comment/reply` rows and legacy interaction titles are classified as interactions while feedback/system/announcement/badge rows remain mailbox mail.
- [ ] Run `npm test -- lib/notifications/model.test.ts` and confirm the missing module failure.
- [ ] Implement the typed classification and filtering helpers.
- [ ] Run the focused test and confirm it passes.

### Task 2: Backward-Compatible Interaction Migration

**Files:**
- Create: `supabase/migrations/<generated>_notification_interactions.sql`
- Create: `supabase/tests/notification_interactions.sql`

**Interfaces:**
- Produces nullable `actor_id`, `post_id`, `comment_id`, `actor_count`, `recent_actor_ids`, `last_activity_at`; explicit `like/comment/reply` rows; one like group per target.

- [ ] Create the migration filename with `supabase migration new notification_interactions`.
- [ ] Write pgTAP assertions for columns, indexes, trigger presence, comment classification, three-actor aggregation, unlike recount, zero-like hiding, relike reuse, and update column privileges.
- [ ] Run the pgTAP script in a transaction against the linked schema plus proposed migration and confirm expected failures before implementation.
- [ ] Implement additive columns, foreign keys, indexes, trigger functions, trigger replacements, and restricted UPDATE grants.
- [ ] Re-run pgTAP inside a rollback transaction and confirm all assertions pass with no persistent database changes.

### Task 3: Mailbox and Interaction UI

**Files:**
- Modify: `app/notifications/page.tsx`
- Create: `components/notifications/InteractionNotificationCard.tsx`
- Create: `components/notifications/InteractionNotificationCard.test.tsx`

**Interfaces:**
- Consumes shared model helpers and interaction metadata from Task 1 and Task 2.
- Produces first-level `信箱 / 互动` controls and second-level interaction filters `全部 / 喜欢 / 评论 / 回复`.

- [ ] Write failing component tests for aggregated like copy, comment preview, and reply copy.
- [ ] Run the focused component test and confirm failure before implementation.
- [ ] Add the compact interaction card and split page data into mailbox and interaction collections.
- [ ] Preserve mailbox unread/read/important/starred/trash filters and mutation methods unchanged.
- [ ] Add lightweight section unread counts and interaction filters using client state.
- [ ] Run focused tests and ESLint for changed files.

### Task 4: Unread Count Compatibility

**Files:**
- Modify: `components/Navbar.tsx`
- Modify only if needed: `app/home/page.tsx`

**Interfaces:**
- Consumes one-row-per-like-group behavior from Task 2.
- Produces unread project/group count in Navbar and the existing home mailbox count.

- [ ] Confirm both readers count unread, non-deleted notification rows rather than actor totals.
- [ ] Keep the row-count query when already correct; add comments/tests only where behavior would otherwise be ambiguous.
- [ ] Verify Realtime and `notifications-updated` refresh paths still call the same count query.

### Task 5: Production-Safe Verification and Apply

**Files:**
- Update: `HANDOFF.md`

**Interfaces:**
- Consumes all previous tasks.
- Produces verified migration history and release notes.

- [ ] Run all Vitest tests, focused ESLint, `git diff --check`, and `npm run build`.
- [ ] Apply the migration to the linked Supabase project only after rollback tests pass.
- [ ] Run production read-only schema checks and Supabase security/performance advisors.
- [ ] Verify historical rows remain unchanged and new metadata columns are nullable.
- [ ] Update `HANDOFF.md` with migration name, compatibility behavior, test results, and known historical counting limitation.
- [ ] Stop after reporting files, database changes, migration, aggregation logic, history compatibility, Navbar count behavior, tests, and residual risks.
