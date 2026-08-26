import Link from "next/link";
import Image from "next/image";
import type { AdminComment } from "./types";

type Props = {
  comment: AdminComment;
  getPostHref: (comment: AdminComment) => string;
  hideComment: (commentId: string) => void;
  restoreComment: (commentId: string) => void;
  deleteComment: (commentId: string) => void;
  clearModeration: (commentId: string) => void;
};

export default function CommentCard({
  comment,
  getPostHref,
  hideComment,
  restoreComment,
  deleteComment,
  clearModeration,
}: Props) {
  const profile = Array.isArray(comment.profiles)
    ? comment.profiles[0]
    : comment.profiles;

  const post = Array.isArray(comment.posts)
    ? comment.posts[0]
    : comment.posts;

  const moderation = comment.moderation_flag;
  const isPending = moderation?.status === "pending";
  const permanentDeleteAt = comment.deleted_at
    ? new Date(
        new Date(comment.deleted_at).getTime() + 30 * 24 * 60 * 60 * 1000
      )
    : null;

  return (
    <div className="min-w-0 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950/50 p-6">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          {isPending && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-100">
              <span className="font-semibold">等待人工检查</span>
              <span className="text-red-300/80">
                检测到：{moderation.matched_keywords.join("、")}
              </span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.username || "居民"}
                  width={44}
                  height={44}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm">
                  🌙
                </div>
              )}
            </div>

            <div className="min-w-0">
              <p className="safe-text font-semibold text-zinc-100">
                {profile?.username || "未知居民"}
              </p>

              <p className="text-xs text-zinc-600">
                {new Date(comment.created_at).toLocaleString("zh-CN")}
              </p>
            </div>
          </div>

          <p className="safe-pre rounded-2xl border border-zinc-800 bg-black/30 p-4 text-sm leading-8 text-zinc-300">
            {comment.content}
          </p>

          {comment.is_deleted && permanentDeleteAt && (
            <p className="text-xs text-amber-200/60">
              预计永久删除：{permanentDeleteAt.toLocaleString("zh-CN")}
            </p>
          )}

            <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                <span>
                    目标：
                    {post?.type === "diary"
                    ? "日记"
                    : post?.type === "article"
                    ? "文章"
                    : "未知内容"}
                </span>

                {post?.title && (
                    <span>
                    标题：
                    {post.title}
                    </span>
                )}

                {comment.author_id && (
                    <Link
                    href={`/admin/users/${comment.author_id}`}
                    className="text-zinc-400 transition hover:text-white"
                    >
                    查看作者后台 →
                    </Link>
                )}

                {post && (
                    <Link
                    href={getPostHref(comment)}
                    target="_blank"
                    className="text-zinc-400 transition hover:text-white"
                    >
                    查看原文 ↗
                    </Link>
                )}

            </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 md:flex-col">
          {isPending && !comment.is_hidden && !comment.is_deleted && (
            <button
              onClick={() => clearModeration(comment.id)}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/20"
            >
              确认正常
            </button>
          )}

          {!comment.is_hidden && !comment.is_deleted && (
            <button
              onClick={() => hideComment(comment.id)}
              className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300 transition hover:bg-yellow-500/20"
            >
              隐藏
            </button>
          )}

          {(comment.is_hidden || comment.is_deleted) && (
            <button
              onClick={() => restoreComment(comment.id)}
              className="rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-300 transition hover:bg-green-500/20"
            >
              恢复
            </button>
          )}

          {!comment.is_deleted && (
            <button
              onClick={() => deleteComment(comment.id)}
              className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/20"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
