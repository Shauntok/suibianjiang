# Sponsorship Delivery and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver privacy-conscious sponsorships on home, space, article, and diary pages with AST-based inline insertion, independent desktop rails, local frequency control, and replay-resistant aggregate metrics.

**Architecture:** Pure Markdown and frequency modules decide eligibility without content or identity leaving the browser. One page-level provider sends a single request containing only page type, paragraph/character counts, available placements, and anonymous recent-ad counters; the server rechecks global settings, schedules, campaign weights, and page budget. Each selected slot receives a short-lived one-time token used by visibility and click endpoints to update daily aggregates.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, React Markdown, Unified/Remark AST, Supabase, Web IntersectionObserver, Vitest, Testing Library, Playwright, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-08-24-admin-sponsorship-system-design.md`

## Global Constraints

- Execute after the sponsorship backend and Admin operations workbench plans.
- Do not change `/articles/[slug]`, `/diary/[id]`, `posts`, or existing editor-preview behavior.
- New placements remain disabled until Owner/Admin enables them.
- Inline eligibility defaults to at least 8 top-level prose paragraphs and 1,200 visible characters.
- Eligible insertion is between 35% and 65%, after the first 3 paragraphs and before the last 2.
- Default page limit is 2 ads; eligible probability 60%; heavy-page cooldown 2 views; at most 4 ad pages per rolling 10.
- Desktop left/right rails are independent, never overlay content, and are hidden when safe width is unavailable.
- No user ID, IP, post ID, content text, or reading history is stored in sponsorship data.
- An ad impression counts only after at least 50% is visible for 1 second.

---

### Task 1: Markdown AST Analysis and Safe Anchor Selection

**Files:**
- Modify: `package.json`
- Create: `lib/sponsors/content-analysis.ts`
- Test: `lib/sponsors/content-analysis.test.ts`

**Interfaces:**
- Produces: `analyzeSponsorContent(markdown): ContentMetrics` and `chooseInlineAnchor(metrics, random): number | null`.
- Consumes: threshold values from `SponsorSettings`.

- [ ] **Step 1: Add direct AST dependencies**

Run:

```bash
npm install unified remark-parse
npm install --save-dev @types/mdast
```

- [ ] **Step 2: Write failing AST tests**

Use fixtures containing headings, paragraphs, images, nested lists, blockquotes, fenced code, tables, and thematic breaks. Assert:

```ts
const metrics = analyzeSponsorContent(markdown);
expect(metrics.paragraphCount).toBe(8);
expect(metrics.visibleCharacters).toBe(1246);
expect(metrics.safeAnchors.every((anchor) => anchor.kind === "paragraph")).toBe(true);
```

Test that list-item paragraphs, blockquote paragraphs, code text, image alt text, and headings do not count. Test that an 8-paragraph/1,200-character document qualifies, while either threshold failing returns no anchor. With `random = () => 0`, select the first allowed 35%-65% anchor; with `random = () => 0.999`, select the last allowed anchor.

- [ ] **Step 3: Verify RED**

Run: `npm test -- lib/sponsors/content-analysis.test.ts`.

- [ ] **Step 4: Implement AST traversal**

Parse with `unified().use(remarkParse).parse(markdown)`. Count only root-level nodes whose type is `paragraph`. Derive visible characters from text descendants of those paragraphs, excluding image nodes. Return source end offsets for eligible paragraph nodes so rendering can mark an exact AST-backed insertion point without splitting the Markdown string.

Define:

```ts
export type ContentMetrics = {
  paragraphCount: number;
  visibleCharacters: number;
  safeAnchors: Array<{ paragraphNumber: number; endOffset: number; kind: "paragraph" }>;
};
```

- [ ] **Step 5: Verify GREEN**

Run tests and lint.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/sponsors/content-analysis.ts lib/sponsors/content-analysis.test.ts
git commit -m "feat: analyze safe markdown sponsorship anchors"
```

---

### Task 2: Anonymous Local Frequency Engine

**Files:**
- Create: `lib/sponsors/frequency.ts`
- Test: `lib/sponsors/frequency.test.ts`

**Interfaces:**
- Produces: `readFrequencyState(storage)`, `decideSponsorRequest(settings, state, random)`, and `recordSponsorPage(state, shownCount)`.
- Consumes: frequency fields from `SponsorSettings`.

- [ ] **Step 1: Write failing deterministic tests**

Assert:

```ts
expect(decideSponsorRequest(settings, emptyState, () => 0.59).allowed).toBe(true);
expect(decideSponsorRequest(settings, emptyState, () => 0.60).allowed).toBe(false);
expect(decideSponsorRequest(settings, { ...emptyState, cooldownRemaining: 1 }, () => 0)).toEqual({
  allowed: false,
  reason: "cooldown",
});
```

Also test: four ad pages in the last ten blocks the next request; an ad-heavy page sets cooldown to 2; zero-ad pages decrement cooldown; history never exceeds ten booleans; corrupt Local Storage resets safely; unavailable storage uses session memory and halves the configured probability.

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/sponsors/frequency.test.ts`.

- [ ] **Step 3: Implement the pure state machine**

Use the single first-party key `ourlittleage:sponsor-frequency:v1`. Store only:

```ts
type SponsorFrequencyState = {
  recentAdPages: boolean[];
  cooldownRemaining: number;
  lastUpdatedAt: number;
};
```

Do not store campaign, placement, account, URL, or content identifiers. Clamp values when reading storage.

- [ ] **Step 4: Verify GREEN**

Run tests and lint.

- [ ] **Step 5: Commit**

```bash
git add lib/sponsors/frequency.ts lib/sponsors/frequency.test.ts
git commit -m "feat: add privacy-safe sponsorship frequency control"
```

---

### Task 3: Delivery Selection Service and API

**Files:**
- Create: `lib/sponsors/delivery.ts`
- Test: `lib/sponsors/delivery.test.ts`
- Create: `app/api/sponsors/serve/route.ts`

**Interfaces:**
- Produces: `selectSponsorSlots(input, settings, campaigns, random)` and `POST /api/sponsors/serve`.
- Consumes: settings/campaign types, Task 1 metrics, and Task 2 anonymous history summary.

- [ ] **Step 1: Write failing selection tests**

Test these behaviors independently:

- global off returns no slots;
- disabled placements never return;
- inline is removed below either threshold;
- article and diary slots never cross page type;
- rails are removed when `supportsRails` is false;
- no more than `maxAdsPerPage` are returned;
- placement priority is respected;
- campaign weight uses injected randomness;
- the same image is not repeated when another valid campaign exists;
- no active schedule returns an empty result.

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/sponsors/delivery.test.ts`.

- [ ] **Step 3: Implement the pure selector**

Define the request contract:

```ts
type SponsorServeInput = {
  pageType: "home" | "space" | "article" | "diary";
  availablePlacements: SponsorPlacement[];
  contentMetrics?: { paragraphCount: number; visibleCharacters: number };
  supportsRails: boolean;
  frequency: { recentAdPages: boolean[]; cooldownRemaining: number };
};
```

Do not accept post ID, user ID, pathname, content, referrer, or arbitrary priority from the browser.

- [ ] **Step 4: Implement the Route Handler**

Validate a small JSON body, load settings and currently scheduled placements with the service client, run the selector, create one cryptographically random raw token per returned slot, store only `sha256(rawToken)` with a 30-minute expiry, and return sanitized public fields plus raw token. Set `Cache-Control: private, no-store`.

The public response slot is exactly:

```ts
type ServedSponsorSlot = {
  placement: SponsorPlacement;
  partnerName: string;
  publicTitle: string;
  description: string | null;
  destinationUrl: string;
  imageUrl: string;
  altText: string;
  metricToken: string;
};
```

- [ ] **Step 5: Run tests and security checks**

Run tests and lint. Manually POST bodies containing extra identity fields, oversized arrays, unknown placements, and invalid page types; expect 400 without logging body contents.

- [ ] **Step 6: Commit**

```bash
git add lib/sponsors/delivery.ts lib/sponsors/delivery.test.ts app/api/sponsors/serve/route.ts
git commit -m "feat: select scheduled sponsorship placements"
```

---

### Task 4: Replay-Resistant Impression and Click Metrics

**Files:**
- Create: `lib/sponsors/metrics.ts`
- Test: `lib/sponsors/metrics.test.ts`
- Create: `app/api/sponsors/impression/route.ts`
- Create: `app/api/sponsors/click/route.ts`
- Modify: `app/api/cron/publish-announcements/route.ts`
- Create: `supabase/migrations/20260824170000_sponsor_metric_functions.sql`

**Interfaces:**
- Produces: `recordMetric(token, kind, now)` and two POST endpoints.
- Consumes: private tokens and aggregate function from the backend plan.

- [ ] **Step 1: Write failing metric tests**

Assert valid impression counts once, duplicate impression is idempotent, expired/unknown token is rejected, click counts once, and a click before the visibility timer atomically records the missing impression before the click so clicks cannot exceed impressions for that token.

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/sponsors/metrics.test.ts`.

- [ ] **Step 3: Implement atomic SQL functions**

Lock the matching token row with `for update`, validate expiry and metric flags, upsert `sponsor_daily_stats` using Malaysia’s current date, set the appropriate token flags, and return whether a counter changed. Keep a fixed empty search path and service-role-only execution.

- [ ] **Step 4: Implement small metric endpoints**

Accept only `{ token: string }`, hash server-side, and return 204 for success or already-counted idempotence. Return 400 malformed, 404 unknown, and 410 expired. Never echo or log the raw token.

- [ ] **Step 5: Add expired-token cleanup**

Extend the existing authenticated cron flow to delete expired sponsor metric tokens after its current publication and notification cleanup work. Treat cleanup failure as non-fatal and log only the number/error class, not tokens.

- [ ] **Step 6: Verify GREEN**

Run tests, `npx supabase db reset`, lint, and build.

- [ ] **Step 7: Commit**

```bash
git add lib/sponsors/metrics.ts lib/sponsors/metrics.test.ts app/api/sponsors app/api/cron/publish-announcements/route.ts supabase/migrations/20260824170000_sponsor_metric_functions.sql
git commit -m "feat: record anonymous sponsorship metrics"
```

---

### Task 5: Page-Level Provider and Accessible Sponsor Units

**Files:**
- Create: `components/sponsors/SponsorPageProvider.tsx`
- Create: `components/sponsors/SponsorSlot.tsx`
- Create: `components/sponsors/SponsorReaderFrame.tsx`
- Create: `components/sponsors/useSponsorVisibility.ts`
- Test: `components/sponsors/SponsorSlot.test.tsx`
- Test: `components/sponsors/SponsorPageProvider.test.tsx`

**Interfaces:**
- Produces: `SponsorPageProvider`, `SponsorSlot`, and `SponsorReaderFrame`.
- Consumes: Task 2 frequency engine and Task 3 serve response.

- [ ] **Step 1: Write failing component tests**

Test that the provider issues one request for all candidate page slots, renders no placeholders for an empty response, updates frequency state with the final shown slot count, and never requests while cooldown blocks. Test that `SponsorSlot` displays “商业合作” plus partner, uses image alt text, hides fully on image error, reports one impression after mocked 50%/1-second visibility, and sends click metrics without delaying navigation.

- [ ] **Step 2: Verify RED**

Run sponsorship component tests.

- [ ] **Step 3: Implement the provider**

One provider owns one serve request and exposes selected slots by placement through context. Abort stale requests on unmount. A failed request resolves to an empty slot map and leaves resident content untouched.

- [ ] **Step 4: Implement the visual unit**

Render semantic `<aside aria-label="商业合作">`, image, disclosure, partner, title, optional description, and external link. Add `target="_blank"` and `rel="sponsored noopener noreferrer"`. No animation, popup, autoplay, floating overlay, or imitation resident avatar/byline.

- [ ] **Step 5: Implement desktop rails**

`SponsorReaderFrame` uses a three-column grid only when a container/media query confirms safe desktop width. Each rail is independently rendered, sticky below the site header, 160-180px wide, and separated from the unchanged center reading width by at least 24px. Below the safe width, both rails use `display: none` and do not count as shown slots.

- [ ] **Step 6: Verify GREEN**

Run component tests and lint.

- [ ] **Step 7: Commit**

```bash
git add components/sponsors
git commit -m "feat: add accessible sponsorship page slots"
```

---

### Task 6: AST-Anchored Article and Diary Integration

**Files:**
- Modify: `components/TranslatedMarkdown.tsx`
- Create: `components/sponsors/SponsoredMarkdown.tsx`
- Test: `components/sponsors/SponsoredMarkdown.test.tsx`
- Modify: `components/articles/ArticleDetailClient.tsx`
- Modify: `app/diary/[id]/page.tsx`

**Interfaces:**
- Produces: inline, after-content, left-rail, and right-rail candidates on article/diary detail pages.
- Consumes: Task 1 safe source offsets and Task 5 provider/slots.

- [ ] **Step 1: Write failing render tests**

Render Markdown with qualifying and non-qualifying fixtures. Assert the inline unit appears after the selected top-level paragraph, never inside a list/blockquote/code block, and does not appear for short content. Assert short content may still render the after-content candidate. Render `TranslatedMarkdown` without sponsorship props and assert editor-preview output remains unchanged.

- [ ] **Step 2: Verify RED**

Run: `npm test -- components/sponsors/SponsoredMarkdown.test.tsx`.

- [ ] **Step 3: Add an optional AST anchor to TranslatedMarkdown**

Keep existing props backward compatible. Add optional `insertAfterOffset` and `insertedContent`. Use a small remark plugin to mark only the paragraph whose AST end offset matches; the custom paragraph renderer emits the normal paragraph followed by `insertedContent`. Never split the Markdown source string and never enable raw HTML.

- [ ] **Step 4: Build SponsoredMarkdown**

Analyze the already language-converted source consistently, select one safe offset using an injectable random source, and render `SponsorSlot` for the article/diary inline placement only when metrics qualify.

- [ ] **Step 5: Integrate detail pages**

Wrap each existing reading body with one `SponsorPageProvider` and `SponsorReaderFrame`. Keep the current center prose classes and route behavior. Place the after-content slot after the main prose section and before author notes/footer controls. Pass article placements only on article pages and diary placements only on diary pages.

- [ ] **Step 6: Verify GREEN**

Run targeted tests, all tests, lint, and build.

- [ ] **Step 7: Commit**

```bash
git add components/TranslatedMarkdown.tsx components/sponsors/SponsoredMarkdown.tsx components/sponsors/SponsoredMarkdown.test.tsx components/articles/ArticleDetailClient.tsx "app/diary/[id]/page.tsx"
git commit -m "feat: add restrained sponsorships to reading pages"
```

---

### Task 7: Home and Space Wide Placements

**Files:**
- Modify: `app/home/page.tsx`
- Modify: `app/space/page.tsx`
- Test: `components/sponsors/SponsorWidePlacement.test.tsx`

**Interfaces:**
- Produces: optional `home_wide` and `space_wide` display bands.
- Consumes: Task 5 provider and slot unit.

- [ ] **Step 1: Write failing wide-placement tests**

Assert the photo and copy stack on mobile, use a two-column composition where space permits, preserve surrounding feed order, and remove the entire band when disabled or image loading fails.

- [ ] **Step 2: Verify RED**

Run the targeted test.

- [ ] **Step 3: Integrate one provider per page**

Insert the home placement between the overview content and primary feed, and the space placement between the page introduction/filters and separated content feed. Do not mix article and diary streams or alter their links.

- [ ] **Step 4: Verify GREEN**

Run tests, lint, and build.

- [ ] **Step 5: Commit**

```bash
git add app/home/page.tsx app/space/page.tsx components/sponsors/SponsorWidePlacement.test.tsx
git commit -m "feat: add optional wide sponsorship placements"
```

---

### Task 8: End-to-End Privacy, Layout, and Statistics Gate

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/sponsorship.spec.ts`
- Modify: `HANDOFF.md`

**Interfaces:**
- Produces: repeatable end-to-end coverage and final deployment handoff.
- Consumes: all tasks in all three plans.

- [ ] **Step 1: Add Playwright**

Run:

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Add `"test:e2e": "playwright test"` to `package.json` and configure the dev server URL.

- [ ] **Step 2: Write the failing end-to-end flow**

Cover: Owner creates a draft, uploads wide/inline/vertical images with alt text, publishes a future campaign, changes it to current schedule, independently enables left/right/inline/after, and finally enables the global switch. Verify Moderator receives 403 on Admin sponsorship APIs.

- [ ] **Step 3: Add public delivery assertions**

At 1600x1000, assert reading center width is unchanged, rails do not overlap, no more than the configured page limit appears, and only a qualifying long post can receive inline placement. At 1024x768 and 390x844, assert rails are absent and no blank columns remain. On short content, assert inline is absent and after-content is the only content candidate.

- [ ] **Step 4: Add metric and failure assertions**

Mock visibility, advance 1 second, and assert one impression. Repeat and assert no increment. Click and assert one click. Test expired token, broken image, failed serve API, blocked Local Storage, and global switch off; resident content must remain visible in every case.

- [ ] **Step 5: Run the complete release gate**

```bash
npm test
npm run test:e2e
npm run lint
npm run build
npx supabase test db supabase/tests/sponsorship_rls.test.sql
npm audit --omit=dev
```

Expected: every command passes, no horizontal overflow at tested viewports, and no console error exposes tokens or request bodies.

- [ ] **Step 6: Verify aggregate accuracy**

Compare campaign/placement daily stats to the E2E impression/click actions. Verify Today, 7-day, 30-day, and 3-month Admin ranges include the expected Malaysia dates and CTR values.

- [ ] **Step 7: Return production state to off**

After verification, set the global switch and all placement switches to false. Leave the test campaign as draft or archived. Confirm public pages request or render no ads.

- [ ] **Step 8: Update handoff and commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/e2e/sponsorship.spec.ts HANDOFF.md
git commit -m "test: verify sponsorship delivery end to end"
```

