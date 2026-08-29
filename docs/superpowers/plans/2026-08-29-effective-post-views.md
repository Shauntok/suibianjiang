# Effective Post Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count qualified article and diary reads after 10 visible seconds with a 12-hour per-viewer cooldown, keep exact totals private, and show them on existing `/admin/content` cards.

**Architecture:** A server-only HMAC identity turns an authenticated user ID or anonymous signed Cookie into a non-identifying viewer hash. A service-role-only PostgreSQL RPC atomically enforces eligibility and cooldown while updating lifetime and MYT daily aggregates; public pages submit once through a same-origin route, and the existing Admin content page loads totals in one protected batch.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest and Testing Library, Supabase Auth/Postgres, pgTAP, Supabase Cron (`pg_cron`), Zod, Lucide React.

**Spec:** `docs/superpowers/specs/2026-08-29-effective-post-views-design.md`

## Global Constraints

- Keep article routes at `/articles/[slug]` and diary routes at `/diary/[id]`.
- Keep articles and diaries in the existing `posts` table, distinguished by `type`.
- Count only `published`, `public`, non-deleted `article` and `diary` rows.
- Require 10 accumulated visible seconds; hidden-tab time does not count.
- Exclude the author while authenticated and allow at most one count per viewer/post per 12 hours.
- Count authenticated residents and anonymous visitors without storing IP, device data, raw user IDs, or raw Cookie values in view tables.
- Keep all public pages free of view-count UI; only Owner/Admin may read exact counts.
- Display exact `zh-CN` grouped integers in `/admin/content`; do not abbreviate to 千 or 万.
- Use `Asia/Kuala_Lumpur` for daily buckets.
- Do not backfill invented historical views; existing posts start at zero when tracking launches.
- Do not add Analytics pages, exports, rankings, Realtime, WebSocket, notifications, Google Analytics, or AdSense.
- Do not apply the production migration or deploy without separate explicit approval after local verification.

## File Map

- Create via `supabase migration new effective_post_views`: `supabase/migrations/*_effective_post_views.sql`
- Create: `supabase/tests/effective_post_views.test.sql`
- Create: `lib/views/viewer-identity.ts`, `lib/views/viewer-identity.test.ts`
- Create: `lib/views/service.ts`, `lib/views/service.test.ts`
- Create: `app/api/post-views/route.ts`, `app/api/post-views/route.test.ts`
- Create: `components/views/PostViewTracker.tsx`, `components/views/PostViewTracker.test.tsx`
- Modify: `components/articles/ArticleDetailClient.tsx`, `components/articles/ArticleDetailClient.test.tsx`
- Modify: `app/diary/[id]/page.tsx`, `app/diary/[id]/page.test.tsx`
- Create: `app/api/admin/content/view-counts/route.ts`, `app/api/admin/content/view-counts/route.test.ts`
- Modify: `app/admin/content/page.tsx`, `components/admin/content/ContentCard.tsx`
- Create: `components/admin/content/ContentCard.test.tsx`

---

### Task 1: Atomic Database Counters, Daily Buckets, and Retention

**Files:**
- Create via CLI: `supabase/migrations/*_effective_post_views.sql`
- Create: `supabase/tests/effective_post_views.test.sql`

**Interfaces:**
- Produces RPC `public.record_effective_post_view(p_post_id bigint, p_viewer_hash text, p_user_id uuid, p_counted_at timestamptz) returns boolean`.
- Produces RPC `public.get_effective_post_view_counts(p_post_ids bigint[]) returns table(post_id bigint, view_count bigint)`.
- Produces `private.post_view_stats`, `private.post_view_daily`, and `private.post_view_dedupe`.
- Both RPCs are executable only by `service_role`.

- [ ] **Step 1: Write the failing pgTAP test**

Create a transaction-scoped test with deterministic users and posts. Start with these literal checks, then add the listed cases below:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

select has_table('private', 'post_view_stats');
select has_table('private', 'post_view_daily');
select has_table('private', 'post_view_dedupe');

select is(
  public.record_effective_post_view(
    910000000000000001, repeat('a', 64),
    'd0000000-0000-0000-0000-000000000002',
    '2026-08-29 15:59:55+00'
  ),
  true,
  'first qualified public read counts'
);
select is(
  (select view_count from private.post_view_stats
   where post_id = 910000000000000001),
  1::bigint,
  'lifetime total increments once'
);
select is(
  public.record_effective_post_view(
    910000000000000001, repeat('a', 64),
    'd0000000-0000-0000-0000-000000000002',
    '2026-08-30 03:59:54+00'
  ),
  false,
  '11:59:59 repeat is rejected'
);
select is(
  public.record_effective_post_view(
    910000000000000001, repeat('a', 64),
    'd0000000-0000-0000-0000-000000000002',
    '2026-08-30 03:59:55+00'
  ),
  true,
  'exactly twelve hours later counts again'
);
```

Complete the 24 assertions with: author exclusion; draft, private, unlisted, deleted, and unsupported-type rejection; different viewers; malformed hashes; MYT midnight; list-RPC zero fill; foreign keys/indexes; direct `anon` and `authenticated` denial; and cleanup preserving aggregate rows. End with `select * from finish(); rollback;`.

- [ ] **Step 2: Run pgTAP to verify RED**

Run: `npx supabase test db supabase/tests/effective_post_views.test.sql`

Expected: FAIL because the tables and RPCs do not exist.

- [ ] **Step 3: Generate the migration with the CLI**

Run: `npx supabase migration new effective_post_views`

Use the exact path printed by the CLI. Do not manually invent or rename its timestamp.

- [ ] **Step 4: Implement the schema**

```sql
begin;

create table private.post_view_stats (
  post_id bigint primary key references public.posts(id) on delete cascade,
  view_count bigint not null default 0 check (view_count >= 0),
  updated_at timestamptz not null default now()
);

create table private.post_view_daily (
  post_id bigint not null references public.posts(id) on delete cascade,
  view_date date not null,
  view_count bigint not null default 0 check (view_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (post_id, view_date)
);

create table private.post_view_dedupe (
  post_id bigint not null references public.posts(id) on delete cascade,
  viewer_hash text not null check (viewer_hash ~ '^[0-9a-f]{64}$'),
  last_counted_at timestamptz not null,
  primary key (post_id, viewer_hash)
);

create index post_view_dedupe_last_counted_idx
on private.post_view_dedupe (last_counted_at);

insert into private.post_view_stats (post_id, view_count)
select id, 0 from public.posts where type in ('article', 'diary')
on conflict (post_id) do nothing;
```

Implement both RPCs as `security definer set search_path = ''`. The record RPC validates inputs and authoritative `posts` state, rejects the author, and claims cooldown atomically:

```sql
insert into private.post_view_dedupe (post_id, viewer_hash, last_counted_at)
values (p_post_id, p_viewer_hash, p_counted_at)
on conflict (post_id, viewer_hash) do update
set last_counted_at = excluded.last_counted_at
where private.post_view_dedupe.last_counted_at
      <= excluded.last_counted_at - interval '12 hours';
get diagnostics v_rows = row_count;
if v_rows = 0 then return false; end if;
```

Only after a successful claim, upsert lifetime and daily counts in the same transaction. Derive the date with `(p_counted_at at time zone 'Asia/Kuala_Lumpur')::date`. The list RPC uses `unnest(p_post_ids)` and a left join so requested posts without activity return zero.

Revoke all function privileges from `public, anon, authenticated`; grant execute only to `service_role`. Revoke private-table access from browser roles.

- [ ] **Step 5: Add daily cleanup Cron**

```sql
select cron.schedule(
  'cleanup-post-view-dedupe',
  '15 19 * * *',
  $$delete from private.post_view_dedupe
    where last_counted_at < now() - interval '24 hours'$$
);
commit;
```

Before scheduling, unschedule any existing job with that exact name so migration retries do not duplicate it.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npx supabase test db supabase/tests/effective_post_views.test.sql
npx supabase db advisors
```

Expected: all assertions PASS and no new advisor finding belongs to these objects.

Commit:

```powershell
git add supabase/migrations supabase/tests/effective_post_views.test.sql
git commit -m "feat: add private effective view counters"
```

---

### Task 2: Privacy-Preserving Viewer Identity

**Files:**
- Create: `lib/views/viewer-identity.ts`
- Create: `lib/views/viewer-identity.test.ts`

**Interfaces:**
- Produces `VIEWER_COOKIE_NAME = "ola_viewer"`.
- Produces `ViewerIdentity = { viewerHash: string; cookieValue?: string }`.
- Produces `createViewerIdentity(input: { userId: string | null; cookieValue: string | undefined; secret: string }): ViewerIdentity`.

- [ ] **Step 1: Write failing identity tests**

```ts
it("keeps a signed anonymous visitor stable", () => {
  const first = createViewerIdentity({ userId: null, cookieValue: undefined, secret });
  const again = createViewerIdentity({ userId: null, cookieValue: first.cookieValue, secret });
  expect(again.viewerHash).toBe(first.viewerHash);
  expect(first.viewerHash).toMatch(/^[0-9a-f]{64}$/);
  expect(again.cookieValue).toBeUndefined();
});

it("replaces a tampered anonymous cookie", () => {
  const result = createViewerIdentity({
    userId: null,
    cookieValue: "00000000-0000-0000-0000-000000000000.invalid",
    secret,
  });
  expect(result.cookieValue).toBeDefined();
});

it("uses the resident identity when logged in", () => {
  const result = createViewerIdentity({
    userId: "d0000000-0000-0000-0000-000000000002",
    cookieValue: "attacker.cookie",
    secret,
  });
  expect(result.cookieValue).toBeUndefined();
  expect(result.viewerHash).toHaveLength(64);
});
```

- [ ] **Step 2: Run to verify RED**

Run: `npm test -- lib/views/viewer-identity.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal server-only module**

Use `node:crypto` `randomUUID`, `createHmac`, and `timingSafeEqual`. Reject secrets shorter than 32 characters. Use domain separation:

```ts
const digest = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");

// Resident viewerHash: digest(secret, `resident:${userId}`)
// Visitor viewerHash:  digest(secret, `visitor:${anonymousId}`)
// Cookie signature:    base64url HMAC over `cookie:${anonymousId}`
```

Cookie format is `<random UUID>.<base64url signature>`. Keep parsing and verification inside this `server-only` module.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- lib/views/viewer-identity.test.ts`

Expected: PASS.

```powershell
git add lib/views/viewer-identity.ts lib/views/viewer-identity.test.ts
git commit -m "feat: add private viewer identity"
```

---

### Task 3: Public Counting Endpoint and Server Service

**Files:**
- Create: `lib/views/service.ts`
- Create: `lib/views/service.test.ts`
- Create: `app/api/post-views/route.ts`
- Create: `app/api/post-views/route.test.ts`

**Interfaces:**
- Produces `recordEffectivePostView(input: { postId: number; viewerHash: string; userId: string | null; countedAt?: Date }): Promise<void>`.
- Produces `listEffectivePostViewCounts(postIds: number[]): Promise<Record<number, number>>`.
- Produces `POST /api/post-views`, accepting `{ postId: number }` and returning only `{ ok: true }`.

- [ ] **Step 1: Write failing service tests**

Assert the exact RPC contract:

```ts
expect(rpc).toHaveBeenCalledWith("record_effective_post_view", {
  p_post_id: 140,
  p_viewer_hash: "a".repeat(64),
  p_user_id: null,
  p_counted_at: "2026-08-29T12:00:00.000Z",
});

expect(await listEffectivePostViewCounts([140, 141])).toEqual({
  140: 1234,
  141: 0,
});
```

Test non-integer/non-positive IDs, more than 200 IDs, duplicate IDs, malformed hashes, negative counts, missing rows, and unsafe integer conversions.

- [ ] **Step 2: Write failing route tests**

Define the request helper in the test file:

```ts
function sameOriginRequest(body: unknown, cookie?: string) {
  return new Request("https://ourlittleage.test/api/post-views", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://ourlittleage.test",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
```

```ts
it("sets a secure anonymous cookie without revealing the count", async () => {
  const response = await POST(sameOriginRequest({ postId: 140 }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get("set-cookie")).toContain("ola_viewer=");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  expect(recordEffectivePostView).toHaveBeenCalledWith(
    expect.objectContaining({ postId: 140, userId: null })
  );
});
```

Also test authenticated identity precedence, valid-Cookie reuse, cross-origin rejection, wrong content type, body over 1 KiB, unknown keys, invalid ID, and missing/short `VIEWER_ID_SECRET`. Service failures return a generic 500 without internal table or function names.

- [ ] **Step 3: Run to verify RED**

Run: `npm test -- lib/views/service.test.ts app/api/post-views/route.test.ts`

Expected: FAIL because the service and route do not exist.

- [ ] **Step 4: Implement the service and route**

Use strict Zod schemas and `supabaseAdmin.rpc`. Validate numeric RPC rows as safe, non-negative integers. The list function must return a complete map and throw on duplicate, missing, or unexpected rows.

The route uses `createSupabaseServerClient().auth.getUser()` for optional authentication, validates same-origin, bounds JSON to 1 KiB, creates the viewer identity, and records one attempt. A new Cookie uses:

```ts
{
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
}
```

Return `Cache-Control: private, no-store`. Never return count, hash, or cooldown state.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- lib/views/service.test.ts app/api/post-views/route.test.ts`

Expected: PASS.

```powershell
git add lib/views app/api/post-views
git commit -m "feat: record qualified post views"
```

---

### Task 4: Ten-Second Visible-Time Tracker

**Files:**
- Create: `components/views/PostViewTracker.tsx`
- Create: `components/views/PostViewTracker.test.tsx`

**Interfaces:**
- Produces `PostViewTracker({ postId, eligible }: { postId: number; eligible: boolean }): null`.
- Calls `POST /api/post-views` at most once per mount after 10,000 ms accumulated while visible.

- [ ] **Step 1: Write failing timer tests**

Use this visibility helper so tests exercise the real document event consumed by the component:

```ts
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  fireEvent(document, new Event("visibilitychange"));
}
```

```tsx
it("submits once after ten visible seconds and never loops", async () => {
  vi.useFakeTimers();
  render(<PostViewTracker postId={140} eligible />);
  await vi.advanceTimersByTimeAsync(9_999);
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("pauses hidden time and resumes the remainder", async () => {
  render(<PostViewTracker postId={140} eligible />);
  await vi.advanceTimersByTimeAsync(6_000);
  setVisibility("hidden");
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetch).not.toHaveBeenCalled();
  setVisibility("visible");
  await vi.advanceTimersByTimeAsync(4_000);
  expect(fetch).toHaveBeenCalledTimes(1);
});
```

Also test `eligible={false}`, unmount cleanup, rejected fetch without visible UI, exact JSON body, same-origin credentials, and `keepalive: true`.

- [ ] **Step 2: Run to verify RED**

Run: `npm test -- components/views/PostViewTracker.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the tracker**

Use `performance.now()` and refs for accumulated milliseconds, current visible baseline, submitted state, and timer ID. Listen for `visibilitychange`, commit visible elapsed time before pausing, and clean up on unmount. Never render UI, toast, or retry loop.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- components/views/PostViewTracker.test.tsx`

Expected: PASS.

```powershell
git add components/views/PostViewTracker.tsx components/views/PostViewTracker.test.tsx
git commit -m "feat: qualify visible reading time"
```

---

### Task 5: Article and Diary Integration

**Files:**
- Modify: `components/articles/ArticleDetailClient.tsx`
- Modify: `components/articles/ArticleDetailClient.test.tsx`
- Modify: `app/diary/[id]/page.tsx`
- Modify: `app/diary/[id]/page.test.tsx`

**Interfaces:**
- Consumes `PostViewTracker` from Task 4.
- Passes only `postId` and local eligibility; the server remains authoritative.

- [ ] **Step 1: Extend existing tests first**

Mock the tracker as a semantic marker and cover both content types:

```tsx
it.each([
  ["published", "public", true],
  ["published", "unlisted", false],
  ["published", "private", false],
  ["draft", "public", false],
])("wires tracking eligibility for %s/%s", (status, visibility, eligible) => {
  render(<ArticleDetailClient initialArticle={{ ...article, status, visibility }} />);
  expect(screen.getByTestId("post-view-tracker")).toHaveAttribute(
    "data-eligible",
    String(eligible)
  );
});
```

Repeat equivalent diary coverage while keeping its numeric-ID route.

- [ ] **Step 2: Run to verify RED**

Run: `npm test -- components/articles/ArticleDetailClient.test.tsx app/diary/[id]/page.test.tsx`

Expected: FAIL because neither detail page renders the tracker.

- [ ] **Step 3: Add minimal integrations**

```tsx
<PostViewTracker
  postId={post.id}
  eligible={
    post.type === expectedType &&
    post.status === "published" &&
    post.visibility === "public" &&
    !post.deleted_at
  }
/>
```

Do not add visible counters or modify Like/Share/Report actions.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- components/articles/ArticleDetailClient.test.tsx app/diary/[id]/page.test.tsx components/views/PostViewTracker.test.tsx`

Expected: PASS.

```powershell
git add components/articles/ArticleDetailClient.tsx components/articles/ArticleDetailClient.test.tsx app/diary/[id]/page.tsx app/diary/[id]/page.test.tsx
git commit -m "feat: track public article and diary reads"
```

---

### Task 6: Protected Admin Batch and Exact Card UI

**Files:**
- Create: `app/api/admin/content/view-counts/route.ts`
- Create: `app/api/admin/content/view-counts/route.test.ts`
- Modify: `app/admin/content/page.tsx`
- Modify: `components/admin/content/ContentCard.tsx`
- Create: `components/admin/content/ContentCard.test.tsx`

**Interfaces:**
- Consumes `listEffectivePostViewCounts(postIds)` from Task 3.
- Produces `POST /api/admin/content/view-counts` with strict `{ postIds: number[] }`, 1-200 unique positive IDs.
- `ContentCard` gains `viewCount: number | null` and `viewCountUnavailable: boolean`.

- [ ] **Step 1: Write failing Admin route tests**

Mock `getAdminActor` and the service. Assert 401 without an actor, 403 for `user` and `moderator`, 200 for `owner` and `admin`, 400 for malformed/duplicate/over-200 IDs, one batch call, and:

```ts
expect(await response.json()).toEqual({
  counts: { "140": 12438, "141": 0 },
});
expect(response.headers.get("cache-control")).toBe("private, no-store");
```

- [ ] **Step 2: Write failing card tests**

Render the real card with stable no-op commands:

```tsx
function renderCard(overrides: {
  viewCount?: number | null;
  viewCountUnavailable?: boolean;
}) {
  const result = render(
    <ContentCard
      post={{
        id: 140,
        type: "diary",
        status: "published",
        visibility: "public",
        created_at: "2026-08-29T07:54:17.000Z",
        author_id: "author-1",
      }}
      author={{ username: "系小卓呀" }}
      updateVisibility={vi.fn()}
      softDeletePost={vi.fn()}
      getTitle={() => "日记 · 2026年8月29日"}
      getViewHref={() => "/diary/140"}
      viewCount={overrides.viewCount ?? null}
      viewCountUnavailable={overrides.viewCountUnavailable ?? false}
    />
  );
  return result.container;
}
```

```tsx
expect(renderCard({ viewCount: 12438 })).toHaveTextContent("12,438 次有效阅读");
expect(renderCard({ viewCount: 0 })).toHaveTextContent("0 次有效阅读");
expect(renderCard({ viewCountUnavailable: true })).toHaveTextContent(
  "阅读数据暂不可用"
);
```

Assert responsive, wrap-safe markup without checking Tailwind internals unrelated to behavior.

- [ ] **Step 3: Run to verify RED**

Run: `npm test -- app/api/admin/content/view-counts/route.test.ts components/admin/content/ContentCard.test.tsx`

Expected: FAIL because the route and props do not exist.

- [ ] **Step 4: Implement route, batch load, and card**

The route uses `getAdminActor(request)`, permits only Owner/Admin, parses a bounded strict body, calls the batch service once, and returns no-store generic responses.

After the existing posts query, `/admin/content` sends one batch request for all post IDs. Store counts separately from the content list and keep an unavailable flag. A statistics failure must not clear or block content. Prevent stale refresh responses with an `AbortController` or request-sequence ref.

Use Lucide `Eye` and exact formatting:

```ts
new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(viewCount)
```

Make only the card header wrap-safe: tags remain grouped left; the count is right-aligned on desktop and moves to its own line when width is insufficient. Preserve every existing command.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- app/api/admin/content/view-counts/route.test.ts components/admin/content/ContentCard.test.tsx`

Expected: PASS.

```powershell
git add app/api/admin/content/view-counts app/admin/content/page.tsx components/admin/content/ContentCard.tsx components/admin/content/ContentCard.test.tsx
git commit -m "feat: show exact views in content admin"
```

---

### Task 7: Full Verification and Production Gate

**Files:**
- Modify only files already owned by Tasks 1-6 if verification exposes a defect.

**Interfaces:**
- Consumes the complete feature.
- Produces verification evidence; does not apply production changes without approval.

- [ ] **Step 1: Run focused and full repository gates**

```powershell
npm test -- lib/views components/views app/api/post-views app/api/admin/content/view-counts components/articles/ArticleDetailClient.test.tsx app/diary/[id]/page.test.tsx components/admin/content/ContentCard.test.tsx
npm test
npm exec eslint -- lib/views components/views app/api/post-views app/api/admin/content/view-counts components/articles/ArticleDetailClient.tsx app/diary/[id]/page.tsx app/admin/content/page.tsx components/admin/content/ContentCard.tsx
npm run build
git diff --check
```

Expected: tests and build PASS, focused ESLint has no new findings, and diff check is clean. Record the existing Vite native config-loader advisory separately.

- [ ] **Step 2: Re-run database gates**

```powershell
npx supabase test db supabase/tests/effective_post_views.test.sql
npx supabase db advisors
```

Expected: pgTAP PASS and no new advisor finding attributable to the feature.

- [ ] **Step 3: Verify desktop and mobile UI**

At 1440x900 and 375x812, capture `/admin/content` screenshots proving exact count, zero, unavailable state, no tag overlap, and no horizontal overflow. Confirm public article/diary pages expose no count or hidden count markup.

- [ ] **Step 4: Verify behavior without production writes**

Using disposable test rows: 9 seconds no count; 10 visible seconds one count; hidden time pauses; author no count; resident and anonymous visitors count separately; refresh within 12 hours no count; deterministic 12-hour boundary counts; simulated three-hour open page submits once.

- [ ] **Step 5: Commit only verification fixes**

If defects required code changes, run their focused tests again and commit only those fixes:

```powershell
git add lib/views components/views app/api/post-views app/api/admin/content/view-counts components/articles/ArticleDetailClient.tsx components/articles/ArticleDetailClient.test.tsx app/diary/[id]/page.tsx app/diary/[id]/page.test.tsx app/admin/content/page.tsx components/admin/content/ContentCard.tsx components/admin/content/ContentCard.test.tsx supabase/migrations supabase/tests/effective_post_views.test.sql
git commit -m "test: verify effective post views"
```

Skip this step when no files changed. Do not create verification-only metadata.

- [ ] **Step 6: Stop at production approval**

Report the generated migration filename, unapplied state, required `VIEWER_ID_SECRET` (minimum 32 random characters), all verification results, historical-zero policy, anonymous Cookie-clearing/anonymous-author limitation, and exact rollout sequence. Wait for explicit approval before setting secrets, applying migration, deploying, or running production smoke tests.

## Approved Production Rollout Sequence (Only After Separate Approval)

1. Store a cryptographically random `VIEWER_ID_SECRET` in server environments without printing or committing it.
2. Apply the reviewed migration to the linked production Supabase project.
3. Confirm migration history, RPC grants, private-table access, and `cleanup-post-view-dedupe` Cron.
4. Deploy the application.
5. Smoke test one public article and one public diary as author, another resident, and anonymous visitor.
6. Confirm `/admin/content` exact totals and absence of public count UI.
7. Confirm a repeat within 12 hours does not increment.
8. Monitor route/RPC errors and dedupe-table size for 24 hours.
