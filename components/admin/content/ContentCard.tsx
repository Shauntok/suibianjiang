import Link from "next/link";
import { Eye } from "lucide-react";

export type AdminContentPost = {
  id: number;
  type: string | null;
  status: string | null;
  visibility: string | null;
  created_at: string;
  author_id: string | null;
  title?: string | null;
  slug?: string | null;
  content?: string | null;
  published_at?: string | null;
};

type AdminContentAuthor = {
  username?: string | null;
} | null | undefined;

type Props = {
  post: AdminContentPost;
  author: AdminContentAuthor;
  updateVisibility: (id: number, visibility: string) => void;
  softDeletePost: (id: number) => void;
  getTitle: (post: AdminContentPost) => string;
  getViewHref: (post: AdminContentPost) => string;
  viewCount: number | null;
  viewCountUnavailable: boolean;
};

export default function ContentCard({
  post,
  author,
  updateVisibility,
  softDeletePost,
  getTitle,
  getViewHref,
  viewCount,
  viewCountUnavailable,
}: Props) {
  return (
    <div
      className="
        min-w-0 overflow-hidden
        rounded-3xl border border-zinc-800
        bg-zinc-950/50 p-6
        transition hover:border-zinc-600
      "
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">
            {post.type === "diary" ? "📔 日记" : "📖 文章"}
          </span>

          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-300">
            {post.status || "unknown"}
          </span>

          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-300">
            {post.visibility || "public"}
          </span>

          <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-500">
            ID {post.id}
          </span>
        </div>

        {(viewCountUnavailable || viewCount !== null) && (
          <div className="flex basis-full items-center gap-2 text-xs text-zinc-500 sm:ml-auto sm:basis-auto sm:justify-end">
            <Eye aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>
              {viewCountUnavailable
                ? "阅读数据暂不可用"
                : `${new Intl.NumberFormat("zh-CN", {
                    maximumFractionDigits: 0,
                  }).format(viewCount as number)} 次有效阅读`}
            </span>
          </div>
        )}
      </div>

      <h2 className="safe-text mt-5 text-2xl font-bold text-white">
        {getTitle(post)}
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span>作者：{author?.username || "未知居民"}</span>

        {post.author_id && (
          <Link
            href={`/admin/users/${post.author_id}`}
            className="text-zinc-400 transition hover:text-white"
          >
            查看作者后台 →
          </Link>
        )}
      </div>

      {post.content && (
        <p className="safe-pre mt-4 line-clamp-3 max-w-full overflow-hidden text-sm leading-7 text-zinc-500">
          {post.content}
        </p>
      )}

      <p className="mt-4 text-xs text-zinc-600">
        创建：{new Date(post.created_at).toLocaleString("zh-CN")}
        {post.published_at &&
          ` · 发布：${new Date(post.published_at).toLocaleString("zh-CN")}`}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">

        <Link
          href={getViewHref(post)}
          target="_blank"
          className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-white hover:text-white"
        >
          查看
        </Link>

        <Link
          href={`/admin/content/${post.id}`}
          className="rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300 transition hover:bg-violet-500/20"
        >
          后台全文
        </Link>

        <button
          onClick={() => updateVisibility(post.id, "public")}
          className="rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-300 transition hover:bg-green-500/20"
        >
          公开
        </button>

        <button
          onClick={() => updateVisibility(post.id, "hidden")}
          className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300 transition hover:bg-yellow-500/20"
        >
          隐藏
        </button>

        <button
          onClick={() => updateVisibility(post.id, "private")}
          className="rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-500/20"
        >
          私密
        </button>

        <button
          onClick={() => updateVisibility(post.id, "unlisted")}
          className="rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-300 transition hover:bg-purple-500/20"
        >
          链接可见
        </button>

        <button
          onClick={() => softDeletePost(post.id)}
          className="
            rounded-full
            border border-red-500/30
            bg-red-500/10
            px-4 py-2
            text-sm text-red-300
            transition
            hover:bg-red-500/20
          "
        >
          移入回收站
        </button>

      </div>
    </div>
  );
}
