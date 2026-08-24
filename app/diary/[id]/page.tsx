"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import TranslatedMarkdown from "@/components/TranslatedMarkdown";
import PostComments from "@/components/PostComments";
import ReportButton from "@/components/ReportButton";
import LikeButton from "@/components/LikeButton";

type ProfileInfo = {
  username: string | null;
  avatar_url: string | null;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

function formatWeekday(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(new Date(date));
}

function formatTime(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function getMoodLabel(date: string) {
  const hour = new Date(date).getHours();

  if (hour >= 0 && hour < 5) return "🌙 深夜";
  if (hour >= 5 && hour < 11) return "🌤 清晨";
  if (hour >= 11 && hour < 18) return "☀️ 午后";

  return "🌆 夜晚";
}

function getVisibilityLabel(visibility: string) {
  switch (visibility) {
    case "public":
      return "🌍 已公开";
    case "unlisted":
      return "🔗 链接可见";
    case "hidden":
      return "🙈 隐藏";
    case "private":
      return "🔒 私密";
    default:
      return "🌍 已公开";
  }
}

export default function DiaryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [loading, setLoading] = useState(true);
  const [diary, setDiary] = useState<any>(null);

  useEffect(() => {
    async function fetchDiary() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", id)
        .eq("type", "diary")
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        router.push("/diary");
        return;
      }

      const isOwner = data.author_id === user?.id;

      const canView =
        isOwner ||
        (data.status === "published" &&
          (data.visibility === "public" || data.visibility === "unlisted"));

      if (!canView) {
        router.push("/diary");
        return;
      }

      let authorProfile: ProfileInfo | null = null;

      if (data.author_id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("id", data.author_id)
          .maybeSingle();

        authorProfile = profileData;
      }

      const { count: likeCount } = await supabase
        .from("post_likes")
        .select("id", { count: "exact", head: true })
        .eq("post_id", data.id)
        .eq("is_active", true);

      const { count: commentCount } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", data.id)
        .eq("is_deleted", false)
        .eq("is_hidden", false);

      setDiary({
        ...data,
        isOwner,
        authorProfile,
        likeCount: likeCount || 0,
        commentCount: commentCount || 0,
      });

      setLoading(false);
    }

    fetchDiary();
  }, [id, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm tracking-[0.3em] text-white/35">
          正在翻开那一天...
        </p>
      </main>
    );
  }

  const diaryDate = diary.published_at || diary.created_at;
  const canComment =
    diary.visibility === "public" && diary.status === "published";

  const authorProfile = diary.authorProfile as ProfileInfo | null;
  const authorHref = authorProfile?.username
    ? `/u/${encodeURIComponent(authorProfile.username)}`
    : null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-black px-5 pb-24 pt-16 text-white md:px-6 md:py-24">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-black via-zinc-950 to-black" />
      <div className="pointer-events-none fixed left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl md:h-[560px] md:w-[560px]" />

      <article className="mx-auto max-w-3xl min-w-0 overflow-hidden">
        <button
          type="button"
          onClick={() => router.push("/space/diaries")}
          className="mb-6 text-sm text-white/35 transition hover:text-white/70 md:mb-10"
        >
          ← 回到日记广场
        </button>

        <header className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl shadow-[0_0_80px_rgba(255,255,255,0.045)] md:rounded-[2.3rem] md:p-9">
          <p className="text-xs tracking-[0.35em] text-white/25 md:tracking-[0.38em]">
            那一刻记录下的记忆
          </p>

          <h1 className="safe-text mt-4 text-4xl font-light tracking-tight md:mt-5 md:text-6xl">
            {formatDate(diaryDate)}
          </h1>

          <div className="mt-6 flex flex-wrap items-center gap-3 md:mt-7 md:gap-4">
            {authorHref ? (
              <Link
                href={authorHref}
                className="group inline-flex max-w-full items-center gap-3 overflow-hidden rounded-full border border-white/10 bg-black/30 px-3 py-2 transition hover:border-white/25 hover:bg-white/[0.05] md:px-4"
              >
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] md:h-9 md:w-9">
                  {authorProfile?.avatar_url ? (
                    <img
                      src={authorProfile.avatar_url}
                      alt={authorProfile.username || "居民"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm">
                      🌙
                    </div>
                  )}
                </div>

                <span className="safe-text truncate text-sm text-white/60 transition group-hover:text-white">
                  {authorProfile?.username || "已离开的居民"}
                </span>
              </Link>
            ) : (
              <div className="inline-flex max-w-full items-center gap-3 overflow-hidden rounded-full border border-white/10 bg-black/30 px-3 py-2 md:px-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm md:h-9 md:w-9">
                  🌙
                </div>

                <span className="safe-text text-sm text-white/45">
                  已离开的居民
                </span>
              </div>
            )}

            <p className="safe-text text-xs leading-6 text-white/35 md:text-sm md:leading-7">
              {formatWeekday(diaryDate)} · {getMoodLabel(diaryDate)} ·{" "}
              {formatTime(diaryDate)}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/40 md:mt-7 md:gap-3">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 md:px-4 md:py-2">
              {getVisibilityLabel(diary.visibility)}
            </span>

            {(diary.edit_count || 0) > 0 && (
              <span className="safe-text max-w-full rounded-full border border-yellow-500/15 bg-yellow-500/[0.06] px-3 py-1.5 text-yellow-100/60 md:px-4 md:py-2">
                后来补写过 {diary.edit_count} 次
              </span>
            )}
          </div>
        </header>

        <section className="mt-6 min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl md:mt-10 md:rounded-[2.3rem] md:p-9">
          <article
            className="
              prose prose-invert max-w-none
              overflow-hidden break-words
              text-[16px] leading-[2]
              prose-p:break-words
              prose-p:text-white/75
              prose-p:leading-[2]
              prose-headings:break-words
              prose-headings:font-light
              prose-headings:text-white/90
              prose-img:max-w-full
              prose-img:rounded-2xl
              prose-blockquote:border-white/20
              prose-blockquote:text-white/55
              prose-pre:whitespace-pre-wrap
              prose-pre:break-words
              prose-code:break-words
              md:text-[17px]
              md:leading-[2.4]
              md:prose-p:leading-[2.3]
              [&_*]:break-words
              [&_*]:[overflow-wrap:anywhere]
            "
          >
            <TranslatedMarkdown content={diary.content || ""} />
          </article>
        </section>

        <footer className="mt-6 space-y-5 md:mt-10 md:space-y-6">
          <div className="safe-pre rounded-[1.7rem] border border-white/10 bg-white/[0.025] p-5 text-sm leading-7 text-white/35 backdrop-blur-2xl md:rounded-[2rem] md:p-6">
            {diary.edited_at ? (
              <>
                <p>后来又回来补写了一些东西。</p>

                <p className="mt-2 text-white/25">
                  补写于：{new Date(diary.edited_at).toLocaleString()}
                </p>
              </>
            ) : (
              <p>这是那天留下的原始痕迹。</p>
            )}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:flex md:flex-wrap">
              <LikeButton
                postId={diary.id}
                authorId={diary.author_id}
                initialCount={diary.likeCount || 0}
              />

              {!diary.isOwner && (
                <ReportButton
                  targetType="post"
                  targetId={diary.id}
                  authorId={diary.author_id}
                  compact
                />
              )}

              {diary.isOwner && (
                <Link
                  href={`/diary/${diary.id}/edit`}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-center text-sm text-white/60 transition hover:border-white/25 hover:text-white"
                >
                  编辑日记
                </Link>
              )}
            </div>

            <button
              type="button"
              onClick={() => router.push("/space/diaries")}
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              回到日记广场
            </button>
          </div>
        </footer>

        {canComment && (
          <section id="comments" className="mt-10 md:mt-14">
            <PostComments postId={diary.id} />
          </section>
        )}
      </article>
    </main>
  );
}
