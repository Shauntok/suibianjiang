import { afterEach, describe, expect, it, vi } from "vitest";

import {
  copyShareText,
  downloadStoryFile,
  loadStoryFile,
  shareLink,
  shareStoryFile,
} from "@/lib/sharing/client";

const url = "https://example.test/articles/late-night";
const title = "凌晨四点";
const originalExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalExecCommand) {
    Object.defineProperty(document, "execCommand", originalExecCommand);
  } else {
    Reflect.deleteProperty(document, "execCommand");
  }
  document.querySelectorAll("textarea").forEach((textarea) => textarea.remove());
});

describe("copyShareText", () => {
  it("copies with the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyShareText(url)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it("falls back to execCommand and removes the temporary textarea", async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    vi.stubGlobal("navigator", {});

    await expect(copyShareText(url)).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
  });

  it("removes the fallback textarea when execCommand throws", async () => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("copy-blocked");
      }),
    });
    vi.stubGlobal("navigator", {});

    await expect(copyShareText(url)).rejects.toThrow("copy-blocked");
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
  });
});

describe("shareLink", () => {
  it("shares a link through the native share API", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });

    await expect(shareLink({ title, url })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title,
      text: `在小时代读到：${title}`,
      url,
    });
  });

  it("treats AbortError as quiet cancellation", async () => {
    const error = Object.assign(new Error("cancelled"), { name: "AbortError" });
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(error) });

    await expect(shareLink({ title, url })).resolves.toBe("cancelled");
  });

  it("reports unsupported when native sharing is absent", async () => {
    vi.stubGlobal("navigator", {});

    await expect(shareLink({ title, url })).resolves.toBe("unsupported");
  });

  it("reports failed when native sharing rejects", async () => {
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new Error("share-failed")),
    });

    await expect(shareLink({ title, url })).resolves.toBe("failed");
  });
});

describe("loadStoryFile", () => {
  it("fetches the Story PNG into a named File", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["png-bytes"], { type: "image/png" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = await loadStoryFile("/api/share-card/article/12?v=edited", "story.png");

    expect(fetchMock).toHaveBeenCalledWith("/api/share-card/article/12?v=edited");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("story.png");
    expect(file.type).toBe("image/png");
  });

  it("passes an optional AbortSignal to the Story request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["png-bytes"], { type: "image/png" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadStoryFile("/api/share-card/diary/42?v=edited", "story.png", controller.signal);

    expect(fetchMock).toHaveBeenCalledWith("/api/share-card/diary/42?v=edited", {
      signal: controller.signal,
    });
  });

  it("rejects a response that cannot provide a public Story image", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(loadStoryFile("/missing", "story.png")).rejects.toThrow(
      "share-card-unavailable"
    );
  });
});

describe("shareStoryFile", () => {
  const file = new File(["png"], "story.png", { type: "image/png" });

  it("shares the Story File only when the device accepts it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });

    await expect(shareStoryFile({ file, title, url })).resolves.toBe("shared");
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(share).toHaveBeenCalledWith({
      files: [file],
      title,
      text: `在小时代读到：${title}\n${url}`,
    });
  });

  it("reports unsupported without native file-share support", async () => {
    const share = vi.fn();
    vi.stubGlobal("navigator", {
      share,
      canShare: vi.fn().mockReturnValue(false),
    });

    await expect(shareStoryFile({ file, title, url })).resolves.toBe("unsupported");
    expect(share).not.toHaveBeenCalled();
  });

  it("treats file-share AbortError as quiet cancellation", async () => {
    const error = Object.assign(new Error("cancelled"), { name: "AbortError" });
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(error),
      canShare: vi.fn().mockReturnValue(true),
    });

    await expect(shareStoryFile({ file, title, url })).resolves.toBe("cancelled");
  });

  it("reports failed when file sharing rejects", async () => {
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new Error("share-failed")),
      canShare: vi.fn().mockReturnValue(true),
    });

    await expect(shareStoryFile({ file, title, url })).resolves.toBe("failed");
  });
});

describe("downloadStoryFile", () => {
  it("clicks a named download and revokes its object URL", () => {
    const file = new File(["png"], "story.png", { type: "image/png" });
    const createObjectURL = vi.fn().mockReturnValue("blob:story");
    const revokeObjectURL = vi.fn();
    const clickedAnchors: HTMLAnchorElement[] = [];
    const attachedAtClick: boolean[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedAnchors.push(this);
        attachedAtClick.push(document.body.contains(this));
      });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    downloadStoryFile(file);

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(click).toHaveBeenCalledOnce();
    expect(clickedAnchors[0]?.href).toBe("blob:story");
    expect(clickedAnchors[0]?.download).toBe("story.png");
    expect(attachedAtClick).toEqual([true]);
    expect(clickedAnchors[0]).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:story");
  });

  it("revokes the object URL when the download click throws", () => {
    const file = new File(["png"], "story.png", { type: "image/png" });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:story"),
      revokeObjectURL,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("download-blocked");
    });

    expect(() => downloadStoryFile(file)).toThrow("download-blocked");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:story");
  });
});
