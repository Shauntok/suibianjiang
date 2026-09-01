import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  listEffectivePostViewCounts: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

vi.mock("@/lib/views/service", () => ({
  listEffectivePostViewCounts: mocks.listEffectivePostViewCounts,
}));

import { getUserTotalEffectiveViewCount } from "./user-total";

const authorId = "973ca71a-0b4b-4756-82b7-75062e22df9a";

describe("getUserTotalEffectiveViewCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero without reading view stats when the resident has no works", async () => {
    const query = postsQuery([{ data: [], error: null }]);
    mocks.from.mockReturnValue(query.builder);

    await expect(getUserTotalEffectiveViewCount(authorId)).resolves.toBe(0);

    expect(mocks.from).toHaveBeenCalledWith("posts");
    expect(query.eq).toHaveBeenCalledWith("author_id", authorId);
    expect(query.inValues).toHaveBeenCalledWith("type", ["article", "diary"]);
    expect(query.isNull).toHaveBeenCalledWith("deleted_at", null);
    expect(mocks.listEffectivePostViewCounts).not.toHaveBeenCalled();
  });

  it("paginates works, batches view reads, and returns one exact safe total", async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      id: index + 1,
    }));
    const secondPage = [{ id: 1_001 }];
    const query = postsQuery([
      { data: firstPage, error: null },
      { data: secondPage, error: null },
    ]);
    mocks.from.mockReturnValue(query.builder);
    mocks.listEffectivePostViewCounts.mockImplementation(
      async (ids: number[]) =>
        Object.fromEntries(ids.map((id) => [id, id === 1_001 ? 25 : 1]))
    );

    await expect(getUserTotalEffectiveViewCount(authorId)).resolves.toBe(
      1_025
    );

    expect(query.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(query.range).toHaveBeenNthCalledWith(2, 1_000, 1_999);
    expect(mocks.listEffectivePostViewCounts).toHaveBeenCalledTimes(6);
    expect(mocks.listEffectivePostViewCounts.mock.calls[0][0]).toHaveLength(200);
    expect(mocks.listEffectivePostViewCounts.mock.calls[5][0]).toEqual([1_001]);
  });

  it("rejects an invalid resident id before querying the database", async () => {
    await expect(
      getUserTotalEffectiveViewCount("not-a-user-id")
    ).rejects.toThrow(/resident id/i);

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not expose raw post query errors", async () => {
    const query = postsQuery([
      {
        data: null,
        error: new Error("posts author_id database details"),
      },
    ]);
    mocks.from.mockReturnValue(query.builder);

    let thrown: unknown;
    try {
      await getUserTotalEffectiveViewCount(authorId);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).not.toContain("author_id");
    expect(String(thrown)).not.toContain("database details");
  });
});

function postsQuery(
  pages: Array<{ data: Array<{ id: number }> | null; error: unknown }>
) {
  const range = vi.fn();
  pages.forEach((page) => range.mockResolvedValueOnce(page));

  const order = vi.fn(() => ({ range }));
  const isNull = vi.fn(() => ({ order }));
  const inValues = vi.fn(() => ({ is: isNull }));
  const eq = vi.fn(() => ({ in: inValues }));
  const select = vi.fn(() => ({ eq }));

  return {
    builder: { select },
    eq,
    inValues,
    isNull,
    range,
  };
}
