import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LikeButton from "@/components/LikeButton";

const likesTable = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "author" } },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "post_likes") return likesTable;
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

describe("LikeButton feedback placement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    likesTable.select.mockReturnValue(likesTable);
    likesTable.eq.mockReturnValue(likesTable);
    likesTable.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("shows the owner hint as a floating status without stretching nearby actions", async () => {
    render(<LikeButton postId={10} authorId="author" initialCount={4} />);

    const likeButton = await screen.findByRole("button", { name: "🤍 喜欢 4" });
    fireEvent.click(likeButton);

    const hint = screen.getByRole("status");
    expect(hint).toHaveTextContent("这束光已经在你自己的房间里啦。");
    expect(hint).toHaveClass("absolute");
    expect(likeButton.parentElement).toHaveClass("relative");
  });
});
