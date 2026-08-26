import { beforeEach, describe, expect, it, vi } from "vitest";

const { postQuery, profileQuery, from } = vi.hoisted(() => {
  const postQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };

  return {
    postQuery,
    profileQuery,
    from: vi.fn((table: string) => (table === "posts" ? postQuery : profileQuery)),
  };
});

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from } }));

import { loadPublicShareCardData } from "./share-card";

const publicArticle = {
  id: 27,
  type: "article",
  slug: "late-night-letter",
  title: "凌晨四点",
  content: "![封面](https://example.com/cover.png)\n\n窗外的雨还没有停。",
  author_id: "resident-1",
  created_at: "2026-08-01T20:00:00.000Z",
  published_at: "2026-08-02T20:00:00.000Z",
  edited_at: null,
};

function configureQueryChains() {
  postQuery.select.mockReturnValue(postQuery);
  postQuery.eq.mockReturnValue(postQuery);
  postQuery.is.mockReturnValue(postQuery);
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);
}

describe("loadPublicShareCardData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureQueryChains();
    postQuery.maybeSingle.mockResolvedValue({ data: publicArticle });
    profileQuery.maybeSingle.mockResolvedValue({ data: { username: "小雨" } });
  });

  it("returns sanitized data only after querying for a public published post", async () => {
    const result = await loadPublicShareCardData("article", 27);

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
  });

  it("returns null when no shareable post is found", async () => {
    postQuery.maybeSingle.mockResolvedValue({ data: null });

    await expect(loadPublicShareCardData("article", 27)).resolves.toBeNull();
  });

  it("returns null when the post type does not match the requested path", async () => {
    postQuery.maybeSingle.mockResolvedValue({ data: { ...publicArticle, type: "diary" } });

    await expect(loadPublicShareCardData("article", 27)).resolves.toBeNull();
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "returns null before querying for an unsafe or non-positive id of %s",
    async (id) => {
      await expect(loadPublicShareCardData("article", id)).resolves.toBeNull();
      expect(from).not.toHaveBeenCalled();
    }
  );

  it("uses the departed-resident name when the author profile is missing", async () => {
    profileQuery.maybeSingle.mockResolvedValue({ data: null });

    await expect(loadPublicShareCardData("article", 27)).resolves.toMatchObject({
      authorName: "已离开的居民",
    });
  });
});
