import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ArticleDetailClient from "@/components/articles/ArticleDetailClient";

const authState = vi.hoisted(() => ({ userId: "author" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "test-article" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: authState.userId ? { id: authState.userId } : null },
      })),
    },
  },
}));

vi.mock("@/components/TranslatedMarkdown", () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/PostComments", () => ({
  default: () => <div>comments</div>,
}));

vi.mock("@/components/LikeButton", () => ({
  default: ({ mobileFullWidth }: { mobileFullWidth?: boolean }) => (
    <button data-testid="article-like" data-mobile-full={mobileFullWidth}>
      喜欢
    </button>
  ),
}));

vi.mock("@/components/ReportButton", () => ({
  default: ({ mobileFullWidth }: { mobileFullWidth?: boolean }) => (
    <button data-testid="article-report" data-mobile-full={mobileFullWidth}>
      举报
    </button>
  ),
}));

vi.mock("@/components/share/ShareButton", () => ({
  default: ({
    isPublic,
    isOwner,
    mobileFullWidth,
  }: {
    isPublic: boolean;
    isOwner: boolean;
    mobileFullWidth?: boolean;
  }) => {
    if (!isPublic && !isOwner) return null;

    return (
      <button
        data-testid="article-share"
        data-mobile-full={mobileFullWidth}
        data-public={isPublic}
        disabled={!isPublic}
      >
        {isPublic ? "分享" : "公开后可分享"}
      </button>
    );
  },
}));

const article = {
  id: 10,
  author_id: "author",
  slug: "test-article",
  title: "测试文章",
  content: "文章内容",
  created_at: "2026-08-26T00:00:00.000Z",
  published_at: "2026-08-26T00:00:00.000Z",
  visibility: "public",
  status: "published",
  likeCount: 1,
  profiles: { username: "系小卓呀", avatar_url: null },
};

describe("ArticleDetailClient mobile actions", () => {
  beforeEach(() => {
    authState.userId = "author";
  });

  it("gives a public owner equal like and share columns", async () => {
    render(<ArticleDetailClient initialArticle={article} />);

    expect(await screen.findByTestId("article-actions")).toHaveClass("grid-cols-2");
    expect(screen.getByTestId("article-like")).toBeVisible();
    expect(screen.getByTestId("article-share")).toBeEnabled();
    expect(screen.getByRole("link", { name: "编辑文章" })).toHaveClass("col-span-full");
  });

  it("gives a public visitor like, share and report thirds", async () => {
    authState.userId = "visitor";
    render(<ArticleDetailClient initialArticle={article} />);

    expect(await screen.findByTestId("article-actions")).toHaveClass("grid-cols-3");
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(
      expect.arrayContaining(["喜欢", "分享", "举报"]),
    );
  });

  it("shows a disabled share action to an owner of unlisted content", async () => {
    render(
      <ArticleDetailClient initialArticle={{ ...article, visibility: "unlisted" }} />,
    );

    expect(
      await screen.findByRole("button", { name: "公开后可分享" }),
    ).toBeDisabled();
  });

  it("hides share and keeps two columns for an unlisted visitor", async () => {
    authState.userId = "visitor";
    render(
      <ArticleDetailClient initialArticle={{ ...article, visibility: "unlisted" }} />,
    );

    expect(await screen.findByTestId("article-actions")).toHaveClass("grid-cols-2");
    expect(screen.queryByTestId("article-share")).not.toBeInTheDocument();
  });
});
