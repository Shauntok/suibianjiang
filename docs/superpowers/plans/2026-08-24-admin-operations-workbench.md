# Admin Operations Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current equal-card Admin homepage and emoji sidebar with a compact, responsive operations workbench supporting Today, 7 days, 30 days, and 3 months.

**Architecture:** A server-only aggregate function returns one dashboard payload for the selected Malaysia-time range. A protected Next.js endpoint authenticates Admin roles and exposes the payload to a focused client dashboard. Reusable dashboard components keep mobile cards compact and leave sponsorship administration in the dedicated center built by the preceding plan.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres, Vitest, Testing Library, Tailwind CSS 4, Lucide React.

**Spec:** `docs/superpowers/specs/2026-08-24-admin-sponsorship-system-design.md`

## Global Constraints

- Execute after `2026-08-24-sponsorship-admin-backend.md`.
- Dashboard dates use `Asia/Kuala_Lumpur` and compare against the immediately preceding equal-length period.
- Ranges are exactly `today`, `7d`, `30d`, and `3m`; default is `7d`.
- Mobile system status must have visible separation from the KPI grid; KPI cards use a compact two-column layout.
- Use Lucide icons, icon buttons with accessible labels/tooltips, and no emoji feature icons.
- Preserve all existing Admin routes and moderation capabilities.

---

### Task 1: Malaysia Dashboard Range Contract

**Files:**
- Create: `lib/admin/dashboard-range.ts`
- Test: `lib/admin/dashboard-range.test.ts`
- Create: `lib/admin/dashboard-types.ts`

**Interfaces:**
- Produces: `DashboardRange`, `DashboardWindow`, `DashboardPayload`, and `getDashboardWindow(range, now)`.
- Consumes: no dashboard implementation.

- [ ] **Step 1: Write failing boundary tests**

Use a fixed instant of `2026-08-24T05:30:00.000Z`, which is `13:30` in Malaysia. Assert:

```ts
expect(getDashboardWindow("today", now)).toMatchObject({
  start: "2026-08-23T16:00:00.000Z",
  end: "2026-08-24T05:30:00.000Z",
  bucket: "hour",
});

expect(getDashboardWindow("7d", now)).toMatchObject({
  start: "2026-08-17T16:00:00.000Z",
  end: "2026-08-24T05:30:00.000Z",
  bucket: "day",
});

expect(getDashboardWindow("30d", now).bucket).toBe("day");
expect(getDashboardWindow("3m", now).bucket).toBe("week");
```

Also assert that each previous window ends exactly when its current window starts and has the same duration.

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/admin/dashboard-range.test.ts`  
Expected: FAIL because the range helper does not exist.

- [ ] **Step 3: Implement the range helper**

Use a fixed `+08:00` offset because Malaysia has no daylight-saving changes. Return ISO UTC boundaries and labels. Define:

```ts
export type DashboardRange = "today" | "7d" | "30d" | "3m";
export type DashboardBucket = "hour" | "day" | "week";
```

`DashboardPayload` must include generated time, selected range/window, four KPIs with previous-period deltas, trend buckets, system status, pending queues, recent residents, recent posts, and sponsorship summary.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- lib/admin/dashboard-range.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/dashboard-range.ts lib/admin/dashboard-range.test.ts lib/admin/dashboard-types.ts
git commit -m "test: define admin dashboard time ranges"
```

---

### Task 2: Server-Side Dashboard Aggregate

**Files:**
- Create: `supabase/migrations/20260824150000_admin_dashboard_snapshot.sql`
- Create: `lib/admin/dashboard-service.ts`
- Create: `app/api/admin/dashboard/route.ts`
- Test: `lib/admin/dashboard-service.test.ts`

**Interfaces:**
- Produces: `loadDashboard(range, now): Promise<DashboardPayload>` and `GET /api/admin/dashboard?range=7d`.
- Consumes: Task 1 window types and sponsorship tables from the backend plan.

- [ ] **Step 1: Write failing payload tests**

Provide deterministic query-adapter fixtures and assert:

```ts
expect(payload.kpis.activeResidents.value).toBe(18);
expect(payload.kpis.pending.value).toBe(1);
expect(payload.kpis.newContent.value).toBe(11);
expect(payload.kpis.sponsorCtr.value).toBeCloseTo(2.8);
expect(payload.kpis.sponsorCtr.unit).toBe("percent");
expect(payload.trend).toHaveLength(7);
```

Assert CTR is zero when impressions are zero, rejected/closed items do not count as pending, and a database failure returns an error rather than a fabricated zero-filled dashboard.

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/admin/dashboard-service.test.ts`.

- [ ] **Step 3: Add the server-only aggregate function**

Create `public.get_admin_dashboard_snapshot(range_start timestamptz, range_end timestamptz, previous_start timestamptz, bucket text)` returning JSON. It must aggregate from existing `profiles`, `posts`, `comments`, `reports`, `feedbacks`, and `sponsor_daily_stats`, and return recent lists with only fields the UI displays.

Revoke execution from public/anon/authenticated and grant only to `service_role`. Set a fixed search path and validate `bucket` against `hour`, `day`, and `week`.

- [ ] **Step 4: Implement the service and protected endpoint**

The endpoint must:

1. Parse range from the query string, defaulting to `7d`.
2. Authenticate with `getAdminActor()`.
3. Allow owner/admin/moderator to view operational metrics.
4. Call the service-role RPC with Task 1 boundaries.
5. Set `Cache-Control: private, no-store`.
6. Return 400 for an invalid range, 401 unauthenticated, 403 wrong role, and 500 for aggregate failure.

- [ ] **Step 5: Verify GREEN and database syntax**

Run:

```bash
npm test -- lib/admin/dashboard-service.test.ts
npx supabase db reset
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260824150000_admin_dashboard_snapshot.sql lib/admin/dashboard-service.ts lib/admin/dashboard-service.test.ts app/api/admin/dashboard/route.ts
git commit -m "feat: add protected admin dashboard aggregate"
```

---

### Task 3: Dashboard Component System

**Files:**
- Create: `components/admin/dashboard/DashboardRangeTabs.tsx`
- Create: `components/admin/dashboard/DashboardHeader.tsx`
- Create: `components/admin/dashboard/KpiGrid.tsx`
- Create: `components/admin/dashboard/TrendPanel.tsx`
- Create: `components/admin/dashboard/OperationsQueue.tsx`
- Create: `components/admin/dashboard/RecentActivity.tsx`
- Create: `components/admin/dashboard/DashboardSkeleton.tsx`
- Test: `components/admin/dashboard/KpiGrid.test.tsx`
- Test: `components/admin/dashboard/DashboardRangeTabs.test.tsx`

**Interfaces:**
- Produces: presentational dashboard components accepting `DashboardPayload` fields.
- Consumes: `DashboardRange` and `DashboardPayload` from Task 1.

- [ ] **Step 1: Write failing interaction tests**

Assert range tabs expose `aria-pressed`, selecting `30d` calls `onChange("30d")`, the active range is not color-only, KPI values use the correct labels/units, and a missing sponsor CTR displays `未启用` rather than `0%`.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- components/admin/dashboard/KpiGrid.test.tsx components/admin/dashboard/DashboardRangeTabs.test.tsx
```

- [ ] **Step 3: Implement compact components**

Use four KPI tiles with stable minimum heights no greater than 112px on desktop and 96px on mobile. Use a two-column mobile grid and four columns at large widths. Trend bars must have text summaries and accessible labels; do not rely on chart color alone.

System status is its own band. On mobile, apply at least `mt-5` before the KPI grid so it does not visually stick to the active-resident tile.

- [ ] **Step 4: Verify GREEN**

Run the component tests and `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add components/admin/dashboard
git commit -m "feat: add compact admin dashboard components"
```

---

### Task 4: Replace the Admin Homepage

**Files:**
- Modify: `app/admin/homepage/page.tsx`
- Test: `app/admin/homepage/page.test.tsx`

**Interfaces:**
- Produces: the complete `/admin/homepage` workbench.
- Consumes: Task 2 API and Task 3 components.

- [ ] **Step 1: Write failing page-state tests**

Test initial `7d` loading, successful payload rendering, range refetch, manual refresh, stale request cancellation, error with retry button, and preservation of the last successful payload while a refresh is in progress.

- [ ] **Step 2: Verify RED**

Run: `npm test -- app/admin/homepage/page.test.tsx`.

- [ ] **Step 3: Implement the page controller**

Fetch `/api/admin/dashboard?range=${range}` with an `AbortController`. Display generated time in Malaysia time. Keep these four first-screen KPIs: active residents, pending work, new content, and sponsor CTR. Move total residents/articles/diaries/comments and moderation totals into lower operational sections rather than restoring twelve equal cards.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- app/admin/homepage/page.test.tsx
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add app/admin/homepage/page.tsx app/admin/homepage/page.test.tsx
git commit -m "feat: rebuild admin operations homepage"
```

---

### Task 5: Sidebar and Admin Layout Polish

**Files:**
- Modify: `components/AdminSidebar.tsx`
- Modify: `app/admin/layout.tsx`
- Test: `components/AdminSidebar.test.tsx`

**Interfaces:**
- Produces: grouped Lucide navigation and consistent desktop/mobile Admin shell.
- Consumes: existing routes plus `/admin/sponsors` from the backend plan.

- [ ] **Step 1: Write failing role/navigation tests**

Assert Owner sees all sections, Admin sees sponsorship but not Owner-only logs, Moderator sees governance/content but not sponsorship/growth/logs, active route uses `aria-current="page"`, and mobile open/close buttons have accessible names.

- [ ] **Step 2: Verify RED**

Run: `npm test -- components/AdminSidebar.test.tsx`.

- [ ] **Step 3: Replace emoji navigation with Lucide icons**

Use icon components in the link model rather than strings. Suggested mapping: `LayoutDashboard`, `Users`, `MessageCircle`, `Flag`, `Inbox`, `Library`, `Megaphone`, `Mail`, `Handshake`, `Award`, `Sparkles`, `ScrollText`, `House`, `Menu`, and `X`.

Keep unfamiliar icon buttons at a stable 40x40 size and add `title` plus `aria-label`. Use radii no larger than `rounded-lg` for operational panels unless an existing shared control requires otherwise.

- [ ] **Step 4: Adjust the shell**

Use a 224px desktop sidebar, a constrained content width, consistent 24px desktop gaps, and a full-height mobile drawer. Ensure long Chinese labels never overflow or resize the icon column.

- [ ] **Step 5: Verify GREEN**

Run tests, lint, and build.

- [ ] **Step 6: Commit**

```bash
git add components/AdminSidebar.tsx components/AdminSidebar.test.tsx app/admin/layout.tsx
git commit -m "refactor: organize admin navigation and shell"
```

---

### Task 6: Responsive and Data-Accuracy Gate

**Files:**
- Modify: `HANDOFF.md`

**Interfaces:**
- Produces: a verified operations workbench ready for public-delivery integration.
- Consumes: all tasks in this plan.

- [ ] **Step 1: Run automated checks**

```bash
npm test
npm run lint
npm run build
```

- [ ] **Step 2: Compare dashboard values with direct Supabase queries**

For each range, verify active residents, pending work, new posts, sponsorship impressions/clicks, and CTR against direct aggregate queries. Verify previous-period delta direction and Malaysia date boundaries.

- [ ] **Step 3: Browser-check desktop and mobile**

At 1440x900, 1024x768, 390x844, and 375x667 verify no overlap, no horizontal scroll, system status/KPI separation, compact KPI height, sidebar drawer behavior, keyboard focus, range switching, refresh, loading, error, and empty states.

- [ ] **Step 4: Update handoff and commit**

```bash
git add HANDOFF.md
git commit -m "docs: record admin workbench verification"
```

