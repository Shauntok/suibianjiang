import { describe, expect, it, vi } from "vitest";

import { cleanupExpiredDeletedComments } from "./commentCleanup";

describe("cleanupExpiredDeletedComments", () => {
  it("hard deletes only comments soft-deleted for at least 30 days", async () => {
    const query = {
      eq: vi.fn(),
      not: vi.fn(),
      lte: vi.fn(),
    };
    query.eq.mockReturnValue(query);
    query.not.mockReturnValue(query);
    query.lte.mockResolvedValue({ count: 2, error: null });

    const deleteComments = vi.fn(() => query);
    const client = {
      from: vi.fn(() => ({ delete: deleteComments })),
    };

    const deleted = await cleanupExpiredDeletedComments(
      client,
      new Date("2026-08-26T00:00:00.000Z")
    );

    expect(client.from).toHaveBeenCalledWith("comments");
    expect(deleteComments).toHaveBeenCalledWith({ count: "exact" });
    expect(query.eq).toHaveBeenCalledWith("is_deleted", true);
    expect(query.not).toHaveBeenCalledWith("deleted_at", "is", null);
    expect(query.lte).toHaveBeenCalledWith(
      "deleted_at",
      "2026-07-27T00:00:00.000Z"
    );
    expect(deleted).toBe(2);
  });

  it("surfaces cleanup failures", async () => {
    const query = {
      eq: vi.fn(),
      not: vi.fn(),
      lte: vi.fn(),
    };
    query.eq.mockReturnValue(query);
    query.not.mockReturnValue(query);
    query.lte.mockResolvedValue({ count: null, error: new Error("cleanup failed") });

    const client = {
      from: vi.fn(() => ({ delete: vi.fn(() => query) })),
    };

    await expect(cleanupExpiredDeletedComments(client)).rejects.toThrow(
      "cleanup failed"
    );
  });
});
