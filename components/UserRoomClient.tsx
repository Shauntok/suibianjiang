"use client";

import { useState } from "react";
import Link from "next/link";
import TranslatedText from "@/components/TranslatedText";
import RoomStatusButton from "@/components/RoomStatusButton";
import RoomAvatarEditor from "@/components/RoomAvatarEditor";

function getImages(content: string) {
  return Array.from(content.matchAll(/!\[[^\]]*\]\((.*?)\)/g))
    .map((match) => match[1])
    .slice(0, 3);
}

function getExcerpt(content: string) {
  return content
    .replace(/!\[[^\]]*\]\(.*?\)/g, "")
    .trim()
    .slice(0, 140);
}

function getPostTitle(post: any) {
  if (post.title) return post.title;

  const date = new Date(
    post.published_at || post.created_at
  ).toLocaleDateString("zh-CN");

  return `${date} 的日记`;
}

export default function UserRoomClient({
  profile,
  activeTab,
  residentTitle,
  levelProgress,
  joinedDays,
  isStatusExpired,
  visibleBadges,
  publicPosts,
  publicDiaries,
  publicArticles,
  likeCountMapData,
  commentCountMapData,
  roomTheme,
}: any) {
  const likeCountMap = new Map<number, number>(likeCountMapData);
  const commentCountMap = new Map<number, number>(commentCountMapData);

  const [visibleArticleCount, setVisibleArticleCount] = useState(10);
  const [visibleDiaryCount, setVisibleDiaryCount] = useState(10);

  const profilePath = `/u/${encodeURIComponent(profile.username)}`;

  const showDiaries = activeTab === "all" || activeTab === "diary";
  const showArticles = activeTab === "all" || activeTab === "article";

  const visibleArticles = publicArticles.slice(0, visibleArticleCount);
  const visibleDiaries = publicDiaries.slice(0, visibleDiaryCount);

  const hasMoreArticles = visibleArticleCount < publicArticles.length;
  const hasMoreDiaries = visibleDiaryCount < publicDiaries.length;

  function MetaPills({ post }: { post: any }) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 md:mt-5">
        <span className="rounded-full border border-pink-500/20 bg-pink-500/[0.06] px-3 py-1 text-xs text-pink-100/40">
          喜欢 {likeCountMap.get(post.id) || 0}
        </span>

        <span className="rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-3 py-1 text-xs text-blue-100/40">
          评论 {commentCountMap.get(post.id) || 0}
        </span>
      </div>
    );
  }

  function BadgePill({ item, mobileHidden = false }: any) {
    const badge = item.badges;
    if (!badge) return null;

    return (
      <div
        className={`safe-text max-w-full rounded-full border px-3 py-1.5 text-xs backdrop-blur-xl md:px-4 md:py-2 md:text-sm ${
          mobileHidden ? "hidden md:block" : ""
        } ${
          badge.color === "gold"
            ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-100"
            : badge.color === "emerald"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
              : badge.color === "rose"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                : badge.color === "sky"
                  ? "border-sky-500/30 bg-sky-500/10 text-sky-100"
                  : "border-violet-500/30 bg-violet-500/10 text-violet-100"
        }`}
      >
        🎖️ {badge.name}
      </div>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-black px-5 pb-24 pt-16 text-white md:px-6 md:py-24">
      <div className={`fixed inset-0 -z-10 bg-gradient-to-b ${roomTheme}`} />
      <div className="fixed left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl md:h-[620px] md:w-[620px]" />

      <div className="mx-auto max-w-6xl space-y-6 md:space-y-12">
        <Link
          href="/space"
          className="inline-flex text-sm text-white/35 transition hover:text-white/70"
        >
          ← 回到深夜广场
        </Link>

        <section className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] backdrop-blur-2xl md:rounded-[2.8rem]">
          <div className="relative h-[112px] w-full md:h-[300px]">
            {profile.banner_url ? (
              <img
                src={profile.banner_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-zinc-900 via-black to-zinc-950" />
            )}

            <div className="absolute inset-0 bg-black/50" />

            <div className="absolute right-4 top-4">
              <RoomStatusButton
                ownerId={profile.id}
                initialMoodEmoji={!isStatusExpired ? profile.mood_emoji : null}
                initialStatusMessage={
                  !isStatusExpired ? profile.status_message : null
                }
              />
            </div>
          </div>

          <div
            id="about-user"
            className="relative min-w-0 scroll-mt-28 px-5 pb-6 md:px-8 md:pb-10"
          >
            <div className="-mt-9 flex min-w-0 items-end gap-4 md:-mt-16 md:block">
              <RoomAvatarEditor
                profileId={profile.id}
                username={profile.username}
                initialAvatarUrl={profile.avatar_url}
              />

              <div className="mb-2 min-w-0 md:hidden">
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur-xl">
                  <div className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-green-400" />
                  <p className="safe-text truncate text-xs text-white/45">
                    {residentTitle}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 min-w-0 space-y-4 md:mt-7 md:space-y-6">
              <div className="hidden max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 backdrop-blur-xl md:inline-flex md:px-5 md:py-3">
                <div className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-green-400" />
                <p className="safe-text text-xs uppercase tracking-[0.25em] text-white/40 md:tracking-[0.28em]">
                  {residentTitle}
                </p>
              </div>

              <div className="min-w-0">
                <h1 className="safe-text line-clamp-2 break-all text-4xl font-light tracking-tight [overflow-wrap:anywhere] md:text-6xl">
                  {profile.username}
                </h1>

                <p className="mt-2 text-sm text-white/35 md:mt-3">
                  {profile.show_joined_days
                    ? `已在小时代居住 ${joinedDays} 天。`
                    : "正在这个世界留下故事。"}
                </p>
              </div>

              <p className="safe-pre line-clamp-3 max-w-2xl text-sm leading-7 text-white/55 md:line-clamp-none md:text-base md:leading-8">
                {profile.bio || "这个房间暂时还很安静。"}
              </p>

              <div className="flex flex-wrap gap-2 md:gap-3">
                {profile.show_level && (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/45 md:px-4 md:py-2 md:text-sm">
                    Lv.{profile.level || 1}
                  </span>
                )}

                {profile.show_exp && (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/45 md:px-4 md:py-2 md:text-sm">
                    留下的光 {levelProgress.current.toFixed(2)}
                  </span>
                )}

                {profile.show_trust_score && (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/45 md:px-4 md:py-2 md:text-sm">
                    社区信任 {Number(profile.trust_score || 0).toFixed(2)}
                  </span>
                )}
              </div>

              {profile.show_exp && (
                <div className="max-w-xl space-y-2">
                  <div className="flex items-center justify-between gap-4 text-xs text-white/35 md:text-sm">
                    <span>留下的光</span>
                    <span className="truncate">{levelProgress.text}</span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-white/5 md:h-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                      style={{
                        width: `${Math.min(levelProgress.percent, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {visibleBadges.length > 0 && (
                <div
                  id="badges"
                  className="flex flex-wrap gap-2 scroll-mt-28 md:gap-3"
                >
                  {visibleBadges.map((item: any, index: number) => (
                    <BadgePill
                      key={item.id}
                      item={item}
                      mobileHidden={index >= 6}
                    />
                  ))}

                  {visibleBadges.length > 6 && (
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/35 md:hidden">
                      +{visibleBadges.length - 6}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          id="public-writings"
          className="space-y-6 scroll-mt-28 md:space-y-10"
        >
          <div>
            <p className="text-xs tracking-[0.35em] text-white/25 md:tracking-[0.4em]">
              PUBLIC WRITINGS
            </p>

            <h2 className="mt-2 text-2xl font-light md:mt-4 md:text-3xl">
              公开作品
            </h2>

            <div className="mt-4 flex flex-wrap gap-2 md:mt-6 md:gap-3">
              <Link
                href={`${profilePath}?tab=all#public-writings`}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  activeTab === "all"
                    ? "border-white bg-white text-black"
                    : "border-white/10 bg-white/[0.04] text-white/45 hover:border-white/20 hover:text-white/75"
                }`}
              >
                全部 {publicPosts.length}
              </Link>

              <Link
                href={`${profilePath}?tab=article#public-writings`}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  activeTab === "article"
                    ? "border-white bg-white text-black"
                    : "border-white/10 bg-white/[0.04] text-white/45 hover:border-white/20 hover:text-white/75"
                }`}
              >
                文章 {publicArticles.length}
              </Link>

              <Link
                href={`${profilePath}?tab=diary#public-writings`}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  activeTab === "diary"
                    ? "border-white bg-white text-black"
                    : "border-white/10 bg-white/[0.04] text-white/45 hover:border-white/20 hover:text-white/75"
                }`}
              >
                日记 {publicDiaries.length}
              </Link>
            </div>
          </div>

          {publicPosts.length === 0 && (
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-7 text-white/35 md:rounded-[2.2rem] md:p-10">
              这个房间暂时还没有公开内容。
            </div>
          )}

          {showArticles && publicArticles.length > 0 && (
            <div
              id="public-articles"
              className="space-y-4 scroll-mt-28 md:space-y-5"
            >
              {activeTab === "all" && (
                <h3 className="text-lg font-light text-white/75 md:text-xl">
                  文章
                </h3>
              )}

              {visibleArticles.map((post: any) => {
                const imageUrls = getImages(post.content || "");
                const excerpt = getExcerpt(post.content || "");
                const title = getPostTitle(post);

                return (
                  <Link
                    key={post.id}
                    href={`/articles/${post.slug}`}
                    className="group block min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-2xl transition-all duration-700 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.055] md:rounded-[2.4rem] md:p-8"
                  >
                    <p className="text-xs text-white/30">
                      文章 ·{" "}
                      {new Date(
                        post.published_at || post.created_at
                      ).toLocaleString("zh-CN")}
                    </p>

                    <h3 className="safe-text mt-3 line-clamp-2 break-all text-xl font-light text-white/85 [overflow-wrap:anywhere] md:mt-5 md:text-2xl">
                      <TranslatedText text={title} />
                    </h3>

                    {imageUrls.length > 0 && (
                      <div className="mt-4 grid grid-cols-3 gap-2 md:mt-5 md:gap-3">
                        {imageUrls.map((url) => (
                          <img
                            key={url}
                            src={url}
                            alt=""
                            className="aspect-square w-full rounded-xl border border-white/10 object-cover md:rounded-2xl"
                          />
                        ))}
                      </div>
                    )}

                    {excerpt && (
                      <p className="safe-pre mt-4 line-clamp-3 text-sm leading-7 text-white/42 md:mt-5 md:line-clamp-4 md:leading-8">
                        <TranslatedText text={`${excerpt}...`} />
                      </p>
                    )}

                    <MetaPills post={post} />

                    <p className="mt-4 text-sm text-white/25">
                      阅读这篇文章 →
                    </p>
                  </Link>
                );
              })}

              {hasMoreArticles && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleArticleCount((count) => count + 10)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-7 py-3 text-sm text-white/55 transition hover:border-white/25 hover:text-white"
                  >
                    加载更多文章
                  </button>
                </div>
              )}
            </div>
          )}

          {showDiaries && publicDiaries.length > 0 && (
            <div
              id="public-diaries"
              className="space-y-4 scroll-mt-28 md:space-y-5"
            >
              {activeTab === "all" && (
                <h3 className="text-lg font-light text-white/75 md:text-xl">
                  日记
                </h3>
              )}

              {visibleDiaries.map((post: any) => {
                const excerpt = getExcerpt(post.content || "");
                const title = getPostTitle(post);

                return (
                  <Link
                    key={post.id}
                    href={`/diary/${post.id}`}
                    className="group block min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-2xl transition-all duration-700 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.055] md:rounded-[2.4rem] md:p-8"
                  >
                    <p className="text-xs text-white/30">
                      日记 ·{" "}
                      {new Date(
                        post.published_at || post.created_at
                      ).toLocaleString("zh-CN")}
                    </p>

                    <h3 className="safe-text mt-3 line-clamp-2 break-all text-xl font-light text-white/85 [overflow-wrap:anywhere] md:mt-5 md:text-2xl">
                      <TranslatedText text={title} />
                    </h3>

                    {excerpt && (
                      <p className="safe-pre mt-4 line-clamp-3 text-sm leading-7 text-white/42 md:mt-5 md:line-clamp-4 md:leading-8">
                        <TranslatedText text={`${excerpt}...`} />
                      </p>
                    )}

                    <MetaPills post={post} />

                    <p className="mt-4 text-sm text-white/25">
                      翻开这一天 →
                    </p>
                  </Link>
                );
              })}

              {hasMoreDiaries && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleDiaryCount((count) => count + 10)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-7 py-3 text-sm text-white/55 transition hover:border-white/25 hover:text-white"
                  >
                    加载更多日记
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
