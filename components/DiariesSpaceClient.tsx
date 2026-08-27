"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

type ProfileInfo = {
  username: string | null;
  avatar_url: string | null;
};

export type DiaryPost = {
  id: number;
  content: string;
  published_at: string;
  author_id: string;
  authorProfile?: ProfileInfo | null;
  likeCount?: number;
  commentCount?: number;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function getExcerpt(content: string) {
  return content.trim().slice(0, 220);
}

export default function DiariesSpaceClient({
  initialPosts,
  initialLoadFailed = false,
}: {
  initialPosts: DiaryPost[];
  initialLoadFailed?: boolean;
}) {
  const router = useRouter();

  const [sortMode, setSortMode] = useState<"newest" | "hot">("newest");
  const [visibleCount, setVisibleCount] = useState(20);

  const sortedPosts = [...initialPosts].sort((a, b) => {
    if (sortMode === "hot") {
      const scoreA = (a.likeCount || 0) * 3 + (a.commentCount || 0) * 2;
      const scoreB = (b.likeCount || 0) * 3 + (b.commentCount || 0) * 2;

      return scoreB - scoreA;
    }

    return (
      new Date(b.published_at).getTime() -
      new Date(a.published_at).getTime()
    );
  });

  const visiblePosts = sortedPosts.slice(0, visibleCount);
  const hasMore = visibleCount < sortedPosts.length;

  return (
    <main className="min-h-screen overflow-x-hidden bg-black px-5 pb-24 pt-16 text-white md:px-6 md:py-24">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black via-zinc-950 to-black" />
      <div className="fixed left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl md:h-[620px] md:w-[620px]" />

      <div className="mx-auto max-w-5xl">
        <Link
          href="/space"
          className="mb-7 inline-flex text-sm text-white/35 transition hover:text-white/70 md:mb-10"
        >
          ← 回到深夜广场
        </Link>

        <header className="mb-7 md:mb-12">
          <p className="text-xs tracking-[0.4em] text-white/25 md:tracking-[0.45em]">
            PUBLIC DIARIES
          </p>

          <h1 className="mt-2 text-5xl font-light tracking-tight md:mt-6 md:text-6xl">
            日记广场
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-7 text-white/35 md:mt-6 md:leading-8">
            有些人把今天留在这里，也许只是希望世界某个角落，会有人刚好看到。
          </p>

          <div className="mt-6 flex flex-wrap gap-2 md:mt-8 md:gap-3">
            <button
              type="button"
              onClick={() => {
                setSortMode("newest");
                setVisibleCount(20);
              }}
              className={`rounded-full border px-4 py-2.5 text-sm transition md:px-5 md:py-3 ${
                sortMode === "newest"
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/[0.04] text-white/45 hover:border-white/25 hover:text-white"
              }`}
            >
              最新
            </button>

            <button
              type="button"
              onClick={() => {
                setSortMode("hot");
                setVisibleCount(20);
              }}
              className={`rounded-full border px-4 py-2.5 text-sm transition md:px-5 md:py-3 ${
                sortMode === "hot"
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/[0.04] text-white/45 hover:border-white/25 hover:text-white"
              }`}
            >
              热门
            </button>

            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/45 transition hover:border-white/25 hover:text-white md:px-5 md:py-3"
            >
              刷新
            </button>
          </div>
        </header>

        {initialLoadFailed && (
          <div role="alert" className="py-8 text-center md:py-14">
            <p className="text-xl text-white/70">日记暂时加载失败</p>
            <p className="mt-4 text-sm leading-8 text-white/45">
              暂时无法读取日记，请稍后重试。
            </p>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              重新加载
            </button>
          </div>
        )}

        {!initialLoadFailed && initialPosts.length === 0 && (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-2xl md:rounded-[2.5rem] md:p-14">
            <p className="text-xl text-white/55">今晚还没有人留下日记。</p>

            <p className="mt-4 text-sm leading-8 text-white/30">
              也许你会成为今晚第一个说话的人。
            </p>

            <Link
              href="/diary/new"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              ✍️ 写下今天
            </Link>
          </div>
        )}

        {!initialLoadFailed && initialPosts.length > 0 && (
          <>
            <div className="space-y-4 md:space-y-6">
              {visiblePosts.map((post) => {
                const author = post.authorProfile;
                const authorHref = author?.username
                  ? `/u/${encodeURIComponent(author.username)}`
                  : null;

                return (
                  <article
                    key={post.id}
                    className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-2xl transition-all duration-500 hover:border-white/20 hover:bg-white/[0.05] md:rounded-[2.2rem] md:p-8"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        {authorHref ? (
                          <Link
                            href={authorHref}
                            className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] transition hover:scale-105 hover:border-white/25"
                            title="进入居民房间"
                          >
                            {author?.avatar_url ? (
                              <img
                                src={author.avatar_url}
                                alt={author.username || "居民"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm">
                                🌙
                              </div>
                            )}
                          </Link>
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm">
                            🌙
                          </div>
                        )}

                        <div className="min-w-0">
                          {authorHref ? (
                            <Link
                              href={authorHref}
                              className="safe-text block truncate text-sm font-medium text-white/70 transition hover:text-white"
                            >
                              {author?.username || "已离开的居民"}
                            </Link>
                          ) : (
                            <p className="safe-text truncate text-sm font-medium text-white/45">
                              已离开的居民
                            </p>
                          )}

                          <p className="mt-1 truncate text-xs text-white/25">
                            {formatDate(post.published_at)}
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/40 md:px-4 md:py-2">
                        🌙 日记
                      </span>
                    </div>

                    <Link
                      href={`/diary/${post.id}`}
                      className="group mt-5 block min-w-0"
                    >
                      <p className="safe-pre line-clamp-4 break-words text-[15px] leading-[2] text-white/70 md:line-clamp-5 md:text-[17px] md:leading-[2.2]">
                        {getExcerpt(post.content)}
                        {post.content.length > 220 ? "..." : ""}
                      </p>

                      <div className="mt-6 flex flex-wrap gap-2 md:mt-8 md:gap-3">
                        <span className="rounded-full border border-pink-500/20 bg-pink-500/[0.06] px-3 py-1.5 text-xs text-pink-100/60 md:px-4 md:py-2">
                          ❤️ 喜欢 {post.likeCount || 0}
                        </span>

                        <span className="rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-3 py-1.5 text-xs text-blue-100/60 md:px-4 md:py-2">
                          💬 评论 {post.commentCount || 0}
                        </span>
                      </div>

                      <p className="mt-6 text-sm text-white/25 transition group-hover:text-white/50 md:mt-8">
                        翻开这一天 →
                      </p>
                    </Link>
                  </article>
                );
              })}
            </div>

            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + 20)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-7 py-3 text-sm text-white/55 transition hover:border-white/25 hover:text-white"
                >
                  加载更多日记
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
