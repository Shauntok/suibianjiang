import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionMissingError } from "@supabase/supabase-js";

const { getUser, recordEffectivePostView } = vi.hoisted(() => ({
  getUser: vi.fn(),
  recordEffectivePostView: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser },
  })),
}));

vi.mock("@/lib/views/service", () => ({
  recordEffectivePostView,
}));

import { POST } from "./route";

const secret = "0123456789abcdef0123456789abcdef";
const userId = "d0000000-0000-0000-0000-000000000002";
const validCookie = `${userId}.-W-CJJMy1HLzDgTAa3DbbWeWrDyzzefrX41uD6U9b78`;
const residentHash =
  "34e7ecb6f5106d4f56f94c3aec1e8f61e7d07e092068fef83c5bb5287568e80f";
const visitorHash =
  "b2477122adffb244f50664fcf34ec04b0b0f8c8e5247aa3796f81282b3dd2638";

describe("POST /api/post-views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VIEWER_ID_SECRET", secret);
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    recordEffectivePostView.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sets a secure anonymous cookie without revealing private state", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(sameOriginRequest({ postId: 140 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("ola_viewer=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=31536000");
    expect(recordEffectivePostView).toHaveBeenCalledWith({
      postId: 140,
      viewerHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      userId: null,
    });
  });

  it("does not mark a new anonymous cookie secure outside production", async () => {
    const response = await POST(sameOriginRequest({ postId: 140 }));

    expect(response.headers.get("set-cookie")).not.toContain("; Secure");
  });

  it("reuses a valid anonymous cookie without replacing it", async () => {
    const response = await POST(
      sameOriginRequest({ postId: 140 }, `ola_viewer=${validCookie}`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(recordEffectivePostView).toHaveBeenCalledWith({
      postId: 140,
      viewerHash: visitorHash,
      userId: null,
    });
  });

  it("uses authenticated identity instead of an anonymous cookie", async () => {
    getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });

    const response = await POST(
      sameOriginRequest({ postId: 140 }, "ola_viewer=attacker.cookie")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(recordEffectivePostView).toHaveBeenCalledWith({
      postId: 140,
      viewerHash: residentHash,
      userId,
    });
  });

  it("treats a missing auth session as anonymous", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });

    const response = await POST(sameOriginRequest({ postId: 140 }));

    expect(response.status).toBe(200);
    expect(recordEffectivePostView).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null })
    );
  });

  it("fails closed when authentication validation fails", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("authentication service unavailable"),
    });

    const response = await POST(sameOriginRequest({ postId: 140 }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Unable to record post view",
    });
    expect(recordEffectivePostView).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["mismatched", "https://elsewhere.test"],
  ])("rejects a %s Origin", async (_name, origin) => {
    const request = sameOriginRequest({ postId: 140 });
    if (origin === undefined) request.headers.delete("origin");
    else request.headers.set("origin", origin);

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invalid request" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getUser).not.toHaveBeenCalled();
    expect(recordEffectivePostView).not.toHaveBeenCalled();
  });

  it("rejects a wrong content type", async () => {
    const request = sameOriginRequest({ postId: 140 });
    request.headers.set("content-type", "text/plain");

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(recordEffectivePostView).not.toHaveBeenCalled();
  });

  it("rejects a body larger than 1 KiB", async () => {
    const response = await POST(
      sameOriginRequest({ postId: 140, padding: "x".repeat(1024) })
    );

    expect(response.status).toBe(413);
    expect(recordEffectivePostView).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    const response = await POST(rawSameOriginRequest("{"));

    expect(response.status).toBe(400);
    expect(recordEffectivePostView).not.toHaveBeenCalled();
  });

  it("rejects unknown body keys", async () => {
    const response = await POST(
      sameOriginRequest({ postId: 140, viewerHash: "a".repeat(64) })
    );

    expect(response.status).toBe(400);
    expect(recordEffectivePostView).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "140"])(
    "rejects invalid post ID %j",
    async (postId) => {
      const response = await POST(sameOriginRequest({ postId }));

      expect(response.status).toBe(400);
      expect(recordEffectivePostView).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, "short-secret"])(
    "fails generically when VIEWER_ID_SECRET is %s",
    async (configuredSecret) => {
      if (configuredSecret === undefined) {
        vi.stubEnv("VIEWER_ID_SECRET", "");
      } else {
        vi.stubEnv("VIEWER_ID_SECRET", configuredSecret);
      }

      const response = await POST(sameOriginRequest({ postId: 140 }));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "Unable to record post view",
      });
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(recordEffectivePostView).not.toHaveBeenCalled();
    }
  );

  it("returns a generic server error when recording fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    recordEffectivePostView.mockRejectedValue(
      new Error("private.post_view_stats record_effective_post_view failed")
    );

    const response = await POST(sameOriginRequest({ postId: 140 }));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ error: "Unable to record post view" });
    expect(body).not.toContain("post_view_stats");
    expect(body).not.toContain("record_effective_post_view");
  });
});

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

function rawSameOriginRequest(body: string) {
  return new Request("https://ourlittleage.test/api/post-views", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://ourlittleage.test",
    },
    body,
  });
}
