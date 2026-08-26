import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UserRoomLoader from "@/components/UserRoomLoader";

const profile = {
  id: "resident-1",
  username: "系小卓呀",
  created_at: "2026-01-01T00:00:00.000Z",
  joined_at: "2026-01-01T00:00:00.000Z",
  level: 1,
  exp: 0,
  show_badges: true,
};

const postRows = [
  ...Array.from({ length: 11 }, (_, index) => ({
    id: index + 1,
    type: "diary",
  })),
  { id: 12, type: "article", title: "较新的文章" },
  { id: 13, type: "article", title: "较早的文章" },
];

function queryResult(data: unknown) {
  let resolvedData = data;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn((count: number) => {
      if (Array.isArray(resolvedData)) {
        resolvedData = resolvedData.slice(0, count);
      }
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data: resolvedData, error: null })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: resolvedData, error: null }).then(resolve),
  };

  return query;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "profiles") return queryResult(profile);
      if (table === "posts") return queryResult(postRows);
      return queryResult([]);
    }),
  },
}));

vi.mock("@/components/UserRoomClient", () => ({
  default: ({
    activeTab,
    publicArticles,
  }: {
    activeTab: string;
    publicArticles: unknown[];
  }) => (
    <div>
      <div data-testid="active-tab">{activeTab}</div>
      <div data-testid="article-count">{publicArticles.length}</div>
    </div>
  ),
}));

describe("UserRoomLoader", () => {
  it("uses the latest tab after the room data has loaded", async () => {
    const { rerender } = render(
      <UserRoomLoader username="系小卓呀" activeTab="all" />
    );

    await waitFor(() => {
      expect(screen.getByTestId("active-tab")).toHaveTextContent("all");
    });

    rerender(<UserRoomLoader username="系小卓呀" activeTab="article" />);

    expect(screen.getByTestId("active-tab")).toHaveTextContent("article");
  });

  it("does not drop older articles when diaries fill the first page", async () => {
    render(<UserRoomLoader username="系小卓呀" activeTab="article" />);

    await waitFor(() => {
      expect(screen.getByTestId("article-count")).toHaveTextContent("2");
    });
  });
});
