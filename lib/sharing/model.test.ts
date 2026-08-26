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
