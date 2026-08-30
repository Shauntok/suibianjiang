import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DiaryDetailPage from "./page";

const state = vi.hoisted(() => ({
  userId: "author",
  visibility: "public",
  status: "published",
  type: "diary",
  deletedAt: null as string | null | undefined,
  exists: true,
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "131" }),
  useRouter: () => ({ push: state.push }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: state.userId } } }) },
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, is: () => query, count: 1,
      single: async () => ({
        data: state.exists ? {
          id: 131, type: state.type, author_id: "author", title: null, content: "一页日记",
          visibility: state.visibility, status: state.status, deleted_at: state.deletedAt,
          created_at: "2026-08-26T00:00:00Z", published_at: "2026-08-26T00:00:00Z",
          edited_at: "2026-08-27T00:00:00Z",
        } : null,
        error: state.exists ? null : new Error("missing diary"),
      }),
      maybeSingle: async () => ({ data: table === "profiles" ? { username: "小雨", avatar_url: null } : null }),
    };
    return query;
  },
} }));
vi.mock("@/components/TranslatedMarkdown", () => ({ default: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock("@/components/PostComments", () => ({ default: () => <div data-testid="comments" /> }));
vi.mock("@/components/views/PostViewTracker", () => ({
  default: ({ postId, eligible }: { postId: number; eligible: boolean }) => (
    <div data-testid="post-view-tracker" data-post-id={postId} data-eligible={eligible} />
  ),
}));
vi.mock("@/components/LikeButton", () => ({ default: ({ mobileFullWidth }: { mobileFullWidth: boolean }) => <button data-full={mobileFullWidth}>喜欢</button> }));
vi.mock("@/components/ReportButton", () => ({ default: ({ mobileFullWidth }: { mobileFullWidth: boolean }) => <button data-full={mobileFullWidth}>举报</button> }));
vi.mock("@/components/share/ShareButton", () => ({ default: (props: {
  isPublic: boolean; mobileFullWidth: boolean; canonicalUrl: string; version: string; title: string;
}) => <button disabled={!props.isPublic} data-full={props.mobileFullWidth} data-url={props.canonicalUrl} data-version={props.version} title={props.title}>{props.isPublic ? "分享" : "公开后可分享"}</button> }));

describe("diary sharing action layouts", () => {
  beforeEach(() => {
    state.userId = "author";
    state.visibility = "public";
    state.status = "published";
    state.type = "diary";
    state.deletedAt = null;
    state.exists = true;
    state.push.mockClear();
  });
  it.each([
    ["author", "public", "grid-cols-2", ["喜欢", "分享"]],
    ["visitor", "public", "grid-cols-3", ["喜欢", "分享", "举报"]],
    ["author", "unlisted", "grid-cols-2", ["喜欢", "公开后可分享"]],
    ["visitor", "unlisted", "grid-cols-2", ["喜欢", "举报"]],
  ])("renders %s / %s actions", async (userId, visibility, columns, labels) => {
    state.userId = userId as string; state.visibility = visibility as string;
    render(<DiaryDetailPage />);
    const grid = await screen.findByTestId("diary-actions");
    expect(grid).toHaveClass(columns as string, "md:flex");
    const buttons = within(grid).getAllByRole("button");
    expect(buttons.map(button => button.textContent)).toEqual(labels);
    buttons.forEach(button => expect(button).toHaveAttribute("data-full", "true"));
    if (userId === "author") {
      expect(within(grid).getByRole("link", { name: "编辑日记" })).toHaveClass("col-span-full");
      expect(within(grid).getByRole("link", { name: "编辑日记" })).toHaveAttribute("href", "/diary/131/edit");
    } else expect(within(grid).queryByRole("link")).not.toBeInTheDocument();
    if (visibility === "public") {
      expect(within(grid).getByRole("button", { name: "分享" })).toHaveAttribute("data-url", "https://www.ourlittleage.com/diary/131");
      expect(within(grid).getByRole("button", { name: "分享" })).toHaveAttribute("data-version", "2026-08-27T00:00:00Z");
      expect(screen.getByTestId("comments")).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId("comments")).not.toBeInTheDocument();
      if (userId === "author") expect(within(grid).getByRole("button", { name: "公开后可分享" })).toBeDisabled();
    }
  });
  it("does not enable sharing for a public draft owned by the reader", async () => {
    state.status = "draft";
    render(<DiaryDetailPage />);
    expect(await screen.findByRole("button", { name: "公开后可分享" })).toBeDisabled();
  });
});

describe("diary view tracking", () => {
  beforeEach(() => {
    state.userId = "author";
    state.visibility = "public";
    state.status = "published";
    state.type = "diary";
    state.deletedAt = null;
    state.exists = true;
    state.push.mockClear();
  });

  it.each([
    ["diary", "published", "public", null, true],
    ["diary", "published", "public", undefined, true],
    ["diary", "published", "unlisted", null, false],
    ["diary", "published", "private", null, false],
    ["diary", "published", "hidden", null, false],
    ["diary", "draft", "public", null, false],
    ["diary", "published", "public", "2026-08-29T00:00:00.000Z", false],
    ["article", "published", "public", null, false],
  ])(
    "wires tracking for %s/%s/%s with deleted_at %s",
    async (type, status, visibility, deletedAt, eligible) => {
      state.type = type as string;
      state.status = status as string;
      state.visibility = visibility as string;
      state.deletedAt = deletedAt as string | null | undefined;

      render(<DiaryDetailPage />);

      const tracker = await screen.findByTestId("post-view-tracker");
      expect(tracker).toHaveAttribute("data-post-id", "131");
      expect(tracker).toHaveAttribute("data-eligible", String(eligible));
    },
  );

  it("does not render tracking when the diary is missing", async () => {
    state.exists = false;
    render(<DiaryDetailPage />);

    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/diary"));
    expect(screen.queryByTestId("post-view-tracker")).not.toBeInTheDocument();
  });
});
