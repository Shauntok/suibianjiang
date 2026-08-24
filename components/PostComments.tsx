"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ReportButton from "@/components/ReportButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type Props = {
  postId: number;
};

type SortMode = "oldest" | "newest";

type ProfileInfo = {
  username: string | null;
  avatar_url: string | null;
};

type CommentItem = {
  id: string;
  post_id: number;
  author_id: string;
  content: string;
  created_at: string;
  profiles: ProfileInfo | ProfileInfo[] | null;
  likeCount?: number;
  likedByMe?: boolean;
};

function getProfile(profile: ProfileInfo | ProfileInfo[] | null) {
  if (Array.isArray(profile)) return profile[0] || null;
  return profile;
}

export default function PostComments({ postId }: Props) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [content, setContent] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("oldest");

  const [loading, setLoading] = useState(false);
  const [likeLoadingId, setLikeLoadingId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const [currentUserId, setCurrentUserId] = useState("");
  const [message, setMessage] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  useEffect(() => {
    fetchComments();
  }, [postId, sortMode]);

  function showMessage(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 3500);
  }

  async function fetchCurrentUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) setCurrentUserId(user.id);

    return user;
  }

  async function fetchComments() {
    setFetching(true);

    const user = await fetchCurrentUser();
    const { data, error } = await supabase
      .from("comments")
      .select(`
        id,
        post_id,
        author_id,
        content,
        created_at,
        profiles (
          username,
          avatar_url
        )
      `)
      .eq("post_id", postId)
      .eq("is_deleted", false)
      .eq("is_hidden", false)
      .order("created_at", {
        ascending: sortMode === "oldest",
      });

    if (error) {
      showMessage(error.message);
      setFetching(false);
      return;
    }

    const rows = (data || []) as CommentItem[];
    const commentIds = rows.map((comment) => comment.id);

    const { data: likesData } =
      commentIds.length > 0
        ? await supabase
            .from("comment_likes")
            .select("comment_id, user_id, is_active")
            .in("comment_id", commentIds)
            .eq("is_active", true)
        : { data: [] as any[] };

    const likeCountMap = new Map<string, number>();
    const likedByMeMap = new Map<string, boolean>();

    (likesData || []).forEach((like: any) => {
      likeCountMap.set(
        like.comment_id,
        (likeCountMap.get(like.comment_id) || 0) + 1
      );

      if (user && like.user_id === user.id) {
        likedByMeMap.set(like.comment_id, true);
      }
    });

    setComments(
      rows.map((comment) => ({
        ...comment,
        likeCount: likeCountMap.get(comment.id) || 0,
        likedByMe: likedByMeMap.get(comment.id) || false,
      }))
    );

    setFetching(false);
  }

  async function submitComment() {
    const finalContent = content.trim();

    if (!finalContent) {
      showMessage("写一点点回应吧，哪怕只是很短的一句。");
      return;
    }

    if (finalContent.length < 2) {
      showMessage("留言至少需要 2 个字。");
      return;
    }

    const user = await fetchCurrentUser();

    if (!user) {
      showMessage("先登录一下，再把留言留下来。");
      return;
    }

    setLoading(true);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single();

    if (profileError) {
      showMessage(profileError.message);
      setLoading(false);
      return;
    }

    if (profile?.status === "muted") {
      showMessage("你目前已被禁言，暂时不能留言。");
      setLoading(false);
      return;
    }

    if (profile?.status === "banned") {
      showMessage("你的账号已被封禁。");
      await supabase.auth.signOut();
      window.location.href = "/";
      return;
    }

    const { error } = await supabase.from("comments").insert([
      {
        post_id: postId,
        author_id: user.id,
        content: finalContent,
      },
    ]);

    setLoading(false);

    if (error) {
      showMessage(error.message);
      return;
    }

    setContent("");
    fetchComments();
  }

  async function toggleCommentLike(comment: CommentItem) {
    if (!currentUserId) {
      showMessage("先登录一下，再把喜欢留下来。");
      return;
    }

    if (currentUserId === comment.author_id) {
      showMessage("这束光已经属于你自己了。");
      return;
    }

    setLikeLoadingId(comment.id);

    const { data: existingLike, error: existingError } = await supabase
      .from("comment_likes")
      .select("id, is_active, rewarded")
      .eq("comment_id", comment.id)
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (existingError) {
      setLikeLoadingId(null);
      showMessage(existingError.message);
      return;
    }

    if (existingLike?.is_active) {
      const { error } = await supabase
        .from("comment_likes")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingLike.id);

      setLikeLoadingId(null);

      if (error) {
        showMessage(error.message);
        return;
      }

      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                likedByMe: false,
                likeCount: Math.max((item.likeCount || 0) - 1, 0),
              }
            : item
        )
      );

      return;
    }

    if (existingLike && !existingLike.is_active) {
      const { error } = await supabase
        .from("comment_likes")
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingLike.id);

      if (error) {
        setLikeLoadingId(null);
        showMessage(error.message);
        return;
      }

      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                likedByMe: true,
                likeCount: (item.likeCount || 0) + 1,
              }
            : item
        )
      );

      setLikeLoadingId(null);
      return;
    }

    const { error } = await supabase
      .from("comment_likes")
      .insert([
        {
          comment_id: comment.id,
          user_id: currentUserId,
          is_active: true,
          rewarded: false,
        },
      ])
      .select("id")
      .single();

    if (error) {
      setLikeLoadingId(null);
      showMessage(error.message);
      return;
    }

    setComments((current) =>
      current.map((item) =>
        item.id === comment.id
          ? {
              ...item,
              likedByMe: true,
              likeCount: (item.likeCount || 0) + 1,
            }
          : item
      )
    );

    setLikeLoadingId(null);
  }

  function openDeleteCommentDialog(id: string) {
    setDeleteTargetId(id);
    setShowDeleteDialog(true);
  }

  async function deleteComment() {
    if (!deleteTargetId) return;

    setDeleting(true);

    const user = await fetchCurrentUser();

    if (!user) {
      setDeleting(false);
      setShowDeleteDialog(false);
      showMessage("先登录一下，再删除留言。");
      return;
    }

    const { error } = await supabase
      .from("comments")
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deleteTargetId)
      .eq("author_id", user.id);

    setDeleting(false);

    if (error) {
      setShowDeleteDialog(false);
      showMessage(error.message);
      return;
    }

    setShowDeleteDialog(false);
    setDeleteTargetId(null);
    fetchComments();
  }

  return (
    <section className="mt-12 border-t border-white/10 pt-8 md:mt-24 md:pt-12">
      <div>
        <p className="text-xs tracking-[0.35em] text-white/25">COMMENTS</p>

        <h2 className="mt-3 text-2xl font-light md:mt-4 md:text-3xl">
          居民留言
        </h2>

        <p className="mt-3 text-sm leading-7 text-white/35 md:mt-4">
          在这里留下温柔一点的回应。也许作者今晚刚好需要这一句话。
        </p>
      </div>

      {message && (
        <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {message}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.035] backdrop-blur-2xl md:mt-8 md:rounded-[2rem]">
        <textarea
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="写下你的留言..."
          className="w-full resize-none bg-transparent px-5 py-4 text-sm leading-7 text-white outline-none break-words whitespace-pre-wrap placeholder:text-white/25 md:py-5 md:leading-8"
        />

        <div className="flex justify-end border-t border-white/5 bg-white/[0.015] px-5 py-4">
          <button
            onClick={submitComment}
            disabled={loading}
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40 md:px-7"
          >
            {loading ? "送出中..." : "留下留言"}
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 md:mt-14">
        <p className="text-sm text-white/35">
          {fetching
            ? "正在翻看留言..."
            : comments.length > 0
              ? `${comments.length} 条留言`
              : "还没有留言"}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSortMode("oldest")}
            className={`rounded-full border px-4 py-2 text-xs transition ${
              sortMode === "oldest"
                ? "border-white bg-white text-black"
                : "border-white/10 bg-white/[0.04] text-white/45 hover:border-white/20 hover:text-white/75"
            }`}
          >
            最早
          </button>

          <button
            type="button"
            onClick={() => setSortMode("newest")}
            className={`rounded-full border px-4 py-2 text-xs transition ${
              sortMode === "newest"
                ? "border-white bg-white text-black"
                : "border-white/10 bg-white/[0.04] text-white/45 hover:border-white/20 hover:text-white/75"
            }`}
          >
            最新
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4 md:space-y-5">
        {!fetching && comments.length === 0 && (
          <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.03] p-8 text-center md:rounded-[2rem] md:p-10">
            <p className="text-sm text-white/35">这里暂时还没有留言。</p>
          </div>
        )}

        {comments.map((comment) => {
          const profile = getProfile(comment.profiles);
          const profileHref = profile?.username
            ? `/u/${encodeURIComponent(profile.username)}`
            : null;

          return (
            <div
              key={comment.id}
              className="min-w-0 overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.03] p-5 md:rounded-[2rem] md:p-6"
            >
              <div className="flex items-start gap-3 md:gap-4">
                {profileHref ? (
                  <Link
                    href={profileHref}
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] transition hover:scale-105 hover:border-white/25 md:h-11 md:w-11"
                    title="进入居民房间"
                  >
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.username || "居民"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm">
                        🌙
                      </div>
                    )}
                  </Link>
                ) : (
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] md:h-11 md:w-11">
                    <div className="flex h-full w-full items-center justify-center text-sm">
                      🌙
                    </div>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  {profileHref ? (
                    <Link
                      href={profileHref}
                      className="safe-text inline-flex max-w-full text-sm font-medium text-white/80 transition hover:text-white"
                    >
                      {profile?.username || "已离开的居民"}
                    </Link>
                  ) : (
                    <p className="safe-text text-sm font-medium text-white/80">
                      已离开的居民
                    </p>
                  )}

                  <p className="mt-1 text-xs text-white/25">
                    {new Date(comment.created_at).toLocaleString("zh-CN")}
                  </p>

                  <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-white/65 [overflow-wrap:anywhere] md:leading-8">
                    {comment.content}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-2 md:gap-4">
                    <button
                      type="button"
                      onClick={() => toggleCommentLike(comment)}
                      disabled={likeLoadingId === comment.id}
                      className={`rounded-full border px-5 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        comment.likedByMe
                          ? "border-pink-500/30 bg-pink-500/10 text-pink-200"
                          : "border-white/10 bg-white/[0.04] text-white/45 hover:border-pink-500/25 hover:text-pink-100"
                      }`}
                    >
                      {comment.likedByMe ? "已喜欢" : "喜欢"} ·{" "}
                      {comment.likeCount || 0}
                    </button>

                    {currentUserId !== comment.author_id && (
                      <ReportButton
                        targetType="comment"
                        targetId={comment.id}
                        authorId={comment.author_id}
                        compact
                      />
                    )}

                    {currentUserId === comment.author_id && (
                      <button
                        onClick={() => openDeleteCommentDialog(comment.id)}
                        className="rounded-full border border-red-500/20 bg-red-500/[0.05] px-5 py-2.5 text-sm text-red-200/55 transition hover:bg-red-500/[0.1] hover:text-red-200"
                      >
                        删除留言
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        title="删除这条留言？"
        description="这条留言会从当前页面隐藏。之后如果需要，我们可以再做回收站或管理端恢复。"
        confirmText="删除留言"
        cancelText="再想想"
        danger
        loading={deleting}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeleteTargetId(null);
        }}
        onConfirm={deleteComment}
      />
    </section>
  );
}
