// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminActor: vi.fn(),
  listEffectivePostViewCounts: vi.fn(),
}));

vi.mock("@/lib/admin/authorization", () => ({
  getAdminActor: mocks.getAdminActor,
}));

vi.mock("@/lib/views/service", () => ({
  listEffectivePostViewCounts: mocks.listEffectivePostViewCounts,
}));

import { POST } from "./route";

describe("POST /api/admin/content/view-counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminActor.mockResolvedValue({ id: "owner-1", role: "owner" });
    mocks.listEffectivePostViewCounts.mockResolvedValue({
      140: 12438,
      141: 0,
    });
  });

  it("returns 401 when there is no authenticated actor", async () => {
    mocks.getAdminActor.mockResolvedValue(null);

    const response = await POST(request({ postIds: [140] }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expectNoStore(response);
    expect(mocks.listEffectivePostViewCounts).not.toHaveBeenCalled();
  });

  it.each(["user", "moderator"])(
    "returns 403 for the %s role",
    async (role) => {
      mocks.getAdminActor.mockResolvedValue({ id: `${role}-1`, role });

      const response = await POST(request({ postIds: [140] }));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Forbidden" });
      expectNoStore(response);
      expect(mocks.listEffectivePostViewCounts).not.toHaveBeenCalled();
    }
  );

  it.each(["owner", "admin"])(
    "returns one exact batch for the %s role",
    async (role) => {
      mocks.getAdminActor.mockResolvedValue({ id: `${role}-1`, role });

      const apiRequest = request({ postIds: [140, 141] });
      const response = await POST(apiRequest);

      expect(mocks.getAdminActor).toHaveBeenCalledOnce();
      expect(mocks.getAdminActor).toHaveBeenCalledWith(apiRequest);
      expect(mocks.listEffectivePostViewCounts).toHaveBeenCalledOnce();
      expect(mocks.listEffectivePostViewCounts).toHaveBeenCalledWith([
        140,
        141,
      ]);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        counts: { "140": 12438, "141": 0 },
      });
      expectNoStore(response);
    }
  );

  it.each([
    ["missing postIds", {}],
    ["extra property", { postIds: [140], extra: true }],
    ["empty batch", { postIds: [] }],
    ["duplicate IDs", { postIds: [140, 140] }],
    ["zero ID", { postIds: [0] }],
    ["negative ID", { postIds: [-1] }],
    ["fractional ID", { postIds: [1.5] }],
    ["unsafe ID", { postIds: [Number.MAX_SAFE_INTEGER + 1] }],
    ["string ID", { postIds: ["140"] }],
    [
      "over-200 batch",
      { postIds: Array.from({ length: 201 }, (_, index) => index + 1) },
    ],
  ])("returns 400 for %s", async (_name, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
    expectNoStore(response);
    expect(mocks.listEffectivePostViewCounts).not.toHaveBeenCalled();
  });

  it("returns a generic 400 for malformed JSON", async () => {
    const response = await POST(
      new Request("https://ourlittleage.test/api/admin/content/view-counts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
    expectNoStore(response);
  });

  it("does not expose service or database errors", async () => {
    mocks.listEffectivePostViewCounts.mockRejectedValue(
      new Error("private.post_view_stats RPC failed")
    );

    const response = await POST(request({ postIds: [140] }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Unable to load view counts" });
    expect(JSON.stringify(body)).not.toContain("post_view_stats");
    expect(JSON.stringify(body)).not.toContain("RPC");
    expectNoStore(response);
  });
});

function request(body: unknown) {
  return new Request(
    "https://ourlittleage.test/api/admin/content/view-counts",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}
