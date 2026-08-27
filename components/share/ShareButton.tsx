"use client";

import { Share2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ShareSheet from "@/components/share/ShareSheet";
import type { SharePostType } from "@/lib/sharing/model";
import styles from "@/components/PostActionButton.module.css";

export type ShareButtonProps = {
  postId: string | number;
  postType: SharePostType;
  title: string;
  canonicalUrl: string;
  version: string;
  isPublic: boolean;
  isOwner: boolean;
  mobileFullWidth?: boolean;
};

export default function ShareButton({
  postId,
  postType,
  title,
  canonicalUrl,
  version,
  isPublic,
  isOwner,
  mobileFullWidth = false,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeSheet = useCallback(() => setOpen(false), []);
  const widthClass = mobileFullWidth ? `w-full md:w-auto ${styles.action}` : "";

  if (!isPublic) {
    if (!isOwner) return null;

    return (
      <button
        type="button"
        disabled
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/30 disabled:cursor-not-allowed ${widthClass}`}
      >
        <Share2 aria-hidden="true" className="h-4 w-4" />
        公开后可分享
      </button>
    );
  }

  const imageUrl = `/api/share-card/${postType}/${postId}?v=${encodeURIComponent(version)}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white/65 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 ${widthClass}`}
      >
        <Share2 aria-hidden="true" className="h-4 w-4" />
        分享
      </button>

      {open && createPortal(
        <ShareSheet
          title={title}
          canonicalUrl={canonicalUrl}
          imageUrl={imageUrl}
          filename={`our-little-age-${postType}-${postId}-story.png`}
          returnFocusRef={triggerRef}
          onClose={closeSheet}
        />,
        document.body,
      )}
    </>
  );
}
