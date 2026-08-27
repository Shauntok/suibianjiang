// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { renderShareCardImage } from "./share-card-image";

afterEach(() => vi.unstubAllGlobals());

it("renders a real Chinese 1080x1920 PNG without external font requests", async () => {
  const fetch = vi.fn((url: unknown) => Promise.reject(new Error(`External request: ${String(url).slice(0, 80)}`)));
  vi.stubGlobal("fetch", fetch);
  const response = await renderShareCardImage({
    id: 131, type: "diary", title: "凌晨四点，写给明天的一封信",
    authorName: "小雨", excerpt: "窗外的灯还亮着。我们把今天的故事留在这里，也给明天的自己留下一点希望。".repeat(4),
    canonicalUrl: "https://www.ourlittleage.com/diary/131",
  });
  const png = Buffer.from(await response.arrayBuffer());
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1920);
  expect(png.length).toBeGreaterThan(10000);
  // The bundled WASM loader may try a data URL before its local fallback.
  expect(fetch.mock.calls.every(([url]) => String(url).startsWith("data:"))).toBe(true);
  if (process.env.SHARE_CARD_TEST_OUTPUT) {
    await writeFile(process.env.SHARE_CARD_TEST_OUTPUT, png);
  }
}, 60000);
