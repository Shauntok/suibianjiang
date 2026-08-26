import { render, screen, waitFor } from "@testing-library/react";
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

const article = {
  id: 10,
  author_id: "author",
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

  it("makes the owner like action full width on mobile", async () => {
    render(<ArticleDetailClient initialArticle={article} />);

    const likeButton = await screen.findByTestId("article-like");
    expect(likeButton).toHaveAttribute("data-mobile-full", "true");
    expect(likeButton.parentElement).toHaveClass("grid-cols-1");
  });

  it("uses two equal mobile columns for visitor actions", async () => {
    authState.userId = "visitor";
    render(<ArticleDetailClient initialArticle={article} />);

    const reportButton = await screen.findByTestId("article-report");
    const likeButton = screen.getByTestId("article-like");

    await waitFor(() => {
      expect(reportButton).toHaveAttribute("data-mobile-full", "true");
    });
    expect(likeButton).toHaveAttribute("data-mobile-full", "true");
    expect(likeButton.parentElement).toHaveClass("grid-cols-2");
  });
});
