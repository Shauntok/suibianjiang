import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/space`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/space/diaries`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/space/articles`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/announcements`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  const [articlesResult, diariesResult, usersResult] = await Promise.all([
    supabase
      .from("posts")
      .select("slug, published_at")
      .eq("type", "article")
      .eq("status", "published")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .not("slug", "is", null),
    supabase
      .from("posts")
      .select("id, published_at")
      .eq("type", "diary")
      .eq("status", "published")
      .eq("visibility", "public")
      .is("deleted_at", null),
    supabase
      .from("profiles")
      .select("username, updated_at")
      .not("username", "is", null),
  ]);

  const articles = articlesResult.data;
  const diaries = diariesResult.data;
  const users = usersResult.data;

  const articlePages: MetadataRoute.Sitemap =
    articles?.map((article) => ({
      url: `${baseUrl}/articles/${article.slug}`,
      lastModified: article.published_at
        ? new Date(article.published_at)
        : new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    })) || [];

  const diaryPages: MetadataRoute.Sitemap =
    diaries?.map((diary) => ({
      url: `${baseUrl}/diary/${diary.id}`,
      lastModified: diary.published_at
        ? new Date(diary.published_at)
        : new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    })) || [];

  const userPages: MetadataRoute.Sitemap =
    users?.map((user) => ({
      url: `${baseUrl}/u/${encodeURIComponent(user.username)}`,
      lastModified: user.updated_at
        ? new Date(user.updated_at)
        : new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    })) || [];

  return [...staticPages, ...articlePages, ...diaryPages, ...userPages];
}
