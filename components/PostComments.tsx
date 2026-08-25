"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import ReportButton from "@/components/ReportButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  buildCommentThreads,
  getReplyDepth,
} from "@/lib/comments/thread";

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
  parent_id: string | null;
  depth: number | null;
  profiles: ProfileInfo | ProfileInfo[] | null;
  likeCount?: number;
  likedByMe?: boolean;
};

type CommentLikeRow = {
  comment_id: string;
  user_id: string;
  is_active: boolean;
};

function getProfile(profile: ProfileInfo | ProfileInfo[] | null) {
  if (Array.isArray(profile)) return profile[0] || null;
  return profile;
}

type CommentRowProps = {
  comment: CommentItem;
  replyTo?: CommentItem | null;
  compact?: boolean;
  currentUserId: string;
  likeLoadingId: string | null;
  onLike: (comment: CommentItem) => void;
  onReply: (comment: CommentItem) => void;
  onDelete: (id: string) => void;
};

function CommentRow({
  comment,
  replyTo = null,
  compact = false,
  currentUserId,
  likeLoadingId,
  onLike,
  onReply,
  onDelete,
}: CommentRowProps) {
  const profile = getProfile(comment.profiles);
  const replyToProfile = replyTo ? getProfile(replyTo.profiles) : null;
  const profileHref = profile?.username
    ? `/u/${encodeURIComponent(profile.username)}`
    : null;
  const residentName = profile?.username || "已离开的居民";
  const avatarFallback = residentName.trim().charAt(0) || "居";
  const avatarClassName = compact
    ? "h-8 w-8 text-xs"
    : "h-10 w-10 text-sm md:h-11 md:w-11";
  const avatar = profile?.avatar_url ? (
    <img
      src={profile.avatar_url}
      alt={residentName}
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-white/55">
      {avatarFallback}
    </span>
  );

  return (
    <div className={`flex items-start ${compact ? "gap-3" : "gap-3 md:gap-4"}`}>
      {profileHref ? (
        <Link
          href={profileHref}
          className={`${avatarClassName} shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] transition hover:scale-105 hover:border-white/25`}
          title="进入居民房间"
        >
          {avatar}
        </Link>
      ) : (
        <div
          className={`${avatarClassName} shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]`}
        >
          {avatar}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {profileHref ? (
            <Link
              href={profileHref}
              className="safe-text inline-flex max-w-full text-sm font-medium text-white/80 transition hover:text-white"
            >
              {residentName}
            </Link>
          ) : (
            <span className="safe-text text-sm font-medium text-white/80">
              {residentName}
            </span>
          )}

          <span className="text-xs text-white/25">
            {new Date(comment.created_at).toLocaleString("zh-CN")}
          </span>
        </div>

        <p
          className={`whitespace-pre-wrap break-words text-sm text-white/65 [overflow-wrap:anywhere] ${
            compact ? "mt-3 leading-7" : "mt-4 leading-7 md:leading-8"
          }`}
        >
          {replyTo && (
            <span className="text-fuchsia-200/65">
              回复 {replyToProfile?.username || "一位居民"}：
            </span>
          )}
          {comment.content}
        </p>

        <div
          className={`flex flex-wrap items-center gap-x-5 gap-y-1 ${compact ? "mt-3" : "mt-4"}`}
        >
          <button
            type="button"
            onClick={() => onLike(comment)}
            disabled={likeLoadingId === comment.id}
            className={`inline-flex min-h-11 items-center gap-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
              comment.likedByMe
                ? "text-pink-200"
                : "text-white/35 hover:text-pink-100"
            }`}
          >
            <span aria-hidden="true">{comment.likedByMe ? "💗" : "♡"}</span>
            <span>
              {comment.likedByMe ? "已喜欢" : "喜欢"} {comment.likeCount || 0}
            </span>
          </button>

          <button
            type="button"
            aria-label={`回复 ${residentName}`}
            onClick={() => onReply(comment)}
            className="inline-flex min-h-11 items-center gap-1.5 text-xs text-white/35 transition hover:text-white/75"
          >
            <span aria-hidden="true">↩</span>
            <span>回复</span>
          </button>

          {currentUserId !== comment.author_id && (
            <ReportButton
              targetType="comment"
              targetId={comment.id}
              authorId={comment.author_id}
              compact
              quiet
            />
          )}

          {currentUserId === comment.author_id && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              className="min-h-11 text-xs text-red-200/45 transition hover:text-red-200"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PostComments({ postId }: Props) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [content, setContent] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("oldest");
  const [replyContent, setReplyContent] = useState("");
  const [replyTarget, setReplyTarget] = useState<CommentItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [likeLoadingId, setLikeLoadingId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const [currentUserId, setCurrentUserId] = useState("");
  const [message, setMessage] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const commentThreads = useMemo(
    () => buildCommentThreads(comments, sortMode),
    [comments, sortMode]
  );

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
        parent_id,
        depth,
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
        : { data: [] as CommentLikeRow[] };

    const likeCountMap = new Map<string, number>();
    const likedByMeMap = new Map<string, boolean>();

    (likesData || []).forEach((like: CommentLikeRow) => {
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

  function startReply(comment: CommentItem) {
    if (!currentUserId) {
      showMessage("先登录一下，再回复这位居民。");
      return;
    }

    if (replyTarget?.id !== comment.id) {
      setReplyContent("");
    }

    setReplyTarget(comment);
  }

  async function submitReply() {
    if (!replyTarget) return;

    const finalContent = replyContent.trim();

    if (!finalContent) {
      showMessage("写一点点回应吧，哪怕只是很短的一句。");
      return;
    }

    if (finalContent.length < 2) {
      showMessage("回复至少需要 2 个字。");
      return;
    }

    const user = await fetchCurrentUser();

    if (!user) {
      showMessage("先登录一下，再回复这位居民。");
      return;
    }

    setReplyLoading(true);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single();

    if (profileError) {
      showMessage(profileError.message);
      setReplyLoading(false);
      return;
    }

    if (profile?.status === "muted") {
      showMessage("你目前已被禁言，暂时不能回复。");
      setReplyLoading(false);
      return;
    }

    if (profile?.status === "banned") {
      showMessage("你的账号已被封禁。");
      setReplyLoading(false);
      await supabase.auth.signOut();
      window.location.href = "/";
      return;
    }

    const { error } = await supabase.from("comments").insert([
      {
        post_id: postId,
        author_id: user.id,
        content: finalContent,
        parent_id: replyTarget.id,
        depth: getReplyDepth(replyTarget),
      },
    ]);

    setReplyLoading(false);

    if (error) {
      showMessage(error.message);
      return;
    }

    setReplyContent("");
    setReplyTarget(null);
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

        {commentThreads.map((thread) => {
          const replyTargetInThread =
            replyTarget &&
            (replyTarget.id === thread.root.id ||
              thread.replies.some(
                ({ comment }) => comment.id === replyTarget.id
              ));
          const replyTargetProfile = replyTarget
            ? getProfile(replyTarget.profiles)
            : null;
          const showThread = thread.replies.length > 0 || replyTargetInThread;

          return (
            <article
              key={thread.root.id}
              className="min-w-0 overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/[0.03] md:rounded-[1.7rem]"
            >
              <div className="p-5 md:p-6">
                <CommentRow
                  comment={thread.root}
                  currentUserId={currentUserId}
                  likeLoadingId={likeLoadingId}
                  onLike={toggleCommentLike}
                  onReply={startReply}
                  onDelete={openDeleteCommentDialog}
                />
              </div>

              {showThread && (
                <div className="relative mx-4 mb-4 ml-7 border-l border-fuchsia-200/20 pl-5 md:mx-6 md:mb-6 md:ml-12 md:pl-7">
                  {thread.replies.map(({ comment, replyTo }) => (
                    <div
                      key={comment.id}
                      className="border-t border-white/[0.06] py-4 first:border-t-0 first:pt-1"
                    >
                      <CommentRow
                        comment={comment}
                        replyTo={replyTo}
                        compact
                        currentUserId={currentUserId}
                        likeLoadingId={likeLoadingId}
                        onLike={toggleCommentLike}
                        onReply={startReply}
                        onDelete={openDeleteCommentDialog}
                      />
                    </div>
                  ))}

                  {replyTargetInThread && replyTarget && (
                    <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black/25">
                      <label
                        htmlFor={`reply-${thread.root.id}`}
                        className="sr-only"
                      >
                        回复{replyTargetProfile?.username || "一位居民"}
                      </label>
                      <textarea
                        id={`reply-${thread.root.id}`}
                        rows={2}
                        autoFocus
                        value={replyContent}
                        onChange={(event) => setReplyContent(event.target.value)}
                        placeholder={`回复 ${replyTargetProfile?.username || "这位居民"}，写一点温柔的话...`}
                        className="w-full resize-none bg-transparent px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-white/25"
                      />
                      <div className="flex justify-end gap-2 border-t border-white/[0.06] p-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTarget(null);
                            setReplyContent("");
                          }}
                          className="min-h-11 px-4 text-xs text-white/40 transition hover:text-white/70"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={submitReply}
                          disabled={replyLoading}
                          className="min-h-11 rounded-md bg-white px-5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {replyLoading ? "送出中..." : "送出回复"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
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
