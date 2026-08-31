import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  from: vi.fn(),
  getSession: vi.fn(),
  postResults: [] as Array<Promise<{ data: unknown[] | null; error: unknown }>>,
  profiles: [{
    id: "author-1",
    username: "系小卓呀",
    avatar_url: null,
    role: "user",
    status: "active",
  }],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: database.from,
    auth: {
      getUser: vi.fn(),
      getSession: database.getSession,
    },
  },
}));

import AdminContentPage from "@/app/admin/content/page";
import ContentCard from "./ContentCard";

const posts = [
  {
    id: 140,
    type: "diary",
    status: "published",
    visibility: "public",
    created_at: "2026-08-29T07:54:17.000Z",
    author_id: "author-1",
  },
  {
    id: 141,
    type: "article",
    status: "draft",
    visibility: "private",
    title: "慢慢写下来的文章",
    slug: "slow-story",
    created_at: "2026-08-29T08:54:17.000Z",
    author_id: "author-1",
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  database.postResults = [Promise.resolve({ data: posts, error: null })];
  database.getSession.mockReset();
  database.getSession.mockResolvedValue({
    data: { session: { access_token: "admin-access-token" } },
  });
  database.from.mockReset();
  database.from.mockImplementation((table: string) => {
    if (table === "posts") {
      const result = database.postResults.shift();
      const query = {
        select: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() => result),
      };
      return query;
    }

    if (table === "profiles") {
      const query = {
        select: vi.fn(() => query),
        in: vi.fn(() =>
          Promise.resolve({ data: database.profiles, error: null })
        ),
      };
      return query;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ContentCard effective view count", () => {
  it("shows an exact zh-CN grouped integer with an Eye icon", () => {
    const container = renderCard({ viewCount: 12438 });

    const label = screen.getByText("12,438 次有效阅读");
    expect(label).toBeInTheDocument();
    expect(label.parentElement?.querySelector("svg")).toBeInTheDocument();
    expect(container.textContent).not.toContain("万");
  });

  it("renders zero instead of treating it as missing", () => {
    renderCard({ viewCount: 0 });

    expect(screen.getByText("0 次有效阅读")).toBeInTheDocument();
  });

  it("distinguishes unavailable data from a zero count", () => {
    renderCard({ viewCountUnavailable: true });

    expect(screen.getByText("阅读数据暂不可用")).toBeInTheDocument();
    expect(screen.queryByText("0 次有效阅读")).not.toBeInTheDocument();
  });

  it("keeps tag badges grouped while the reading label can wrap separately", () => {
    renderCard({ viewCount: 12438 });

    const label = screen.getByText("12,438 次有效阅读");
    const header = label.parentElement?.parentElement;
    const tagGroup = header?.firstElementChild;

    expect(header).toHaveClass("flex-wrap");
    expect(tagGroup).toHaveTextContent("日记");
    expect(tagGroup).toHaveTextContent("published");
    expect(tagGroup).toHaveTextContent("public");
    expect(tagGroup).toHaveTextContent("ID 140");
    expect(label.parentElement).toHaveClass("basis-full", "sm:basis-auto");
  });
});

describe("AdminContentPage view count loading", () => {
  it("loads all displayed IDs in one batch and maps exact counts to cards", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ counts: { "140": 12438, "141": 0 } })
    );

    render(<AdminContentPage />);

    expect(await screen.findByText("12,438 次有效阅读")).toBeInTheDocument();
    expect(screen.getByText("0 次有效阅读")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/content/view-counts",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: "Bearer admin-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ postIds: [140, 141] }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("chunks more than 200 IDs and merges complete exact counts", async () => {
    const manyPosts = createPosts(201);
    const firstCounts = Object.fromEntries(
      manyPosts.slice(0, 200).map((post) => [String(post.id), post.id * 10])
    );
    database.postResults = [
      Promise.resolve({ data: manyPosts, error: null }),
    ];
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ counts: firstCounts }))
      .mockResolvedValueOnce(jsonResponse({ counts: { "201": 2010 } }));

    render(<AdminContentPage />);

    expect(await screen.findByText("10 次有效阅读")).toBeInTheDocument();
    expect(screen.getByText("2,010 次有效阅读")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      postIds: manyPosts.slice(0, 200).map((post) => post.id),
    });
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      postIds: [201],
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer admin-access-token",
      "Content-Type": "application/json",
    });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      Authorization: "Bearer admin-access-token",
      "Content-Type": "application/json",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(
      fetchMock.mock.calls[1]?.[1]?.signal
    );
  });

  it("keeps content visible and marks counts unavailable when stats fail", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "failed" }, 500));

    render(<AdminContentPage />);

    expect(await screen.findByText("慢慢写下来的文章")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("阅读数据暂不可用")).toHaveLength(2);
    });
    expect(screen.queryByText("正在读取内容...")).not.toBeInTheDocument();
  });

  it("marks every count unavailable when one chunk fails", async () => {
    const manyPosts = createPosts(201);
    const firstCounts = Object.fromEntries(
      manyPosts.slice(0, 200).map((post) => [String(post.id), post.id])
    );
    database.postResults = [
      Promise.resolve({ data: manyPosts, error: null }),
    ];
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ counts: firstCounts }))
      .mockResolvedValueOnce(jsonResponse({ error: "failed" }, 500));

    render(<AdminContentPage />);

    expect(await screen.findByText("文章 201")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("阅读数据暂不可用")).toHaveLength(201);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(
      fetchMock.mock.calls[1]?.[1]?.signal
    );
    expect(screen.queryByText("正在读取内容...")).not.toBeInTheDocument();
    expect(screen.queryByText("1 次有效阅读")).not.toBeInTheDocument();
  });

  it("prevents an older chunk set from replacing newer counts", async () => {
    const oldPosts = createPosts(201);
    const firstOldChunk = deferred<Response>();
    const secondOldChunk = deferred<Response>();
    database.postResults = [
      Promise.resolve({ data: oldPosts, error: null }),
      Promise.resolve({ data: posts, error: null }),
    ];
    fetchMock
      .mockReturnValueOnce(firstOldChunk.promise)
      .mockReturnValueOnce(secondOldChunk.promise)
      .mockResolvedValueOnce(
        jsonResponse({ counts: { "140": 222, "141": 0 } })
      );

    render(<AdminContentPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const firstSignal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal;
    const secondSignal = (fetchMock.mock.calls[1]?.[1] as RequestInit).signal;
    expect(secondSignal).toBe(firstSignal);

    fireEvent.click(screen.getByRole("button", { name: "刷新内容" }));

    expect(await screen.findByText("222 次有效阅读")).toBeInTheDocument();
    expect(firstSignal?.aborted).toBe(true);

    firstOldChunk.resolve(
      jsonResponse({
        counts: Object.fromEntries(
          oldPosts.slice(0, 200).map((post) => [String(post.id), 111])
        ),
      })
    );
    secondOldChunk.resolve(jsonResponse({ counts: { "201": 111 } }));

    await waitFor(() => {
      expect(screen.getByText("222 次有效阅读")).toBeInTheDocument();
    });
    expect(screen.queryByText("111 次有效阅读")).not.toBeInTheDocument();
  });
});

function renderCard(overrides: {
  viewCount?: number | null;
  viewCountUnavailable?: boolean;
}) {
  const result = render(
    <ContentCard
      post={posts[0]}
      author={{ username: "系小卓呀" }}
      updateVisibility={vi.fn()}
      softDeletePost={vi.fn()}
      getTitle={() => "日记 · 2026年8月29日"}
      getViewHref={() => "/diary/140"}
      viewCount={overrides.viewCount ?? null}
      viewCountUnavailable={overrides.viewCountUnavailable ?? false}
    />
  );

  return result.container;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

function createPosts(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return {
      id,
      type: "article",
      status: "published",
      visibility: "public",
      title: `文章 ${id}`,
      slug: `article-${id}`,
      created_at: "2026-08-29T08:54:17.000Z",
      author_id: null,
    };
  });
}
