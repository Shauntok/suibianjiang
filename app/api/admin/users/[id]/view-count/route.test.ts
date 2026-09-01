// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminActor: vi.fn(),
  getUserTotalEffectiveViewCount: vi.fn(),
}));

vi.mock("@/lib/admin/authorization", () => ({
  getAdminActor: mocks.getAdminActor,
}));

vi.mock("@/lib/views/user-total", () => ({
  getUserTotalEffectiveViewCount: mocks.getUserTotalEffectiveViewCount,
}));

import { GET } from "./route";

const userId = "973ca71a-0b4b-4756-82b7-75062e22df9a";

describe("GET /api/admin/users/[id]/view-count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminActor.mockResolvedValue({ id: "owner-1", role: "owner" });
    mocks.getUserTotalEffectiveViewCount.mockResolvedValue(12_438);
  });

  it.each(["owner", "admin"])(
    "returns the resident total for the %s role",
    async (role) => {
      mocks.getAdminActor.mockResolvedValue({ id: `${role}-1`, role });
      const request = new Request("https://ourlittleage.test/api/admin/users/x/view-count");
      const response = await GET(request, context(userId));

      expect(mocks.getAdminActor).toHaveBeenCalledWith(request);
      expect(mocks.getUserTotalEffectiveViewCount).toHaveBeenCalledWith(userId);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ totalEffectiveViews: 12_438 });
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  );

  it("returns 401 without an authenticated actor", async () => {
    mocks.getAdminActor.mockResolvedValue(null);

    const response = await GET(
      new Request("https://ourlittleage.test/api/admin/users/x/view-count"),
      context(userId)
    );

    expect(response.status).toBe(401);
    expect(mocks.getUserTotalEffectiveViewCount).not.toHaveBeenCalled();
  });

  it.each(["user", "moderator"])("returns 403 for %s", async (role) => {
    mocks.getAdminActor.mockResolvedValue({ id: `${role}-1`, role });

    const response = await GET(
      new Request("https://ourlittleage.test/api/admin/users/x/view-count"),
      context(userId)
    );

    expect(response.status).toBe(403);
    expect(mocks.getUserTotalEffectiveViewCount).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid resident id", async () => {
    const response = await GET(
      new Request("https://ourlittleage.test/api/admin/users/x/view-count"),
      context("not-a-user-id")
    );

    expect(response.status).toBe(400);
    expect(mocks.getUserTotalEffectiveViewCount).not.toHaveBeenCalled();
  });

  it("returns a generic error without exposing private view details", async () => {
    mocks.getUserTotalEffectiveViewCount.mockRejectedValue(
      new Error("private.post_view_stats failed")
    );

    const response = await GET(
      new Request("https://ourlittleage.test/api/admin/users/x/view-count"),
      context(userId)
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Unable to load resident view total" });
    expect(JSON.stringify(body)).not.toContain("post_view_stats");
  });
});

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}
