"use client";

import { Copy, Download, Send, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";

import {
  copyShareText,
  downloadStoryFile,
  loadStoryFile,
  shareLink,
  shareStoryFile,
} from "@/lib/sharing/client";

type CardState = "loading" | "ready" | "unavailable";

type ShareSheetProps = {
  title: string;
  canonicalUrl: string;
  imageUrl: string;
  filename: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
};

export default function ShareSheet({
  title,
  canonicalUrl,
  imageUrl,
  filename,
  returnFocusRef,
  onClose,
}: ShareSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [cardState, setCardState] = useState<CardState>("loading");
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusTarget = returnFocusRef.current;
    let active = true;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);

    loadStoryFile(imageUrl, filename)
      .then((file) => {
        if (!active) return;
        setStoryFile(file);
        setCardState("ready");
      })
      .catch(() => {
        if (!active) return;
        setStoryFile(null);
        setCardState("unavailable");
      });

    return () => {
      active = false;
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusTarget?.focus();
    };
  }, [filename, imageUrl, onClose, returnFocusRef]);

  async function handleCopyLink() {
    setMessage("");

    try {
      const copied = await copyShareText(canonicalUrl);
      setMessage(copied ? "链接已经复制。" : "这个装置暂时无法复制链接。");
    } catch {
      setMessage("这个装置暂时无法复制链接。");
    }
  }

  async function handleShareLink() {
    setMessage("");
    const outcome = await shareLink({ title, url: canonicalUrl });

    if (outcome === "shared") setMessage("已打开装置的分享面板。");
    if (outcome === "unsupported") {
      setMessage("这个装置暂不支持直接分享，请复制链接。");
    }
    if (outcome === "failed") setMessage("分享没有完成，请稍后再试。");
  }

  async function handleShareStory() {
    if (!storyFile) return;

    setMessage("");
    const outcome = await shareStoryFile({
      file: storyFile,
      title,
      url: canonicalUrl,
    });

    if (outcome === "shared") setMessage("已打开装置的图片分享面板。");
    if (outcome === "unsupported") {
      setShowDownload(true);
      setMessage("这个装置暂不支持直接分享图片，你仍然可以下载 Story 图片并复制链接。");
    }
    if (outcome === "failed") {
      setMessage("Story 图片分享没有完成，请稍后再试。");
    }
  }

  async function handleDownloadStory() {
    if (!storyFile) return;

    setMessage("");

    try {
      downloadStoryFile(storyFile);
      const copied = await copyShareText(canonicalUrl);
      setMessage(
        copied
          ? "Story 图片已下载，链接也已经复制。"
          : "Story 图片已下载，但链接没有复制。"
      );
    } catch {
      setMessage("Story 图片暂时无法下载，请稍后再试。");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-sheet-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 px-0 pt-12 backdrop-blur-sm md:items-center md:px-6 md:py-8"
    >
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg border border-white/10 bg-zinc-950 shadow-2xl shadow-black md:max-w-xl md:rounded-lg">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs text-white/35">把这一页轻轻递出去</p>
            <h2 id="share-sheet-title" className="mt-1 text-lg font-medium text-white">
              分享这篇故事
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="关闭分享面板"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/45 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 overflow-y-auto px-5 py-5 md:grid-cols-[10.5rem_minmax(0,1fr)]">
          <div className="mx-auto w-36 md:w-full">
            <div className="relative aspect-[9/16] overflow-hidden rounded-md border border-white/10 bg-black">
              {cardState === "loading" && (
                <div className="flex h-full items-center justify-center px-3 text-center text-xs leading-5 text-white/35">
                  正在准备 Story 图片…
                </div>
              )}
              {cardState === "ready" && (
                <Image
                  src={imageUrl}
                  alt={`${title} Story 分享图预览`}
                  fill
                  sizes="(min-width: 768px) 168px, 144px"
                  unoptimized
                  className="object-contain"
                />
              )}
              {cardState === "unavailable" && (
                <div className="flex h-full items-center justify-center px-3 text-center text-xs leading-5 text-white/35">
                  Story 图片暂时无法生成
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <p className="truncate text-sm text-white/75">{title}</p>
            <p className="break-all text-xs leading-5 text-white/30">{canonicalUrl}</p>

            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 text-sm text-white/70 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
              复制链接
            </button>

            <button
              type="button"
              onClick={handleShareLink}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 text-sm text-white/70 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
              分享到其他应用
            </button>

            {cardState === "ready" && storyFile && (
              <button
                type="button"
                onClick={handleShareStory}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-amber-200/20 bg-amber-100/[0.06] px-4 text-sm text-amber-50/80 transition hover:border-amber-100/30 hover:bg-amber-100/[0.1] hover:text-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100/70"
              >
                <Send aria-hidden="true" className="h-4 w-4" />
                分享 Story 图片
              </button>
            )}

            {showDownload && storyFile && (
              <button
                type="button"
                onClick={handleDownloadStory}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-transparent px-4 text-sm text-white/60 transition hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                下载 Story 图片
              </button>
            )}

            {cardState === "unavailable" && (
              <p className="text-xs leading-5 text-white/40">
                Story 图片暂时无法生成，链接仍然可以分享。
              </p>
            )}

            {message && (
              <p role="status" aria-live="polite" className="text-xs leading-5 text-amber-100/70">
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
