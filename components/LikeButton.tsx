"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCompactCount } from "@/lib/format-count";
import styles from "@/components/PostActionButton.module.css";

type Props = {
  postId: number;
  authorId: string;
  initialCount?: number;
  compact?: boolean;
  mobileFullWidth?: boolean;
};

export default function LikeButton({
  postId,
  authorId,
  initialCount = 0,
  compact = false,
  mobileFullWidth = false,
}: Props) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchLikeState() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) return;

      setCurrentUserId(user.id);

      const { data: myLike } = await supabase
        .from("post_likes")
        .select("id, is_active")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (active) setLiked(!!myLike?.is_active);
    }

    fetchLikeState();

    return () => {
      active = false;
    };
  }, [postId]);

  function showMessage(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 3000);
  }

  async function toggleLike() {
    if (loading) return;

    setMessage("");

    if (!currentUserId) {
      showMessage("先登录一下，再把喜欢留下来。");
      return;
    }

    if (currentUserId === authorId) {
      showMessage("这束光已经在你自己的房间里啦。");
      return;
    }

    setLoading(true);

    const { data: existingLike, error: existingError } = await supabase
      .from("post_likes")
      .select("id, is_active, rewarded")
      .eq("post_id", postId)
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (existingError) {
      setLoading(false);
      showMessage(existingError.message);
      return;
    }

    if (existingLike?.is_active) {
      const { error } = await supabase
        .from("post_likes")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingLike.id);

      setLoading(false);

      if (error) {
        showMessage(error.message);
        return;
      }

      setLiked(false);
      setLikeCount((current) => Math.max(current - 1, 0));
      return;
    }

    if (existingLike && !existingLike.is_active) {
      const { error } = await supabase
        .from("post_likes")
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingLike.id);

      if (error) {
        setLoading(false);
        showMessage(error.message);
        return;
      }

      setLiked(true);
      setLikeCount((current) => current + 1);

      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("post_likes")
      .insert([
        {
          post_id: postId,
          user_id: currentUserId,
          is_active: true,
          rewarded: false,
        },
      ])
      .select("id")
      .single();

    if (error) {
      setLoading(false);
      showMessage(error.message);
      return;
    }

    setLiked(true);
    setLikeCount((current) => current + 1);

    setLoading(false);
  }

  return (
    <div
      className={`relative inline-flex items-start ${
        mobileFullWidth ? `w-full md:w-auto ${styles.slot}` : ""
      }`}
    >
      <button
        type="button"
        onClick={toggleLike}
        disabled={loading}
        aria-pressed={liked}
        aria-label={`${liked ? "❤️ 已喜欢" : "🤍 喜欢"} ${likeCount}`}
        className={`rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${
          mobileFullWidth ? `w-full md:w-auto ${styles.action}` : ""
        } ${
          compact ? "px-5 py-2.5 text-sm" : "px-5 py-3 text-sm"
        } ${
          liked
            ? "border-pink-500/30 bg-pink-500/10 text-pink-200"
            : "border-white/10 bg-white/[0.04] text-white/45 hover:border-pink-500/25 hover:text-pink-100"
        }`}
      >
        {mobileFullWidth ? (
          <>
            <span aria-hidden="true" data-mobile-like className={styles.mobileLike}>
              <Heart aria-hidden="true" className={styles.heart} fill={liked ? "currentColor" : "none"} />
              <span>{liked && <span className={styles.likedPrefix}>已</span>}喜欢</span>
              <span className={styles.count} title={String(likeCount)}>{formatCompactCount(likeCount)}</span>
            </span>
            <span aria-hidden="true" data-desktop-like className={styles.desktopLike}>
              {liked ? "❤️ 已喜欢" : "🤍 喜欢"} {likeCount}
            </span>
          </>
        ) : <>{liked ? "❤️ 已喜欢" : "🤍 喜欢"} {likeCount}</>}
      </button>

      {message && (
        <p
          role="status"
          className="pointer-events-none fixed left-1/2 top-24 z-[120] w-max max-w-[calc(100vw-2rem)] animate-[mobile-like-notice_3s_ease-in-out_forwards] rounded-xl border border-yellow-300/25 bg-yellow-200/15 px-4 py-3 text-xs leading-5 text-yellow-50/90 shadow-2xl shadow-black backdrop-blur-xl md:absolute md:left-0 md:top-full md:z-20 md:mt-2 md:max-w-[min(220px,calc(100vw-2rem))] md:animate-none md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0 md:text-amber-200/75 md:shadow-none md:backdrop-blur-none"
        >
          {message}
        </p>
      )}
    </div>
  );
}
