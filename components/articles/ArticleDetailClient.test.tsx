import { render, screen, within } from "@testing-library/react";
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

function getDirectActionButtonLabels(actionGrid: HTMLElement) {
  return Array.from(actionGrid.querySelectorAll(":scope > button")).map(
    (button) => button.textContent,
  );
}

describe("ArticleDetailClient mobile actions", () => {
  beforeEach(() => {
    authState.userId = "author";
  });

  it("gives a public owner equal like and share columns", async () => {
    render(<ArticleDetailClient initialArticle={article} />);

    const actionGrid = await screen.findByTestId("article-actions");
    expect(actionGrid).toHaveClass("grid-cols-2");
    expect(getDirectActionButtonLabels(actionGrid)).toEqual(["喜欢", "分享"]);
    expect(screen.getByTestId("article-like")).toBeVisible();
    expect(screen.getByTestId("article-like")).toHaveAttribute(
      "data-mobile-full",
      "true",
    );
    expect(screen.getByTestId("article-share")).toBeEnabled();
    expect(screen.getByTestId("article-share")).toHaveAttribute(
      "data-mobile-full",
      "true",
    );
    expect(screen.getByRole("link", { name: "编辑文章" })).toHaveClass("col-span-full");
  });

  it("gives a public visitor like, share and report thirds", async () => {
    authState.userId = "visitor";
    render(<ArticleDetailClient initialArticle={article} />);

    const actionGrid = await screen.findByTestId("article-actions");
    expect(actionGrid).toHaveClass("grid-cols-3");
    expect(getDirectActionButtonLabels(actionGrid)).toEqual(["喜欢", "分享", "举报"]);
    for (const testId of ["article-like", "article-share", "article-report"]) {
      expect(within(actionGrid).getByTestId(testId)).toHaveAttribute(
        "data-mobile-full",
        "true",
      );
    }
  });

  it("shows a disabled share action to an owner of unlisted content", async () => {
    render(
      <ArticleDetailClient initialArticle={{ ...article, visibility: "unlisted" }} />,
    );

    const actionGrid = await screen.findByTestId("article-actions");
    expect(actionGrid).toHaveClass("grid-cols-2");
    expect(getDirectActionButtonLabels(actionGrid)).toEqual(["喜欢", "公开后可分享"]);
    expect(within(actionGrid).getByTestId("article-like")).toHaveAttribute(
      "data-mobile-full",
      "true",
    );
    expect(
      within(actionGrid).getByRole("button", { name: "公开后可分享" }),
    ).toBeDisabled();
    expect(screen.getByRole("link", { name: "编辑文章" })).toHaveClass("col-span-full");
  });

  it("hides share and keeps two columns for an unlisted visitor", async () => {
    authState.userId = "visitor";
    render(
      <ArticleDetailClient initialArticle={{ ...article, visibility: "unlisted" }} />,
    );

    const actionGrid = await screen.findByTestId("article-actions");
    expect(actionGrid).toHaveClass("grid-cols-2");
    expect(getDirectActionButtonLabels(actionGrid)).toEqual(["喜欢", "举报"]);
    expect(within(actionGrid).getByTestId("article-like")).toHaveAttribute(
      "data-mobile-full",
      "true",
    );
    expect(within(actionGrid).getByTestId("article-report")).toHaveAttribute(
      "data-mobile-full",
      "true",
    );
    expect(within(actionGrid).queryByTestId("article-share")).not.toBeInTheDocument();
  });
});
