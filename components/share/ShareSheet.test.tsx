import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ShareButton from "@/components/share/ShareButton";

const sharing = vi.hoisted(() => ({
  copyShareText: vi.fn(),
  downloadStoryFile: vi.fn(),
  loadStoryFile: vi.fn(),
  shareLink: vi.fn(),
  shareStoryFile: vi.fn(),
}));

vi.mock("@/lib/sharing/client", () => sharing);

const storyFile = new File(["png"], "story.png", { type: "image/png" });
const canonicalUrl = "https://example.test/articles/late-night";

const defaultProps = {
  postId: 12,
  postType: "article" as const,
  title: "凌晨四点",
  canonicalUrl,
  version: "2026-08-26T04:00:00+08:00",
  isPublic: true,
  isOwner: false,
};

beforeEach(() => {
  sharing.copyShareText.mockResolvedValue(true);
  sharing.loadStoryFile.mockResolvedValue(storyFile);
  sharing.shareLink.mockResolvedValue("shared");
  sharing.shareStoryFile.mockResolvedValue("shared");
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  vi.clearAllMocks();
});

describe("ShareButton and ShareSheet accessibility", () => {
  it("opens an accessible dialog, locks scrolling, and restores focus on Escape", async () => {
    document.body.style.overflow = "clip";
    render(<ShareButton {...defaultProps} mobileFullWidth />);

    const trigger = screen.getByRole("button", { name: "分享" });
    expect(trigger).toHaveClass("w-full", "md:w-auto");
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "分享这篇故事" });
    const closeButton = screen.getByRole("button", { name: "关闭分享面板" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(closeButton).toHaveFocus());
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("clip");
    expect(trigger).toHaveFocus();
  });

  it("uses the versioned route and enables Story sharing after the image loads", async () => {
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    expect(screen.getByRole("button", { name: "复制链接" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "分享到其他应用" })).toBeEnabled();
    expect(await screen.findByAltText("凌晨四点 Story 分享图预览")).toBeVisible();
    expect(screen.getByRole("button", { name: "分享 Story 图片" })).toBeEnabled();
    expect(sharing.loadStoryFile).toHaveBeenCalledWith(
      "/api/share-card/article/12?v=2026-08-26T04%3A00%3A00%2B08%3A00",
      expect.stringMatching(/\.png$/)
    );
  });

  it("shows copy success and keeps a cancelled link share quiet", async () => {
    sharing.shareLink.mockResolvedValue("cancelled");
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
    expect(await screen.findByText("链接已经复制。")).toBeInTheDocument();
    expect(sharing.copyShareText).toHaveBeenCalledWith(canonicalUrl);

    fireEvent.click(screen.getByRole("button", { name: "分享到其他应用" }));
    await waitFor(() => expect(sharing.shareLink).toHaveBeenCalledOnce());
    expect(screen.queryByText("链接已经复制。")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers a download when native Story file sharing is unsupported", async () => {
    sharing.shareStoryFile.mockResolvedValue("unsupported");
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    await screen.findByAltText("凌晨四点 Story 分享图预览");
    fireEvent.click(screen.getByRole("button", { name: "分享 Story 图片" }));

    expect(
      await screen.findByText(/仍然可以下载 Story 图片并复制链接/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下载 Story 图片" }));
    await waitFor(() => {
      expect(sharing.downloadStoryFile).toHaveBeenCalledWith(storyFile);
      expect(sharing.copyShareText).toHaveBeenCalledWith(canonicalUrl);
    });
  });

  it("keeps link commands usable when the Story image cannot be fetched", async () => {
    sharing.loadStoryFile.mockRejectedValue(new Error("share-card-unavailable"));
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    expect(
      await screen.findByText("Story 图片暂时无法生成，链接仍然可以分享。")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制链接" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "分享到其他应用" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "分享 Story 图片" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
    expect(await screen.findByText("链接已经复制。")).toBeInTheDocument();
  });
});

describe("ShareButton eligibility", () => {
  it("shows an owner a disabled control for non-public content", () => {
    render(<ShareButton {...defaultProps} isPublic={false} isOwner />);

    const trigger = screen.getByRole("button", { name: "公开后可分享" });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not expose a share trigger to visitors for non-public content", () => {
    const { container } = render(
      <ShareButton {...defaultProps} isPublic={false} isOwner={false} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
