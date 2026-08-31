import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { rpc },
}));

import {
  listEffectivePostViewCounts,
  recordEffectivePostView,
} from "./service";

const viewerHash = "a".repeat(64);

describe("recordEffectivePostView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it("calls the record RPC with the exact server contract", async () => {
    await recordEffectivePostView({
      postId: 140,
      viewerHash,
      userId: null,
      countedAt: new Date("2026-08-29T12:00:00.000Z"),
    });

    expect(rpc).toHaveBeenCalledWith("record_effective_post_view", {
      p_post_id: 140,
      p_viewer_hash: viewerHash,
      p_user_id: null,
      p_counted_at: "2026-08-29T12:00:00.000Z",
    });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])(
    "rejects invalid post ID %s",
    async (postId) => {
      await expect(
        recordEffectivePostView({ postId, viewerHash, userId: null })
      ).rejects.toThrow(/post view input/i);
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it.each([
    "a".repeat(63),
    "a".repeat(65),
    "A".repeat(64),
    "g".repeat(64),
  ])("rejects malformed viewer hash %j", async (malformedHash) => {
    await expect(
      recordEffectivePostView({
        postId: 140,
        viewerHash: malformedHash,
        userId: null,
      })
    ).rejects.toThrow(/post view input/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid counted-at date", async () => {
    await expect(
      recordEffectivePostView({
        postId: 140,
        viewerHash,
        userId: null,
        countedAt: new Date("invalid"),
      })
    ).rejects.toThrow(/post view input/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not expose raw Supabase record errors", async () => {
    const databaseError = new Error(
      "private.post_view_stats record_effective_post_view failed"
    );
    rpc.mockResolvedValue({ data: null, error: databaseError });

    let thrown: unknown;
    try {
      await recordEffectivePostView({ postId: 140, viewerHash, userId: null });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBe(databaseError);
    expect(String(thrown)).not.toContain("post_view_stats");
    expect(String(thrown)).not.toContain("record_effective_post_view");
  });
});

describe("listEffectivePostViewCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({
      data: [
        { post_id: 140, view_count: 1234 },
        { post_id: 141, view_count: 0 },
      ],
      error: null,
    });
  });

  it("returns a complete map from the exact batch RPC contract", async () => {
    await expect(listEffectivePostViewCounts([140, 141])).resolves.toEqual({
      140: 1234,
      141: 0,
    });
    expect(rpc).toHaveBeenCalledWith("get_effective_post_view_counts", {
      p_post_ids: [140, 141],
    });
  });

  it("returns an empty map without an RPC for an empty batch", async () => {
    await expect(listEffectivePostViewCounts([])).resolves.toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { postIds: [0] },
    { postIds: [-1] },
    { postIds: [1.5] },
    { postIds: [Number.MAX_SAFE_INTEGER + 1] },
  ])(
    "rejects invalid batch IDs %j",
    async ({ postIds }) => {
      await expect(listEffectivePostViewCounts(postIds)).rejects.toThrow(
        /post ID batch/i
      );
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it("rejects more than 200 IDs", async () => {
    const postIds = Array.from({ length: 201 }, (_, index) => index + 1);

    await expect(listEffectivePostViewCounts(postIds)).rejects.toThrow(
      /post ID batch/i
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects duplicate input IDs", async () => {
    await expect(listEffectivePostViewCounts([140, 140])).rejects.toThrow(
      /duplicate/i
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["negative count", [{ post_id: 140, view_count: -1 }]],
    ["fractional count", [{ post_id: 140, view_count: 1.5 }]],
    ["unsafe count", [{ post_id: 140, view_count: Number.MAX_SAFE_INTEGER + 1 }]],
    ["string count", [{ post_id: 140, view_count: "1" }]],
    ["non-positive ID", [{ post_id: 0, view_count: 1 }]],
    ["fractional ID", [{ post_id: 140.5, view_count: 1 }]],
    ["unsafe ID", [{ post_id: Number.MAX_SAFE_INTEGER + 1, view_count: 1 }]],
    ["string ID", [{ post_id: "140", view_count: 1 }]],
  ])("rejects a malformed RPC row: %s", async (_name, data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(listEffectivePostViewCounts([140])).rejects.toThrow(
      /view count response/i
    );
  });

  it("rejects missing RPC rows", async () => {
    rpc.mockResolvedValue({
      data: [{ post_id: 140, view_count: 1 }],
      error: null,
    });

    await expect(listEffectivePostViewCounts([140, 141])).rejects.toThrow(
      /incomplete/i
    );
  });

  it("rejects unexpected RPC rows", async () => {
    rpc.mockResolvedValue({
      data: [
        { post_id: 140, view_count: 1 },
        { post_id: 142, view_count: 1 },
      ],
      error: null,
    });

    await expect(listEffectivePostViewCounts([140])).rejects.toThrow(
      /unexpected/i
    );
  });

  it("rejects duplicate RPC rows", async () => {
    rpc.mockResolvedValue({
      data: [
        { post_id: 140, view_count: 1 },
        { post_id: 140, view_count: 1 },
      ],
      error: null,
    });

    await expect(listEffectivePostViewCounts([140])).rejects.toThrow(
      /duplicate/i
    );
  });

  it("does not expose raw Supabase batch errors", async () => {
    const databaseError = new Error(
      "private.post_view_stats get_effective_post_view_counts failed"
    );
    rpc.mockResolvedValue({ data: null, error: databaseError });

    let thrown: unknown;
    try {
      await listEffectivePostViewCounts([140, 141]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBe(databaseError);
    expect(String(thrown)).not.toContain("post_view_stats");
    expect(String(thrown)).not.toContain("get_effective_post_view_counts");
  });
});
