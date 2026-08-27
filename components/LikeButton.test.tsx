import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LikeButton from "@/components/LikeButton";

const likesTable = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
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
    likesTable.update.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
  });

  it("shows the owner hint as a mobile popup and keeps the desktop hint placement", async () => {
    render(
      <LikeButton
        postId={10}
        authorId="author"
        initialCount={4}
        mobileFullWidth
      />
    );

    const likeButton = await screen.findByRole("button", { name: "🤍 喜欢 4" });
    fireEvent.click(likeButton);

    const hint = screen.getByRole("status");
    expect(hint).toHaveTextContent("这束光已经在你自己的房间里啦。");
    expect(hint).toHaveClass(
      "fixed",
      "top-24",
      "rounded-xl",
      "animate-[mobile-like-notice_3s_ease-in-out_forwards]",
      "md:absolute",
      "md:top-full"
    );
    expect(likeButton.parentElement).toHaveClass("relative");
  });

  it("fills the mobile action row without changing desktop width", async () => {
    render(
      <LikeButton
        postId={10}
        authorId="author"
        initialCount={4}
        mobileFullWidth
      />
    );

    const likeButton = await screen.findByRole("button", { name: "🤍 喜欢 4" });
    expect(likeButton).toHaveClass("w-full", "md:w-auto");
    expect(likeButton.parentElement).toHaveClass("w-full", "md:w-auto");
  });

  it("abbreviates the mobile count but keeps the full accessible and desktop count", async () => {
    likesTable.maybeSingle.mockResolvedValue({ data: { id: 1, is_active: true }, error: null });
    render(<LikeButton postId={10} authorId="other" initialCount={12000} mobileFullWidth />);
    const button = await screen.findByRole("button", { name: "❤️ 已喜欢 12000" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAccessibleName("❤️ 已喜欢 12000");
    expect(button.querySelector('[data-mobile-like]')).toHaveTextContent("1.2万");
    expect(button.querySelector('[data-desktop-like]')).toHaveTextContent("已喜欢 12000");
  });

  it("updates the abbreviated count and pressed state when crossing 999 in either direction", async () => {
    const inactive = { data: { id: 1, is_active: false }, error: null };
    likesTable.maybeSingle
      .mockResolvedValueOnce(inactive)
      .mockResolvedValueOnce(inactive)
      .mockResolvedValueOnce({ data: { id: 1, is_active: true }, error: null });
    render(<LikeButton postId={10} authorId="other" initialCount={999} mobileFullWidth />);
    const button = await screen.findByRole("button", { name: "🤍 喜欢 999" });
    fireEvent.click(button);
    await screen.findByRole("button", { name: "❤️ 已喜欢 1000", pressed: true });
    expect(button.querySelector('[data-mobile-like]')).toHaveTextContent("1千");
    fireEvent.click(button);
    await screen.findByRole("button", { name: "🤍 喜欢 999", pressed: false });
    expect(button.querySelector('[data-mobile-like]')).toHaveTextContent("999");
  });
});
