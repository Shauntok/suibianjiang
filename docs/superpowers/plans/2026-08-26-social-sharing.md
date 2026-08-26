# Public Content Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure link and 9:16 Story-image sharing for public articles and diaries, with the confirmed mobile action proportions and graceful browser fallbacks.

**Architecture:** Shared pure helpers derive canonical URLs, versions, titles, and excerpts from the existing `posts` records. A server-only loader rechecks public visibility before a Next.js `ImageResponse` route renders the Story PNG; reusable client components handle copy, native share, file share, download fallback, focus, and responsive presentation. Article and diary pages keep their existing routes and data flows and only compose the new sharing controls into their current action areas.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Supabase, Next.js `ImageResponse`, Lucide React, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-26-social-sharing-design.md`

## Global Constraints

- Only records with `status = published`, `visibility = public`, `deleted_at IS NULL`, and a matching `type` may produce a Story image.
- Articles keep `/articles/[slug]`; diaries keep `/diary/[id]`.
- Reuse the existing `posts` and `profiles` tables; add no table, field, RLS policy, migration, Storage bucket, or persisted share record.
- Do not promise or implement automatic Instagram Story publishing; hand files and text to the device-native share sheet.
- Mobile owner layout is 50% Like + 50% Share, then 100% Edit, then 100% Back.
- Mobile visitor public layout is 33.33% Like + 33.33% Share + 33.33% Report, in that order, then 100% Back.
- An owner viewing non-public content sees disabled copy `公开后可分享`; a visitor viewing `unlisted` content sees no Share action and keeps 50% Like + 50% Report.
- Desktop controls stay compact and preserve the existing Edit and Back layout.
- Story output is a non-empty 1080x1920 PNG with Chinese text, a black night palette, soft purple light, 4-6 excerpt lines, and no private notes or admin fields.
- Native share calls remain inside explicit click handlers; `AbortError` is treated as a quiet cancellation.

## File Map

- Create `lib/sharing/model.ts`: shared types, URL building, title fallback, Markdown-to-text cleanup, excerpt truncation, and cache version selection.
- Create `lib/sharing/model.test.ts`: deterministic tests for every shared transformation and route rule.
- Create `lib/server/share-card.ts`: server-only public post/profile lookup and sanitized `ShareCardData` construction.
- Create `lib/server/share-card.test.ts`: query-policy and data-shaping tests with a mocked Supabase admin client.
- Create `lib/server/share-card-image.tsx`: the 1080x1920 `ImageResponse` renderer.
- Create `app/api/share-card/[type]/[id]/route.ts`: path validation, uniform 404 handling, and PNG cache headers.
- Create `app/api/share-card/[type]/[id]/route.test.ts`: route status, content type, and renderer delegation tests.
- Create `lib/sharing/client.ts`: Clipboard, native link share, Story file preparation, file share, cancellation, and download helpers.
- Create `lib/sharing/client.test.ts`: browser capability and fallback tests.
- Create `components/share/ShareButton.tsx`: compact/full-width trigger and disabled public-state copy.
- Create `components/share/ShareSheet.tsx`: accessible responsive dialog, preview, commands, and status messaging.
- Create `components/share/ShareSheet.test.tsx`: interaction, focus, Escape, body-scroll, copy, share, cancellation, and fallback tests.
- Modify `components/articles/ArticleDetailClient.tsx`: compute article share props and apply confirmed owner/visitor action grids.
- Modify `components/articles/ArticleDetailClient.test.tsx`: article public/non-public action-layout coverage.
- Modify `app/diary/[id]/page.tsx`: compute diary share props and apply the same sharing rules without changing `/diary/[id]`.
- Create `app/diary/[id]/page.test.tsx`: diary public/non-public action-layout coverage.

---

### Task 1: Shared Sharing Model

**Files:**
- Create: `lib/sharing/model.ts`
- Create: `lib/sharing/model.test.ts`

**Interfaces:**
- Consumes: `SITE_URL` from `lib/site.ts`.
- Produces: `SharePostType`, `ShareSourcePost`, `isSharePostType(value)`, `getCanonicalShareUrl(post)`, `getShareTitle(post)`, `stripMarkdownForShare(value)`, `getShareExcerpt(value, maxLength?)`, and `getShareVersion(post)`.

- [ ] **Step 1: Write the failing transformation tests**

```ts
import { describe, expect, it } from "vitest";
import {
  getCanonicalShareUrl,
  getShareExcerpt,
  getShareTitle,
  getShareVersion,
  isSharePostType,
  stripMarkdownForShare,
} from "@/lib/sharing/model";

const article = {
  id: 27,
  type: "article" as const,
  slug: "late-night-letter",
  title: "凌晨四点",
  content: "# 开头\n![夜色](/night.png) **有人** 留下了[一封信](https://example.com)。",
  createdAt: "2026-08-20T00:00:00.000Z",
  publishedAt: "2026-08-21T00:00:00.000Z",
  editedAt: "2026-08-22T00:00:00.000Z",
};

describe("sharing model", () => {
  it("accepts only existing post types", () => {
    expect(isSharePostType("article")).toBe(true);
    expect(isSharePostType("diary")).toBe(true);
    expect(isSharePostType("post")).toBe(false);
  });

  it("keeps article slugs and diary ids in canonical URLs", () => {
    expect(getCanonicalShareUrl(article)).toBe(
      "https://www.ourlittleage.com/articles/late-night-letter",
    );
    expect(getCanonicalShareUrl({ ...article, id: 131, type: "diary", slug: null })).toBe(
      "https://www.ourlittleage.com/diary/131",
    );
  });

  it("uses a Malaysian calendar date for an untitled diary", () => {
    expect(
      getShareTitle({
        ...article,
        type: "diary",
        title: null,
        publishedAt: "2026-08-24T16:30:00.000Z",
      }),
    ).toBe("2026年8月25日的日记");
  });

  it("removes Markdown media and keeps readable link text", () => {
    expect(stripMarkdownForShare(article.content)).toBe("开头 有人 留下了一封信。");
  });

  it("truncates excerpts without leaving trailing whitespace", () => {
    expect(getShareExcerpt("第一段   第二段 第三段", 8)).toBe("第一段 第二段…");
  });

  it("uses edited, published, then created time as cache version", () => {
    expect(getShareVersion(article)).toBe("2026-08-22T00:00:00.000Z");
    expect(getShareVersion({ ...article, editedAt: null })).toBe(
      "2026-08-21T00:00:00.000Z",
    );
    expect(getShareVersion({ ...article, editedAt: null, publishedAt: null })).toBe(
      "2026-08-20T00:00:00.000Z",
    );
  });
});
```

- [ ] **Step 2: Run the model test and confirm the missing-module failure**

Run: `npm test -- lib/sharing/model.test.ts`

Expected: FAIL because `@/lib/sharing/model` does not exist.

- [ ] **Step 3: Implement the shared model**

```ts
import { SITE_URL } from "@/lib/site";

export type SharePostType = "article" | "diary";

export type ShareSourcePost = {
  id: number;
  type: SharePostType;
  slug: string | null;
  title: string | null;
  content: string | null;
  createdAt: string;
  publishedAt: string | null;
  editedAt: string | null;
};

export function isSharePostType(value: string): value is SharePostType {
  return value === "article" || value === "diary";
}

export function getCanonicalShareUrl(post: Pick<ShareSourcePost, "id" | "type" | "slug">) {
  if (post.type === "article") {
    if (!post.slug) throw new Error("A public article needs a slug to be shared.");
    return `${SITE_URL}/articles/${encodeURIComponent(post.slug)}`;
  }
  return `${SITE_URL}/diary/${post.id}`;
}

export function getShareTitle(post: ShareSourcePost) {
  const title = post.title?.trim();
  if (title) return title;
  if (post.type === "article") return "无标题文章";
  const date = new Date(post.publishedAt || post.createdAt);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(date);
  return `${parts}的日记`;
}

export function stripMarkdownForShare(value: string | null) {
  return (value || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/(^|\s)[#>*_`~\-]+/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getShareExcerpt(value: string | null, maxLength = 180) {
  const plain = stripMarkdownForShare(value);
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

export function getShareVersion(post: Pick<ShareSourcePost, "editedAt" | "publishedAt" | "createdAt">) {
  return post.editedAt || post.publishedAt || post.createdAt;
}
```

- [ ] **Step 4: Run the model test and type-check the file**

Run: `npm test -- lib/sharing/model.test.ts`

Expected: PASS with 6 tests.

- [ ] **Step 5: Commit the model**

```bash
git add lib/sharing/model.ts lib/sharing/model.test.ts
git commit -m "feat: add public sharing model"
```

---

### Task 2: Server Public-Content Gate

**Files:**
- Create: `lib/server/share-card.ts`
- Create: `lib/server/share-card.test.ts`

**Interfaces:**
- Consumes: `SharePostType`, `ShareSourcePost`, `getCanonicalShareUrl`, `getShareExcerpt`, and `getShareTitle` from Task 1; `supabaseAdmin` from `lib/supabase-admin.ts`.
- Produces: `ShareCardData` and `loadPublicShareCardData(type, id)` returning `Promise<ShareCardData | null>`.

- [ ] **Step 1: Write failing public/private loader tests**

Create a hoisted Supabase mock whose post query exposes `select`, `eq`, `is`, and `maybeSingle`, and whose profile query exposes `select`, `eq`, and `maybeSingle`. Assert all four public constraints and the sanitized result:

```ts
expect(postQuery.eq).toHaveBeenCalledWith("type", "article");
expect(postQuery.eq).toHaveBeenCalledWith("status", "published");
expect(postQuery.eq).toHaveBeenCalledWith("visibility", "public");
expect(postQuery.is).toHaveBeenCalledWith("deleted_at", null);
expect(result).toMatchObject({
  id: 27,
  type: "article",
  title: "凌晨四点",
  authorName: "小雨",
  canonicalUrl: "https://www.ourlittleage.com/articles/late-night-letter",
});
expect(result?.excerpt).not.toContain("![");
```

Add separate cases where the post lookup returns `null`, the path type does not match, the id is not a positive integer, and the profile is missing. The first three return `null`; the missing profile uses `已离开的居民`.

- [ ] **Step 2: Run the loader test and confirm it fails**

Run: `npm test -- lib/server/share-card.test.ts`

Expected: FAIL because `loadPublicShareCardData` does not exist.

- [ ] **Step 3: Implement the server-only loader**

```ts
import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getCanonicalShareUrl,
  getShareExcerpt,
  getShareTitle,
  type SharePostType,
  type ShareSourcePost,
} from "@/lib/sharing/model";

export type ShareCardData = {
  id: number;
  type: SharePostType;
  title: string;
  excerpt: string;
  authorName: string;
  canonicalUrl: string;
};

export async function loadPublicShareCardData(type: SharePostType, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return null;

  const { data: post } = await supabaseAdmin
    .from("posts")
    .select("id, type, slug, title, content, author_id, created_at, published_at, edited_at")
    .eq("id", id)
    .eq("type", type)
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .maybeSingle();

  if (!post || post.type !== type) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", post.author_id)
    .maybeSingle();

  const source: ShareSourcePost = {
    id: Number(post.id),
    type,
    slug: post.slug,
    title: post.title,
    content: post.content,
    createdAt: post.created_at,
    publishedAt: post.published_at,
    editedAt: post.edited_at,
  };

  return {
    id: source.id,
    type,
    title: getShareTitle(source),
    excerpt: getShareExcerpt(source.content),
    authorName: profile?.username?.trim() || "已离开的居民",
    canonicalUrl: getCanonicalShareUrl(source),
  } satisfies ShareCardData;
}
```

- [ ] **Step 4: Run loader tests**

Run: `npm test -- lib/server/share-card.test.ts`

Expected: PASS for public, absent/non-shareable, invalid id, type mismatch, and missing-profile cases.

- [ ] **Step 5: Commit the public-content gate**

```bash
git add lib/server/share-card.ts lib/server/share-card.test.ts
git commit -m "feat: gate share cards to public content"
```

---

### Task 3: 9:16 Story Image Route

**Files:**
- Create: `lib/server/share-card-image.tsx`
- Create: `app/api/share-card/[type]/[id]/route.ts`
- Create: `app/api/share-card/[type]/[id]/route.test.ts`

**Interfaces:**
- Consumes: `ShareCardData` and `loadPublicShareCardData(type, id)` from Task 2; `isSharePostType(value)` from Task 1.
- Produces: `renderShareCardImage(data): ImageResponse` and `GET(request, context): Promise<Response>`.

- [ ] **Step 1: Write failing route tests**

Mock the loader and renderer before importing the route. Cover valid output, unsupported type, malformed id, and a loader miss:

```ts
it("returns a cached PNG for public content", async () => {
  loadPublicShareCardData.mockResolvedValue(publicCard);
  renderShareCardImage.mockReturnValue(
    new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { "content-type": "image/png" },
    }),
  );

  const response = await GET(new Request("https://example.test/api/share-card/article/27"), {
    params: Promise.resolve({ type: "article", id: "27" }),
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/png");
  expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
  expect(loadPublicShareCardData).toHaveBeenCalledWith("article", 27);
});

it.each([
  [{ type: "post", id: "27" }],
  [{ type: "article", id: "0" }],
  [{ type: "diary", id: "not-a-number" }],
])("returns the same 404 for an invalid path", async ([params]) => {
  const response = await GET(new Request("https://example.test"), {
    params: Promise.resolve(params),
  });
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("");
});
```

The loader-miss test must assert the same empty `404` and that the renderer is not called.

- [ ] **Step 2: Run route tests and confirm they fail**

Run: `npm test -- app/api/share-card/[type]/[id]/route.test.ts`

Expected: FAIL because the route and renderer do not exist.

- [ ] **Step 3: Implement the Story renderer**

Use `ImageResponse` from `next/og` with `width: 1080` and `height: 1920`. Build one flex tree with inline styles only: black base, two low-opacity purple radial gradients, a small open-book mark and `小时代`, `文章`/`日记` eyebrow, title capped at three lines, author line, excerpt capped with `lineClamp: 6`, and the canonical path at the bottom. Do not pass `content`, notes, profile ids, or any administrative data into the renderer.

```tsx
export function renderShareCardImage(data: ShareCardData) {
  const path = new URL(data.canonicalUrl).pathname;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#030304", color: "#f7f4ff", padding: "104px 92px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 30, color: "rgba(255,255,255,.62)" }}>
          <span>▱</span><span>小时代</span>
        </div>
        <div style={{ marginTop: 190, fontSize: 24, letterSpacing: 8, color: "rgba(216,201,255,.55)" }}>
          {data.type === "article" ? "文章故事" : "深夜日记"}
        </div>
        <div style={{ marginTop: 38, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden", fontSize: 76, lineHeight: 1.28, fontWeight: 400 }}>
          {data.title}
        </div>
        <div style={{ marginTop: 34, fontSize: 29, color: "rgba(255,255,255,.5)" }}>由 {data.authorName} 留下</div>
        <div style={{ marginTop: 96, width: 116, height: 2, background: "rgba(195,166,255,.45)" }} />
        <div style={{ marginTop: 54, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 6, overflow: "hidden", fontSize: 38, lineHeight: 1.75, color: "rgba(255,255,255,.72)" }}>
          {data.excerpt || "这一页的故事，正安静地留在小时代。"}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 24, color: "rgba(255,255,255,.34)" }}>
        <span>ourlittleage.com</span><span>{path}</span>
      </div>
    </div>,
    { width: 1080, height: 1920 },
  );
}
```

- [ ] **Step 4: Implement validation, uniform 404, and cache headers in the route**

```ts
export async function GET(_request: Request, { params }: RouteContext) {
  const { type, id: rawId } = await params;
  const id = Number(rawId);
  if (!isSharePostType(type) || !Number.isSafeInteger(id) || id < 1) {
    return new Response(null, { status: 404 });
  }
  const data = await loadPublicShareCardData(type, id);
  if (!data) return new Response(null, { status: 404 });
  const response = renderShareCardImage(data);
  response.headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
  );
  return response;
}
```

- [ ] **Step 5: Run route and model/server tests**

Run: `npm test -- lib/sharing/model.test.ts lib/server/share-card.test.ts app/api/share-card/[type]/[id]/route.test.ts`

Expected: PASS, with invalid and unavailable content returning indistinguishable empty `404` responses.

- [ ] **Step 6: Commit the Story endpoint**

```bash
git add lib/server/share-card-image.tsx app/api/share-card/[type]/[id]/route.ts app/api/share-card/[type]/[id]/route.test.ts
git commit -m "feat: render public story share cards"
```

---

### Task 4: Client Share Commands and Accessible Panel

**Files:**
- Create: `lib/sharing/client.ts`
- Create: `lib/sharing/client.test.ts`
- Create: `components/share/ShareButton.tsx`
- Create: `components/share/ShareSheet.tsx`
- Create: `components/share/ShareSheet.test.tsx`

**Interfaces:**
- Consumes: `SharePostType` from Task 1 and the image URL `/api/share-card/{type}/{id}?v={encodedVersion}` from Task 3.
- Produces: `copyShareText(text)`, `shareLink(input)`, `loadStoryFile(url, filename)`, `shareStoryFile(input)`, `downloadStoryFile(file)`, and default `ShareButton` with props `{ postId, postType, title, canonicalUrl, version, isPublic, isOwner, mobileFullWidth? }`.

- [ ] **Step 1: Write failing browser-helper tests**

Test these exact outcomes:

```ts
expect(await copyShareText("https://example.test/story")).toBe(true);
expect(await shareLink({ title: "凌晨四点", url })).toBe("shared");
expect(await shareLink({ title: "凌晨四点", url })).toBe("cancelled");
expect(await shareLink({ title: "凌晨四点", url })).toBe("unsupported");
expect(await shareStoryFile({ file, title: "凌晨四点", url })).toBe("shared");
expect(await shareStoryFile({ file, title: "凌晨四点", url })).toBe("unsupported");
```

Mock `navigator.clipboard.writeText`, `navigator.share`, and `navigator.canShare`. Make `navigator.share` reject with `Object.assign(new Error(), { name: "AbortError" })` for the cancellation case. For Clipboard absence, spy on `document.execCommand("copy")` and assert the temporary textarea is removed.

- [ ] **Step 2: Run helper tests and confirm they fail**

Run: `npm test -- lib/sharing/client.test.ts`

Expected: FAIL because the browser helper module does not exist.

- [ ] **Step 3: Implement browser helpers**

```ts
export type ShareOutcome = "shared" | "cancelled" | "unsupported" | "failed";

export async function copyShareText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

export async function shareLink({ title, url }: { title: string; url: string }): Promise<ShareOutcome> {
  if (!navigator.share) return "unsupported";
  try {
    await navigator.share({ title, text: `在小时代读到：${title}`, url });
    return "shared";
  } catch (error) {
    return error instanceof Error && error.name === "AbortError" ? "cancelled" : "failed";
  }
}

export async function loadStoryFile(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("share-card-unavailable");
  return new File([await response.blob()], filename, { type: "image/png" });
}

export async function shareStoryFile({ file, title, url }: { file: File; title: string; url: string }): Promise<ShareOutcome> {
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) return "unsupported";
  try {
    await navigator.share({ files: [file], title, text: `在小时代读到：${title}\n${url}` });
    return "shared";
  } catch (error) {
    return error instanceof Error && error.name === "AbortError" ? "cancelled" : "failed";
  }
}

export function downloadStoryFile(file: File) {
  const href = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(href);
}
```

- [ ] **Step 4: Run helper tests**

Run: `npm test -- lib/sharing/client.test.ts`

Expected: PASS for Clipboard, fallback copy, native link share, file share, unsupported, cancellation, and failure paths.

- [ ] **Step 5: Write failing ShareButton and ShareSheet component tests**

Render a public trigger, click it, and assert a dialog named `分享这篇故事` appears. Assert the dialog receives focus, `document.body.style.overflow` becomes `hidden`, Escape closes it, and focus returns to the trigger. Add tests that:

```tsx
expect(screen.getByRole("button", { name: "复制链接" })).toBeEnabled();
expect(screen.getByRole("button", { name: "分享到其他应用" })).toBeEnabled();
expect(await screen.findByAltText("凌晨四点 Story 分享图预览")).toBeVisible();
expect(screen.getByRole("button", { name: "分享 Story 图片" })).toBeEnabled();
```

Mock the helpers to verify copy success shows `链接已经复制。`, `cancelled` produces no error, unsupported file share exposes `下载 Story 图片`, and an image fetch failure leaves copy and link sharing enabled. Render `isPublic={false}` with `isOwner={true}` and assert a disabled `公开后可分享` button with no dialog.

- [ ] **Step 6: Run component tests and confirm they fail**

Run: `npm test -- components/share/ShareSheet.test.tsx`

Expected: FAIL because the share components do not exist.

- [ ] **Step 7: Implement ShareButton and ShareSheet**

Use Lucide `Share2`, `Copy`, `Send`, `Download`, and `X`. `ShareButton` owns only `open` state and passes a versioned image URL to the sheet:

```tsx
const imageUrl = `/api/share-card/${postType}/${postId}?v=${encodeURIComponent(version)}`;
```

The trigger uses `w-full md:w-auto` only when `mobileFullWidth` is true. The sheet root is a fixed overlay with `role="dialog"`, `aria-modal="true"`, `aria-labelledby="share-sheet-title"`; use `items-end` and rounded top corners on mobile, then `md:items-center` and a compact `md:max-w-xl` centered surface. On mount, store and lock `document.body.style.overflow`, focus the close button, fetch the Story file, and attach a `keydown` listener for Escape. Cleanup restores overflow and trigger focus.

Keep these state values explicit:

```ts
type CardState = "loading" | "ready" | "unavailable";
const [cardState, setCardState] = useState<CardState>("loading");
const [storyFile, setStoryFile] = useState<File | null>(null);
const [message, setMessage] = useState("");
```

The preview uses the route URL in an `aspect-[9/16]` frame. `分享 Story 图片` calls `shareStoryFile`; on `unsupported`, show the download command and explain that the device can still save the image and copy the link. `下载 Story 图片` calls `downloadStoryFile(storyFile)` then `copyShareText(canonicalUrl)`. A cancelled share leaves `message` empty. Do not close the panel on failed or unsupported operations.

- [ ] **Step 8: Run all client sharing tests**

Run: `npm test -- lib/sharing/client.test.ts components/share/ShareSheet.test.tsx`

Expected: PASS with no unhandled promise rejection and restored body overflow/focus after each test.

- [ ] **Step 9: Commit the client sharing surface**

```bash
git add lib/sharing/client.ts lib/sharing/client.test.ts components/share/ShareButton.tsx components/share/ShareSheet.tsx components/share/ShareSheet.test.tsx
git commit -m "feat: add accessible content share sheet"
```

---

### Task 5: Article Detail Integration

**Files:**
- Modify: `components/articles/ArticleDetailClient.tsx:167-358`
- Modify: `components/articles/ArticleDetailClient.test.tsx`

**Interfaces:**
- Consumes: `ShareButton` from Task 4 and `getCanonicalShareUrl`, `getShareTitle`, `getShareVersion` from Task 1.
- Produces: the confirmed article owner/visitor mobile grids while preserving existing Like, Report, Edit, Back, comments, and desktop behavior.

- [ ] **Step 1: Extend article tests for the four visibility/ownership cases**

Mock `ShareButton` as a button exposing `data-mobile-full`, `data-public`, and `disabled`. Replace the existing two expectations with:

```ts
it("gives a public owner equal like and share columns", async () => {
  render(<ArticleDetailClient initialArticle={article} />);
  expect(await screen.findByTestId("article-actions")).toHaveClass("grid-cols-2");
  expect(screen.getByTestId("article-like")).toBeVisible();
  expect(screen.getByTestId("article-share")).toBeEnabled();
  expect(screen.getByRole("link", { name: "编辑文章" })).toHaveClass("col-span-full");
});

it("gives a public visitor like, share and report thirds", async () => {
  authState.userId = "visitor";
  render(<ArticleDetailClient initialArticle={article} />);
  expect(await screen.findByTestId("article-actions")).toHaveClass("grid-cols-3");
  expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(
    expect.arrayContaining(["喜欢", "分享", "举报"]),
  );
});

it("shows a disabled share action to an owner of unlisted content", async () => {
  render(<ArticleDetailClient initialArticle={{ ...article, visibility: "unlisted" }} />);
  expect(await screen.findByRole("button", { name: "公开后可分享" })).toBeDisabled();
});

it("hides share and keeps two columns for an unlisted visitor", async () => {
  authState.userId = "visitor";
  render(<ArticleDetailClient initialArticle={{ ...article, visibility: "unlisted" }} />);
  expect(await screen.findByTestId("article-actions")).toHaveClass("grid-cols-2");
  expect(screen.queryByTestId("article-share")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run article tests and confirm the new cases fail**

Run: `npm test -- components/articles/ArticleDetailClient.test.tsx`

Expected: FAIL because no share trigger exists and the current grids are one/two columns.

- [ ] **Step 3: Compute article share data and update the action grid**

Build a `ShareSourcePost` from the loaded article, then derive:

```ts
const isPublic = article.status === "published" && article.visibility === "public";
const shareSource = {
  id: Number(article.id),
  type: "article" as const,
  slug: article.slug,
  title: article.title,
  content: article.content,
  createdAt: article.created_at,
  publishedAt: article.published_at,
  editedAt: article.edited_at,
};
```

Give the action grid `data-testid="article-actions"` and use `grid-cols-2` for owner or unlisted visitor, `grid-cols-3` for public visitor. Render `ShareButton` between Like and Report when `isPublic`; render it disabled for a non-public owner; render nothing for a non-public visitor. Give the owner Edit link `col-span-full md:col-auto`. Keep the outer `md:flex md:items-center md:justify-between` and existing Back button unchanged.

- [ ] **Step 4: Run article and existing button tests**

Run: `npm test -- components/articles/ArticleDetailClient.test.tsx components/LikeButton.test.tsx components/ReportButton.test.tsx`

Expected: PASS; Like and Report continue receiving `mobileFullWidth`.

- [ ] **Step 5: Commit article integration**

```bash
git add components/articles/ArticleDetailClient.tsx components/articles/ArticleDetailClient.test.tsx
git commit -m "feat: add sharing to article details"
```

---

### Task 6: Diary Detail Integration

**Files:**
- Modify: `app/diary/[id]/page.tsx:151-318`
- Create: `app/diary/[id]/page.test.tsx`

**Interfaces:**
- Consumes: the same `ShareButton` and model helpers used by Task 5.
- Produces: matching diary owner/visitor layouts without changing `/diary/[id]`, its visibility rules, comments, or edit route.

- [ ] **Step 1: Write failing diary action-layout tests**

Mock `next/navigation`, `TranslatedMarkdown`, `PostComments`, Like, Report, Share, and the existing Supabase fluent queries. Return one diary plus profile/like/comment results. Cover:

```ts
expect(await screen.findByTestId("diary-actions")).toHaveClass("grid-cols-2");
expect(screen.getByTestId("diary-share")).toBeEnabled();
expect(screen.getByRole("link", { name: "编辑日记" })).toHaveClass("col-span-full");
```

for a public owner; `grid-cols-3` and ordered Like/Share/Report for a public visitor; disabled `公开后可分享` for an unlisted owner; and `grid-cols-2` with no share for an unlisted visitor.

- [ ] **Step 2: Run diary tests and confirm they fail**

Run: `npm test -- app/diary/[id]/page.test.tsx`

Expected: FAIL because the diary page has no share action or `diary-actions` test id.

- [ ] **Step 3: Compute diary share data and update the grid**

Use `isPublic = diary.status === "published" && diary.visibility === "public"`; build the source with `type: "diary"`, `slug: null`, and existing timestamps. Render Share between Like and Report under the same public/owner rules as Task 5. Give Edit `col-span-full md:col-auto`, retain `/diary/${diary.id}/edit`, retain `/space/diaries`, and leave `canComment` unchanged.

- [ ] **Step 4: Run article, diary, Like, and Report tests together**

Run: `npm test -- app/diary/[id]/page.test.tsx components/articles/ArticleDetailClient.test.tsx components/LikeButton.test.tsx components/ReportButton.test.tsx`

Expected: PASS for all owner, visitor, public, and unlisted combinations.

- [ ] **Step 5: Commit diary integration**

```bash
git add app/diary/[id]/page.tsx app/diary/[id]/page.test.tsx
git commit -m "feat: add sharing to diary details"
```

---

### Task 7: Full Verification and Visual Checks

**Files:**
- Modify only if verification exposes a share-feature defect: files introduced or integrated in Tasks 1-6.

**Interfaces:**
- Consumes: the complete sharing flow.
- Produces: test, build, route-security, responsive-layout, and Story-image evidence.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`

Expected: PASS with no regressions in notifications, comments, reports, feedback, sponsorships, articles, or diaries.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint`

Expected: exit 0 with no new lint errors.

Run: `npm run build`

Expected: exit 0 and the route list includes `/api/share-card/[type]/[id]`.

- [ ] **Step 3: Verify route security against real local data**

Start or reuse the local dev server. Request one known public article and one known public diary; save each response temporarily and inspect headers/dimensions. Each response must be `200`, `image/png`, and exactly 1080x1920 with non-zero visual pixels. Request a known unlisted/private/draft/deleted record or temporarily use an id proven non-public; every response must be an empty `404`, never JSON revealing the reason.

- [ ] **Step 4: Visually inspect Story cards**

Open the two PNGs at original resolution and verify: Chinese glyphs render, title is at most three lines, excerpt is at most six lines, author and route fit, there is no notes/admin text, the black/purple design remains readable, and neither short nor long content leaves overlapping elements. If the deployed `ImageResponse` runtime lacks Chinese glyphs, add one locally licensed CJK font file to `assets/fonts`, load its bytes in `share-card-image.tsx`, pass it through the `fonts` option, rerun the route test/build, and record the font license beside the asset.

- [ ] **Step 5: Verify responsive action layouts**

At 400x858, inspect owner public article and diary: Like/Share 50/50, Edit full row, Back full row. Inspect visitor public: Like/Share/Report equal thirds in that order. Inspect owner unlisted: disabled `公开后可分享`. Inspect visitor unlisted: no Share and Like/Report 50/50. At desktop width, confirm the controls are compact and Edit/Back placement remains unchanged.

- [ ] **Step 6: Verify real interaction paths**

In desktop Chrome, verify Copy Link, link-share fallback, Story preview, and Download. On an HTTPS real mobile device that supports Web Share files, verify the native share sheet receives one PNG plus the story title/text. Cancel once and confirm no error message appears. Repeat on a browser without file sharing and confirm Download remains available and the canonical link is copied.

- [ ] **Step 7: Review the final diff and commit verification fixes**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intentional share-feature files are modified. If Step 3-6 required corrections, commit only those corrections:

```bash
git add lib/sharing lib/server/share-card.ts lib/server/share-card-image.tsx app/api/share-card components/share components/articles/ArticleDetailClient.tsx components/articles/ArticleDetailClient.test.tsx app/diary/[id]/page.tsx app/diary/[id]/page.test.tsx
git commit -m "fix: finish public sharing verification"
```

Do not push unless the user explicitly requests it after reviewing the completed implementation.
