import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

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

  it("traps Tab and Shift+Tab focus inside the dialog", async () => {
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    await screen.findByAltText("凌晨四点 Story 分享图预览");
    const closeButton = screen.getByRole("button", { name: "关闭分享面板" });
    const lastButton = screen.getByRole("button", { name: "分享 Story 图片" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(lastButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();
  });

  it("keeps both Tab directions on the only focusable element", () => {
    sharing.loadStoryFile.mockReturnValueOnce(new Promise<File>(() => {}));
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    const dialog = screen.getByRole("dialog", { name: "分享这篇故事" });
    const closeButton = screen.getByRole("button", { name: "关闭分享面板" });
    for (const button of within(dialog).getAllByRole("button")) {
      if (button !== closeButton) (button as HTMLButtonElement).disabled = true;
    }

    expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(false);
    expect(closeButton).toHaveFocus();
    expect(fireEvent.keyDown(document, { key: "Tab", shiftKey: true })).toBe(false);
    expect(closeButton).toHaveFocus();
  });

  it("prevents Tab escape and focuses the dialog when no controls are focusable", () => {
    sharing.loadStoryFile.mockReturnValueOnce(new Promise<File>(() => {}));
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    const dialog = screen.getByRole("dialog", { name: "分享这篇故事" });
    for (const button of within(dialog).getAllByRole("button")) {
      (button as HTMLButtonElement).disabled = true;
    }

    expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(false);
    expect(dialog).toHaveFocus();
    expect(fireEvent.keyDown(document, { key: "Tab", shiftKey: true })).toBe(false);
    expect(dialog).toHaveFocus();
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
      expect.stringMatching(/\.png$/),
      expect.any(AbortSignal)
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

  it("ignores an older command result when a newer command finishes first", async () => {
    const copyResult = deferred<boolean>();
    const shareResult = deferred<"unsupported">();
    sharing.copyShareText.mockReturnValueOnce(copyResult.promise);
    sharing.shareLink.mockReturnValueOnce(shareResult.promise);
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
    fireEvent.click(screen.getByRole("button", { name: "分享到其他应用" }));

    await act(async () => shareResult.resolve("unsupported"));
    expect(
      screen.getByText("这个装置暂不支持直接分享，请复制链接。")
    ).toBeInTheDocument();

    await act(async () => copyResult.resolve(true));
    expect(
      screen.getByText("这个装置暂不支持直接分享，请复制链接。")
    ).toBeInTheDocument();
    expect(screen.queryByText("链接已经复制。")).not.toBeInTheDocument();
  });

  it("keeps a pending command result quiet after the sheet closes", async () => {
    const copyResult = deferred<boolean>();
    sharing.copyShareText.mockReturnValueOnce(copyResult.promise);
    render(<ShareButton {...defaultProps} />);
    const trigger = screen.getByRole("button", { name: "分享" });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭分享面板" }));
    await act(async () => copyResult.resolve(true));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("链接已经复制。")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("ignores a stale Story-share result after a newer copy command", async () => {
    const storyResult = deferred<"unsupported">();
    sharing.shareStoryFile.mockReturnValueOnce(storyResult.promise);
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));
    await screen.findByAltText("凌晨四点 Story 分享图预览");

    fireEvent.click(screen.getByRole("button", { name: "分享 Story 图片" }));
    expect(sharing.shareStoryFile).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
    expect(await screen.findByText("链接已经复制。")).toBeInTheDocument();

    await act(async () => storyResult.resolve("unsupported"));
    expect(screen.getByText("链接已经复制。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载 Story 图片" })).not.toBeInTheDocument();
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

  it("reports copy failure truthfully after the Story image downloads", async () => {
    sharing.shareStoryFile.mockResolvedValue("unsupported");
    sharing.copyShareText.mockRejectedValue(new Error("copy-blocked"));
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    await screen.findByAltText("凌晨四点 Story 分享图预览");
    fireEvent.click(screen.getByRole("button", { name: "分享 Story 图片" }));
    fireEvent.click(await screen.findByRole("button", { name: "下载 Story 图片" }));

    expect(
      await screen.findByText("Story 图片已下载，但链接没有复制。")
    ).toBeInTheDocument();
    expect(sharing.downloadStoryFile).toHaveBeenCalledWith(storyFile);
  });

  it("does not try to copy the link when the Story download fails", async () => {
    sharing.shareStoryFile.mockResolvedValue("unsupported");
    sharing.downloadStoryFile.mockImplementationOnce(() => {
      throw new Error("download-blocked");
    });
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    await screen.findByAltText("凌晨四点 Story 分享图预览");
    fireEvent.click(screen.getByRole("button", { name: "分享 Story 图片" }));
    fireEvent.click(await screen.findByRole("button", { name: "下载 Story 图片" }));

    expect(
      await screen.findByText("Story 图片暂时无法下载，请稍后再试。")
    ).toBeInTheDocument();
    expect(sharing.copyShareText).not.toHaveBeenCalled();
  });

  it("ignores a stale post-download copy result after a newer link share", async () => {
    const downloadCopyResult = deferred<boolean>();
    sharing.shareStoryFile.mockResolvedValue("unsupported");
    sharing.copyShareText.mockReturnValueOnce(downloadCopyResult.promise);
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));
    await screen.findByAltText("凌晨四点 Story 分享图预览");

    fireEvent.click(screen.getByRole("button", { name: "分享 Story 图片" }));
    fireEvent.click(await screen.findByRole("button", { name: "下载 Story 图片" }));
    fireEvent.click(screen.getByRole("button", { name: "分享到其他应用" }));
    expect(sharing.shareLink).toHaveBeenCalledOnce();
    expect(await screen.findByText("已打开装置的分享面板。")).toBeInTheDocument();

    await act(async () => downloadCopyResult.resolve(true));
    expect(screen.getByText("已打开装置的分享面板。")).toBeInTheDocument();
    expect(
      screen.queryByText("Story 图片已下载，链接也已经复制。")
    ).not.toBeInTheDocument();
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

  it("aborts a pending Story request when the sheet closes", async () => {
    const fileResult = deferred<File>();
    let requestSignal: AbortSignal | undefined;
    sharing.loadStoryFile.mockImplementationOnce(
      (_url: string, _filename: string, signal?: AbortSignal) => {
        requestSignal = signal;
        return fileResult.promise;
      }
    );
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));
    await waitFor(() => expect(sharing.loadStoryFile).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "关闭分享面板" }));

    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal?.aborted).toBe(true);
    await act(async () => {
      fileResult.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not report an aborted Story request as unavailable", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    sharing.loadStoryFile.mockRejectedValueOnce(abortError);
    render(<ShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    await waitFor(() => expect(sharing.loadStoryFile).toHaveBeenCalledOnce());
    expect(screen.getByText("正在准备 Story 图片…")).toBeInTheDocument();
    expect(
      screen.queryByText("Story 图片暂时无法生成，链接仍然可以分享。")
    ).not.toBeInTheDocument();
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
