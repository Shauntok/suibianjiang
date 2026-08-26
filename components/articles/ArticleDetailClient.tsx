"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import TranslatedMarkdown from "@/components/TranslatedMarkdown";
import PostComments from "@/components/PostComments";
import ReportButton from "@/components/ReportButton";
import LikeButton from "@/components/LikeButton";

type ProfileInfo = {
  username: string | null;
  avatar_url: string | null;
};

function getProfile(profile: ProfileInfo | ProfileInfo[] | null) {
  if (Array.isArray(profile)) return profile[0] || null;
  return profile;
}

function formatMalaysiaDateTime(value: string) {
  const date = new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function getVisibilityLabel(visibility: string) {
  switch (visibility) {
    case "public":
      return "🌍 公开";
    case "hidden":
      return "🙈 隐藏";
    case "unlisted":
      return "🔗 链接可见";
    case "private":
      return "🔒 私密";
    default:
      return "🌍 公开";
  }
}

export default function ArticleDetailClient({
  initialArticle = null,
}: {
  initialArticle?: any;
}) {
  const params = useParams();
  const router = useRouter();
  const slug = String(params.slug);

  const [loading, setLoading] = useState(!initialArticle);
  const [article, setArticle] = useState<any>(initialArticle);
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    async function fetchArticle() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (initialArticle) {
        setCurrentUserId(user?.id || "");
        setArticle((current: any) => ({
          ...current,
          isAuthor: Boolean(user && current.author_id === user.id),
        }));
        setLoading(false);
        return;
      }

      if (!user) {
        router.push("/space/articles");
        return;
      }

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("slug", slug)
        .eq("type", "article")
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        router.push("/space/articles");
        return;
      }

      const isAuthor = data.author_id === user.id;

      const canView =
        isAuthor ||
        (data.status === "published" &&
          (data.visibility === "public" || data.visibility === "unlisted"));

      if (!canView) {
        router.push("/space/articles");
        return;
      }

      let authorProfile = null;

      if (data.author_id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("id", data.author_id)
          .maybeSingle();

        authorProfile = profileData;
      }

      const [{ count: likeCount }, { count: commentCount }] =
        await Promise.all([
          supabase
            .from("post_likes")
            .select("id", { count: "exact", head: true })
            .eq("post_id", data.id)
            .eq("is_active", true),

          supabase
            .from("comments")
            .select("id", { count: "exact", head: true })
            .eq("post_id", data.id)
            .eq("is_deleted", false)
            .eq("is_hidden", false),
        ]);

      setArticle({
        ...data,
        profiles: authorProfile,
        isAuthor,
        likeCount: likeCount || 0,
        commentCount: commentCount || 0,
      });

      setLoading(false);
    }

    fetchArticle();
  }, [initialArticle, slug, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm tracking-[0.3em] text-white/35">
          正在打开这篇文章...
        </p>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm tracking-[0.3em] text-white/35">
          这篇文章暂时无法查看。
        </p>
      </main>
    );
  }

  const articleDate = article.published_at || article.created_at;
  const isAuthor = article.isAuthor || article.author_id === currentUserId;

  const authorProfile = getProfile(article.profiles);
  const authorHref = authorProfile?.username
    ? `/u/${encodeURIComponent(authorProfile.username)}`
    : null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-black px-5 pb-24 pt-16 text-white md:px-6 md:py-24">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-black via-zinc-950 to-black" />
      <div className="pointer-events-none fixed left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl md:h-[560px] md:w-[560px]" />

      <article className="mx-auto w-full max-w-3xl min-w-0 overflow-hidden">
        <button
          type="button"
          onClick={() => router.push("/space/articles")}
          className="mb-6 text-sm text-white/35 transition hover:text-white/70 md:mb-10"
        >
          ← 回到文章广场
        </button>

        <header className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl md:rounded-[2.4rem] md:p-9">
          <p className="text-xs tracking-[0.35em] text-white/25 md:tracking-[0.38em]">
            发表的故事文章
          </p>

          <h1 className="safe-text mt-4 break-words text-4xl font-light leading-tight tracking-tight [overflow-wrap:anywhere] md:mt-6 md:text-6xl">
            {article.title || "无标题文章"}
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

                <span className="safe-text text-sm text-white/60 transition group-hover:text-white">
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

            <p className="safe-text text-xs text-white/35 md:text-sm">
              {formatMalaysiaDateTime(articleDate)}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-white/40 md:mt-7 md:gap-3">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 md:px-4 md:py-2">
              {article.status === "published" ? "已发布" : "草稿"}
            </span>

            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 md:px-4 md:py-2">
              {getVisibilityLabel(article.visibility)}
            </span>
          </div>

          {article.tags && (
            <div className="mt-5 flex flex-wrap gap-2 md:mt-6">
              {article.tags
                .split(",")
                .map((tag: string) => tag.trim())
                .filter(Boolean)
                .map((tag: string) => (
                  <span
                    key={tag}
                    className="safe-text max-w-full rounded-full bg-white/[0.05] px-3 py-1 text-xs text-white/35"
                  >
                    #{tag}
                  </span>
                ))}
            </div>
          )}
        </header>

        <section className="mt-6 min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl md:mt-10 md:rounded-[2.4rem] md:p-9">
          <article
            className="
              prose prose-invert max-w-none
              overflow-hidden break-words
              prose-p:break-words
              prose-p:leading-[2]
              prose-p:text-white/70
              prose-headings:break-words
              prose-headings:font-light
              prose-img:max-w-full
              prose-img:rounded-2xl
              prose-blockquote:break-words
              prose-blockquote:border-white/20
              prose-pre:whitespace-pre-wrap
              prose-pre:break-words
              prose-code:break-words
              md:prose-p:leading-[2.2]
              [&_*]:break-words
              [&_*]:[overflow-wrap:anywhere]
            "
          >
            <TranslatedMarkdown content={article.content || ""} />
          </article>
        </section>

        {isAuthor && article.notes && (
          <section className="safe-pre mt-6 rounded-[2rem] border border-yellow-500/15 bg-yellow-500/[0.05] p-5 text-sm leading-8 text-yellow-100/60 md:mt-8 md:p-6">
            <p className="mb-3 text-xs tracking-[0.3em] text-yellow-100/35">
              作者私密笔记
            </p>
            <p>{article.notes}</p>
          </section>
        )}

        <footer className="mt-6 space-y-5 md:mt-10 md:space-y-6">
          <div className="safe-pre rounded-[1.7rem] border border-white/10 bg-white/[0.025] p-5 text-sm leading-7 text-white/35 backdrop-blur-2xl md:rounded-[2rem] md:p-6">
            {article.edited_at ? (
              <>
                <p>后来又回来整理过这篇故事。</p>

                <p className="mt-2 text-white/25">
                  修改于：{formatMalaysiaDateTime(article.edited_at)}
                </p>
              </>
            ) : (
              <p>这是那天留下的原始故事。</p>
            )}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div
              className={`grid gap-3 md:flex md:flex-wrap ${
                isAuthor ? "grid-cols-1" : "grid-cols-2"
              }`}
            >
              <LikeButton
                postId={article.id}
                authorId={article.author_id}
                initialCount={article.likeCount || 0}
                mobileFullWidth
              />

              {!isAuthor && (
                <ReportButton
                  targetType="post"
                  targetId={article.id}
                  authorId={article.author_id}
                  compact
                  mobileFullWidth
                />
              )}

              {isAuthor && (
                <Link
                  href={`/articles/edit/${article.id}`}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-center text-sm text-white/60 transition hover:border-white/25 hover:text-white"
                >
                  编辑文章
                </Link>
              )}
            </div>

            <button
              type="button"
              onClick={() => router.push("/space/articles")}
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              回到文章广场
            </button>
          </div>
        </footer>

        <div className="mt-10 md:mt-14">
          <PostComments postId={article.id} />
        </div>
      </article>
    </main>
  );
}
