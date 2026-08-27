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

const cacheControl = "private, no-store";

describe("GET /api/share-card/[type]/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not cache a PNG that may later become private", async () => {
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
    expect(loadPublicShareCardData).toHaveBeenCalledWith("diary", 42);
    expect(renderShareCardImage).not.toHaveBeenCalled();
  });

  it("embeds the local CJK font in the image response", async () => {
    const fontData = new Uint8Array([78, 111, 116, 111]).buffer;
    const readFile = vi.fn().mockResolvedValueOnce(fontData).mockResolvedValueOnce(Buffer.from("icon"));
    const fetch = vi.fn();
    const imageResponse = vi.fn(function ImageResponse() {
      return new Response(null);
    });

    vi.doMock("node:fs/promises", () => ({
      default: { readFile },
      readFile,
    }));
    vi.doMock("next/og", () => ({ ImageResponse: imageResponse }));
    vi.stubGlobal("fetch", fetch);

    try {
      const { renderShareCardImage } =
        await vi.importActual<typeof import("@/lib/server/share-card-image")>(
          "@/lib/server/share-card-image",
        );

      await renderShareCardImage(publicCard);

      expect(readFile).toHaveBeenCalledTimes(2);
      const [fontPath] = readFile.mock.calls[0];
      expect(typeof fontPath).toBe("string");
      expect(fontPath.replaceAll("\\", "/")).toContain(
        "/assets/fonts/NotoSansSC-Regular.ttf",
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(imageResponse).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fonts: [
            expect.objectContaining({
              name: "Noto Sans SC",
              data: fontData,
              weight: 400,
              style: "normal",
            }),
          ],
        }),
      );
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("next/og");
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
