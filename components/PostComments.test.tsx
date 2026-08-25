import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PostComments from "@/components/PostComments";

const commentRows = [
  {
    id: "root-1",
    post_id: 10,
    author_id: "author-root",
    content: "原来真的有人也有这种感觉。",
    created_at: "2026-08-25T23:48:00Z",
    parent_id: null,
    depth: 0,
    profiles: { username: "木木", avatar_url: null },
  },
  {
    id: "reply-1",
    post_id: 10,
    author_id: "author-reply",
    content: "我也是。像是有人替我写下来了。",
    created_at: "2026-08-26T00:03:00Z",
    parent_id: "root-1",
    depth: 1,
    profiles: { username: "小雨", avatar_url: null },
  },
];

const commentsTable = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

const likesTable = {
  select: vi.fn(),
  in: vi.fn(),
  eq: vi.fn(),
};

const profilesTable = {
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "viewer" } },
      })),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === "comments") return commentsTable;
      if (table === "comment_likes") return likesTable;
      if (table === "profiles") return profilesTable;
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

vi.mock("@/components/ReportButton", () => ({
  default: () => <button type="button">举报</button>,
}));

vi.mock("@/components/ui/ConfirmDialog", () => ({
  default: () => null,
}));

describe("PostComments nested replies", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    commentsTable.select.mockReturnValue(commentsTable);
    commentsTable.eq.mockReturnValue(commentsTable);
    commentsTable.order.mockResolvedValue({ data: commentRows, error: null });
    commentsTable.insert.mockResolvedValue({ error: null });
    commentsTable.update.mockReturnValue(commentsTable);

    likesTable.select.mockReturnValue(likesTable);
    likesTable.in.mockReturnValue(likesTable);
    likesTable.eq.mockResolvedValue({ data: [], error: null });

    profilesTable.select.mockReturnValue(profilesTable);
    profilesTable.eq.mockReturnValue(profilesTable);
    profilesTable.single.mockResolvedValue({
      data: { status: "active" },
      error: null,
    });
  });

  it("renders replies inside the parent comment with a clear reply target", async () => {
    render(<PostComments postId={10} />);

    expect(
      await screen.findByText("原来真的有人也有这种感觉。")
    ).toBeInTheDocument();
    expect(screen.getByText("回复 木木：")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /喜欢 0/ })[0]).toHaveTextContent(
      "♡喜欢 0"
    );
    expect(screen.getByRole("button", { name: "回复 小雨" })).toHaveTextContent(
      "↩回复"
    );
  });

  it("submits a reply to another reply without creating a new top-level comment", async () => {
    render(<PostComments postId={10} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "回复 小雨" })
    );

    const replyInput = screen.getByLabelText("回复小雨");
    fireEvent.change(replyInput, {
      target: { value: "今晚大家好像都在同一个窗边。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "送出回复" }));

    await waitFor(() => {
      expect(commentsTable.insert).toHaveBeenCalledWith([
        {
          post_id: 10,
          author_id: "viewer",
          content: "今晚大家好像都在同一个窗边。",
          parent_id: "reply-1",
          depth: 2,
        },
      ]);
    });
  });
});
