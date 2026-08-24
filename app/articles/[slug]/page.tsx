import type { Metadata } from "next";
import { cache } from "react";
import { supabase } from "@/lib/supabase";
import ArticleDetailClient from "@/components/articles/ArticleDetailClient";
import { SITE_NAME, SITE_URL } from "@/lib/site";

type Props = {
  params: Promise<{ slug: string }>;
};

function stripMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*\]\(.*?\)/g, "")
    .replace(/\[[^\]]*\]\(.*?\)/g, "")
    .replace(/[#>*_`~\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const getPublicArticle = cache(async (slug: string) => {
  const { data: article } = await supabase
    .from("posts")
    .select("*")
    .eq("slug", slug)
    .eq("type", "article")
    .eq("status", "published")
    .in("visibility", ["public", "unlisted"])
    .is("deleted_at", null)
    .maybeSingle();

  if (!article) return null;

  const [profileResult, likesResult, commentsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", article.author_id)
      .maybeSingle(),
    supabase
      .from("post_likes")
      .select("id", { count: "exact", head: true })
      .eq("post_id", article.id)
      .eq("is_active", true),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", article.id)
      .eq("is_deleted", false)
      .eq("is_hidden", false),
  ]);

  return {
    ...article,
    profiles: profileResult.data,
    isAuthor: false,
    likeCount: likesResult.count || 0,
    commentCount: commentsResult.count || 0,
  };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublicArticle(slug);

  if (!article) {
    return {
      title: "文章不存在",
      description: "这篇文章暂时无法查看。",
      robots: { index: false, follow: false },
    };
  }

  const title = article.title || "无标题文章";
  const brandedTitle = `${title}｜${SITE_NAME}`;
  const description =
    stripMarkdown(article.content || "").slice(0, 110) ||
    "有人在小时代留下了一篇故事。";
  const url = `${SITE_URL}/articles/${article.slug}`;
  const robots =
    article.visibility === "unlisted"
      ? { index: false, follow: false }
      : { index: true, follow: true };

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: brandedTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: "zh_CN",
      type: "article",
      images: [
        {
          url: "/og-cover.png",
          width: 1200,
          height: 630,
          alt: brandedTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: brandedTitle,
      description,
      images: ["/og-cover.png"],
    },
    robots,
  };
}

export default async function ArticleDetailPage({ params }: Props) {
  const { slug } = await params;
  const article = await getPublicArticle(slug);

  return <ArticleDetailClient initialArticle={article} />;
}
