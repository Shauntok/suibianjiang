# Sponsorship Admin Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the default-off Supabase data model, secure Owner/Admin APIs, image upload path, and usable Admin sponsorship center without rendering ads on public pages.

**Architecture:** Supabase stores campaign configuration, placement assets, aggregate statistics, and private one-time metric tokens. Next.js Route Handlers authenticate the current user before using the service-role client; browser code never receives commercial table write access. The Admin UI consumes these handlers and reuses the existing `images` bucket and `admin_logs` table.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres/RLS/Storage, Zod, Vitest, Testing Library, Tailwind CSS 4, Lucide React.

**Spec:** `docs/superpowers/specs/2026-08-24-admin-sponsorship-system-design.md`

## Global Constraints

- `posts`, `profiles`, `comments`, existing routes, and existing Storage bucket names must not change.
- Commercial master switch and every new placement switch default to `false`.
- Only `owner` and `admin` manage or read commercial administration data; `moderator` is denied.
- Reuse `images/sponsors/{campaign-id}/{placement}/...`; do not create a Storage bucket.
- Persist only aggregate impressions, clicks, and CTR inputs; do not store user IDs, IPs, post IDs, or reading history in sponsorship metrics.
- Every management mutation writes an `admin_logs` row.
- UI remains quiet black/neutral; gold is limited to commercial status accents.

---

### Task 1: Test Harness and Sponsorship Domain Contract

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `lib/sponsors/types.ts`
- Create: `lib/sponsors/validation.ts`
- Test: `lib/sponsors/validation.test.ts`

**Interfaces:**
- Produces: `SponsorPlacement`, `SponsorSettings`, `SponsorCampaign`, `SponsorStatsRange`, `CampaignInput`, `campaignInputSchema`, `settingsInputSchema`, and `isSafeSponsorUrl()`.
- Consumes: no earlier sponsorship code.

- [ ] **Step 1: Add the test and validation dependencies**

Run:

```bash
npm install zod
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom
```

Add scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts` with the `@/` alias, `jsdom`, globals, and `tests/setup.ts`. In setup, import `@testing-library/jest-dom/vitest`.

- [ ] **Step 3: Write failing validation tests**

Test these exact behaviors in `lib/sponsors/validation.test.ts`:

```ts
expect(isSafeSponsorUrl("https://partner.example/offer")).toBe(true);
expect(isSafeSponsorUrl("javascript:alert(1)")).toBe(false);
expect(isSafeSponsorUrl("data:text/html,bad")).toBe(false);

expect(() => campaignInputSchema.parse({
  internalName: "深夜咖啡",
  partnerName: "月光咖啡社",
  publicTitle: "慢一点的咖啡",
  description: "留一点温度给今晚。",
  destinationUrl: "https://partner.example/coffee",
  state: "draft",
  startsAt: "2026-08-25T00:00:00.000Z",
  endsAt: "2026-09-01T00:00:00.000Z",
  weight: 100,
})).not.toThrow();

expect(() => settingsInputSchema.parse({
  commercialEnabled: false,
  minimumParagraphs: 8,
  minimumCharacters: 1200,
  maxAdsPerPage: 2,
  eligibleProbability: 60,
  cooldownPageViews: 2,
  maxAdPagesPerTen: 4,
  timezone: "Asia/Kuala_Lumpur",
  placementPriority: ["article_inline", "article_after", "desktop_left", "desktop_right"],
})).not.toThrow();
```

Also assert rejection for an end date before the start date, probability above 100, page limit above 3, duplicate placement priority, empty alt text, and an unsupported placement name.

- [ ] **Step 4: Run the tests and verify RED**

Run: `npm test -- lib/sponsors/validation.test.ts`  
Expected: FAIL because the sponsorship modules do not exist.

- [ ] **Step 5: Implement the domain types and schemas**

Define the placement union exactly as:

```ts
export const sponsorPlacements = [
  "home_wide",
  "space_wide",
  "article_inline",
  "diary_inline",
  "article_after",
  "diary_after",
  "desktop_left",
  "desktop_right",
] as const;

export type SponsorPlacement = (typeof sponsorPlacements)[number];
export type CampaignState = "draft" | "published" | "paused" | "archived";
export type SponsorStatsRange = "today" | "7d" | "30d" | "3m";
```

Use `z.string().url().refine(isSafeSponsorUrl)` for destination URLs, require end time after start time, constrain weight to `1..1000`, probability to `0..100`, page ads to `0..3`, and all count settings to non-negative integers.

- [ ] **Step 6: Run tests and project checks**

Run:

```bash
npm test -- lib/sponsors/validation.test.ts
npm run lint
```

Expected: validation tests PASS and lint exits 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts lib/sponsors/types.ts lib/sponsors/validation.ts lib/sponsors/validation.test.ts
git commit -m "test: establish sponsorship domain contract"
```

---

### Task 2: Supabase Schema, Constraints, RLS, and Storage Policy

**Files:**
- Create: `supabase/migrations/20260824130000_sponsorship_system.sql`
- Create: `supabase/tests/sponsorship_rls.test.sql`

**Interfaces:**
- Produces: `sponsor_settings`, `sponsor_campaigns`, `sponsor_campaign_placements`, `sponsor_daily_stats`, `private.sponsor_metric_tokens`, and policies for `images/sponsors/`.
- Consumes: role helpers already present in `20260824000000_security_hardening.sql`.

- [ ] **Step 1: Write the failing pgTAP role matrix**

Create fixtures for one owner, admin, moderator, resident, and campaign. Assert:

```sql
select lives_ok(
  $$ select * from public.sponsor_settings $$,
  'owner can read sponsor settings'
);

select is_empty(
  $$ select * from public.sponsor_campaigns $$,
  'moderator cannot read sponsor campaigns'
);

select throws_ok(
  $$ insert into public.sponsor_campaigns (internal_name, partner_name, public_title, destination_url, state, starts_at, ends_at, created_by, updated_by)
     values ('x', 'x', 'x', 'https://example.com', 'draft', now(), now() + interval '1 day', auth.uid(), auth.uid()) $$,
  '42501',
  null,
  'resident cannot create sponsor campaigns'
);
```

Include tests for Owner/Admin CRUD, Moderator/Resident/anon denial, direct stats update denial, private token invisibility, and `images/sponsors/` write denial for Moderator.

- [ ] **Step 2: Run the SQL test and verify RED**

Run: `npx supabase test db supabase/tests/sponsorship_rls.test.sql`  
Expected: FAIL because sponsorship relations do not exist.

- [ ] **Step 3: Create tables and constraints in one transaction**

The migration must create:

```sql
create table public.sponsor_settings (
  id boolean primary key default true check (id),
  commercial_enabled boolean not null default false,
  placement_enabled jsonb not null default '{
    "home_wide": false, "space_wide": false,
    "article_inline": false, "diary_inline": false,
    "article_after": false, "diary_after": false,
    "desktop_left": false, "desktop_right": false
  }'::jsonb,
  minimum_paragraphs integer not null default 8 check (minimum_paragraphs >= 0),
  minimum_characters integer not null default 1200 check (minimum_characters >= 0),
  max_ads_per_page integer not null default 2 check (max_ads_per_page between 0 and 3),
  eligible_probability integer not null default 60 check (eligible_probability between 0 and 100),
  cooldown_page_views integer not null default 2 check (cooldown_page_views between 0 and 20),
  max_ad_pages_per_ten integer not null default 4 check (max_ad_pages_per_ten between 0 and 10),
  placement_priority text[] not null default array['article_inline','diary_inline','article_after','diary_after','desktop_left','desktop_right','home_wide','space_wide'],
  timezone text not null default 'Asia/Kuala_Lumpur',
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Create campaign, placement, and daily stats tables with the names and uniqueness constraints from the spec. Add check constraints for the state enum values, allowed placement strings, positive weight, `ends_at > starts_at`, non-negative counters, non-empty `alt_text`, and HTTP(S) destination URL.

Create `private.sponsor_metric_tokens` with only token hash, campaign, placement, expiry, and two counted flags. Add indexes on campaign state/schedule, placement campaign, stats date/campaign, and token expiry.

- [ ] **Step 4: Add RLS and grants**

Enable RLS on all four public tables. Policies must use `private.is_owner_or_admin()` for management. Grant no direct sponsorship table privileges to anon; authenticated grants must still be narrowed by RLS. Do not grant access to the private token table.

- [ ] **Step 5: Add Storage prefix policies**

Restrict insert/update/delete under bucket `images` and prefix `sponsors/` to `private.is_owner_or_admin()`. Preserve existing policies for avatars, banners, and resident images.

- [ ] **Step 6: Seed the singleton in the migration**

```sql
insert into public.sponsor_settings (id) values (true)
on conflict (id) do nothing;
```

Verify the stored global and placement switches are all false.

- [ ] **Step 7: Run database checks**

Run:

```bash
npx supabase db reset
npx supabase test db supabase/tests/sponsorship_rls.test.sql
```

Expected: migration succeeds and every role-matrix assertion passes.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260824130000_sponsorship_system.sql supabase/tests/sponsorship_rls.test.sql
git commit -m "feat: add secure sponsorship data model"
```

---

### Task 3: Reusable Server Authentication and Service Client

**Files:**
- Create: `lib/supabase-admin.ts`
- Create: `lib/admin/authorization.ts`
- Test: `lib/admin/authorization.test.ts`

**Interfaces:**
- Produces: `getAdminActor(): Promise<AdminActor | null>`, `canManageSponsors(role): boolean`, and `supabaseAdmin`.
- Consumes: existing `createSupabaseServerClient()`.

- [ ] **Step 1: Write failing authorization tests**

```ts
expect(canManageSponsors("owner")).toBe(true);
expect(canManageSponsors("admin")).toBe(true);
expect(canManageSponsors("moderator")).toBe(false);
expect(canManageSponsors("user")).toBe(false);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/admin/authorization.test.ts`  
Expected: FAIL because `canManageSponsors` is missing.

- [ ] **Step 3: Implement authorization and service client**

`getAdminActor()` must call `auth.getUser()`, then select the role from `profiles`; never trust a role sent by the browser. `lib/supabase-admin.ts` must throw at server startup if the URL or service key is absent and must never be imported into a client component.

- [ ] **Step 4: Verify GREEN and lint**

Run:

```bash
npm test -- lib/admin/authorization.test.ts
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add lib/supabase-admin.ts lib/admin/authorization.ts lib/admin/authorization.test.ts
git commit -m "refactor: centralize admin server authorization"
```

---

### Task 4: Secure Settings and Campaign APIs

**Files:**
- Create: `app/api/admin/sponsors/settings/route.ts`
- Create: `app/api/admin/sponsors/route.ts`
- Create: `app/api/admin/sponsors/[id]/route.ts`
- Create: `app/api/admin/sponsors/stats/route.ts`
- Create: `lib/sponsors/admin-service.ts`
- Test: `lib/sponsors/admin-service.test.ts`
- Test: `lib/sponsors/admin-stats.test.ts`
- Create: `supabase/migrations/20260824140000_sponsor_admin_mutations.sql`

**Interfaces:**
- Produces: JSON CRUD endpoints, `GET /api/admin/sponsors/stats?range=7d&campaignId=...`, and `deriveCampaignDisplayStatus(state, startsAt, endsAt, now)`.
- Consumes: schemas from Task 1 and authorization/service client from Task 3.

- [ ] **Step 1: Write failing status and mutation tests**

Assert that published/future is `scheduled`, published/in-range is `live`, published/past is `ended`, and paused remains `paused`. Test that campaign creation writes both campaign and `admin_logs`, while a failed campaign insert writes neither. In `admin-stats.test.ts`, assert Today uses Malaysia midnight, `7d` and `30d` return daily buckets, `3m` returns weekly buckets, and zero impressions produce CTR `0`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/sponsors/admin-service.test.ts lib/sponsors/admin-stats.test.ts`  
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement transactional database functions and service wrappers**

Create `public.create_sponsor_campaign_with_log`, `public.update_sponsor_campaign_with_log`, and `public.update_sponsor_settings_with_log` in `20260824140000_sponsor_admin_mutations.sql`. Each function must update the business row and insert `admin_logs` in the same transaction, use a fixed empty search path, verify `private.is_owner_or_admin()`, and return only the saved business row. Revoke execution from public/anon and grant it only to authenticated. Use action names:

```text
sponsor_campaign_created
sponsor_campaign_updated
sponsor_campaign_paused
sponsor_campaign_archived
sponsor_settings_updated
```

- [ ] **Step 4: Implement Route Handlers**

Each mutation must perform, in order: same-origin check, current-user authentication, `canManageSponsors`, JSON size/shape validation, service call, sanitized response. Return 401 unauthenticated, 403 wrong role, 400 invalid input, 404 missing campaign, and 500 with a generic public message.

The stats route accepts only `today`, `7d`, `30d`, or `3m`, plus an optional UUID campaign filter. It aggregates impressions and clicks by campaign and placement, calculates CTR with a zero-impression guard, uses `Asia/Kuala_Lumpur` boundaries, and sets `Cache-Control: private, no-store`.

- [ ] **Step 5: Run tests and lint**

```bash
npm test -- lib/sponsors/admin-service.test.ts lib/sponsors/admin-stats.test.ts
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/sponsors lib/sponsors/admin-service.ts lib/sponsors/admin-service.test.ts lib/sponsors/admin-stats.test.ts supabase/migrations
git commit -m "feat: add sponsorship management APIs"
```

---

### Task 5: Validated Sponsor Image Upload

**Files:**
- Create: `app/api/admin/sponsors/upload/route.ts`
- Create: `lib/sponsors/image-policy.ts`
- Test: `lib/sponsors/image-policy.test.ts`

**Interfaces:**
- Produces: `validateSponsorImage(file)` and a POST upload endpoint returning `{ path, publicUrl }`.
- Consumes: `SponsorPlacement`, server authorization, and `supabaseAdmin`.

- [ ] **Step 1: Write failing image-policy tests**

Accept JPEG, PNG, and WebP up to 5 MB. Reject SVG, GIF, executable MIME types, empty files, files over 5 MB, unknown placement names, and campaign IDs that are not UUIDs.

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/sponsors/image-policy.test.ts`.

- [ ] **Step 3: Implement validation and upload**

Generate the path server-side:

```ts
const path = `sponsors/${campaignId}/${placement}/${crypto.randomUUID()}.${extension}`;
```

Authenticate before reading the file body, cap request size, use `upsert: false`, and delete the newly uploaded object if the subsequent placement save fails.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- lib/sponsors/image-policy.test.ts
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/sponsors/upload/route.ts lib/sponsors/image-policy.ts lib/sponsors/image-policy.test.ts
git commit -m "feat: secure sponsorship image uploads"
```

---

### Task 6: Admin Sponsorship Center UI

**Files:**
- Create: `app/admin/sponsors/page.tsx`
- Create: `app/admin/sponsors/new/page.tsx`
- Create: `app/admin/sponsors/[id]/page.tsx`
- Create: `components/admin/sponsors/SponsorCenterClient.tsx`
- Create: `components/admin/sponsors/SponsorCampaignForm.tsx`
- Create: `components/admin/sponsors/SponsorSettingsPanel.tsx`
- Create: `components/admin/sponsors/SponsorStatsSummary.tsx`
- Test: `components/admin/sponsors/SponsorCampaignForm.test.tsx`
- Modify: `components/AdminSidebar.tsx`

**Interfaces:**
- Produces: `/admin/sponsors`, `/admin/sponsors/new`, and `/admin/sponsors/[id]`.
- Consumes: Task 4 APIs and Task 5 upload endpoint.

- [ ] **Step 1: Write failing form behavior tests**

Test that new campaigns start as draft, placement toggles are off, invalid URLs block submission, end-before-start shows a field error, uploading requires alt text, dirty state sets `window.adminHasUnsavedChanges`, successful save clears it, and the stats summary switches among Today, 7 days, 30 days, and 3 months.

- [ ] **Step 2: Verify RED**

Run: `npm test -- components/admin/sponsors/SponsorCampaignForm.test.tsx`.

- [ ] **Step 3: Build the campaign list and global control**

Use compact rows with status text, schedule, enabled placements, impressions, clicks, CTR, edit, pause/resume, and archive actions. The global master switch requires confirmation before enabling and clearly states that new placements remain independently controlled.

- [ ] **Step 4: Build create/edit forms**

Use text inputs, datetime controls, numeric stepper/input, switches for placements, photo preview, upload action, and mandatory alt text. Do not use nested cards or emoji icons. Preserve unsaved values when an API request fails.

- [ ] **Step 5: Add sidebar entry with role filtering**

Add `Handshake` or `BadgeDollarSign` from `lucide-react` under “商业合作”. Render it only when `currentRole` is owner/admin. The API and RLS remain the real authorization boundary.

- [ ] **Step 6: Run tests, lint, and build**

```bash
npm test -- components/admin/sponsors/SponsorCampaignForm.test.tsx
npm run lint
npm run build
```

- [ ] **Step 7: Browser verification**

At 1440x900 and 375x812, verify: no overlap, labels fit, settings and status are separated on mobile, all controls are keyboard reachable, loading/error/empty states render, Moderator has no visible sponsorship link, and the database master switch remains false.

- [ ] **Step 8: Commit**

```bash
git add app/admin/sponsors components/admin/sponsors components/AdminSidebar.tsx
git commit -m "feat: add admin sponsorship center"
```

---

### Task 7: Phase Verification and Safe Stop

**Files:**
- Modify: `HANDOFF.md`

**Interfaces:**
- Produces: a documented, deployable backend/admin phase with no public ad rendering.
- Consumes: all earlier tasks in this plan.

- [ ] **Step 1: Run the full phase gate**

```bash
npm test
npm run lint
npm run build
npx supabase test db supabase/tests/sponsorship_rls.test.sql
```

Expected: all commands pass.

- [ ] **Step 2: Verify default-off database state**

Confirm the singleton has `commercial_enabled = false`, every placement value is false, and no public page imports a sponsorship component.

- [ ] **Step 3: Update handoff notes**

Record migration name, routes, environment variables, test commands, and the fact that public delivery is intentionally not active yet.

- [ ] **Step 4: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: record sponsorship backend handoff"
```
