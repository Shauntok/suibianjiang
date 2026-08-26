import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadPublicShareCardData, renderShareCardImage } = vi.hoisted(() => ({
  loadPublicShareCardData: vi.fn(),
  renderShareCardImage: vi.fn(),
}));

vi.mock("@/lib/server/share-card", () => ({ loadPublicShareCardData }));
vi.mock("@/lib/server/share-card-image", () => ({ renderShareCardImage }));

import { GET } from "./route";

const publicCard = {
  id: 27,
  type: "article" as const,
  title: "凌晨四点",
  excerpt: "窗外的雨还没有停。",
  authorName: "小雨",
  canonicalUrl: "https://www.ourlittleage.com/articles/late-night-letter",
};

const cacheControl =
  "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

describe("GET /api/share-card/[type]/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the rendered PNG with the exact public cache policy", async () => {
    loadPublicShareCardData.mockResolvedValue(publicCard);
    renderShareCardImage.mockReturnValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" },
      }),
    );

    const response = await GET(
      new Request("https://example.test/api/share-card/article/27"),
      { params: Promise.resolve({ type: "article", id: "27" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(response.headers.get("cache-control")).toBe(cacheControl);
    expect(loadPublicShareCardData).toHaveBeenCalledWith("article", 27);
    expect(renderShareCardImage).toHaveBeenCalledWith(publicCard);
  });

  it.each([
    { type: "post", id: "27" },
    { type: "article", id: "0" },
    { type: "article", id: "1.5" },
    { type: "article", id: "9007199254740992" },
    { type: "diary", id: "not-a-number" },
  ])("returns the same empty 404 for invalid path $type/$id", async (params) => {
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(loadPublicShareCardData).not.toHaveBeenCalled();
    expect(renderShareCardImage).not.toHaveBeenCalled();
  });

  it("returns the same empty 404 when public content is unavailable", async () => {
    loadPublicShareCardData.mockResolvedValue(null);

    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ type: "diary", id: "42" }),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(renderShareCardImage).not.toHaveBeenCalled();
  });
});
