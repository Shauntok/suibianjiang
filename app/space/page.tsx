import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import SpaceClient, { SpacePost } from "@/components/SpaceClient";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "故事广场",
  description: "在小时代的广场，遇见居民公开留下的日记与故事。",
  alternates: { canonical: `${SITE_URL}/space` },
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ feed?: string }>;
};

type ProfileInfo = {
  username: string | null;
  avatar_url: string | null;
};

async function fetchSpacePosts(type: "article" | "diary") {
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, title, slug, content, type, published_at, created_at, author_id"
    )
    .eq("type", type)
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(6);

  if (error || !data) return [];

  const authorIds = Array.from(
    new Set(data.map((post: any) => post.author_id).filter(Boolean))
  );

  const postIds = data.map((post: any) => post.id);

  const [profilesResult, likesResult, commentsResult] = await Promise.all([
    authorIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", authorIds)
      : Promise.resolve({ data: [] as any[], error: null }),

    postIds.length > 0
      ? supabase
          .from("post_likes")
          .select("post_id")
          .in("post_id", postIds)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as any[], error: null }),

    postIds.length > 0
      ? supabase
          .from("comments")
          .select("post_id")
          .in("post_id", postIds)
          .eq("is_deleted", false)
          .eq("is_hidden", false)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const profiles = profilesResult.data || [];
  const likesData = likesResult.data || [];
  const commentsData = commentsResult.data || [];

  const profileMap = new Map<string, ProfileInfo>(
    profiles.map((profile: any) => [
      profile.id,
      {
        username: profile.username,
        avatar_url: profile.avatar_url,
      },
    ])
  );

  const likeCountMap = new Map<string, number>();
  const commentCountMap = new Map<string, number>();

  likesData.forEach((like: any) => {
    const key = String(like.post_id);
    likeCountMap.set(key, (likeCountMap.get(key) || 0) + 1);
  });

  commentsData.forEach((comment: any) => {
    const key = String(comment.post_id);
    commentCountMap.set(key, (commentCountMap.get(key) || 0) + 1);
  });

  return data.map((post: any) => ({
    ...post,
    authorProfile: profileMap.get(post.author_id) || null,
    likeCount: likeCountMap.get(String(post.id)) || 0,
    commentCount: commentCountMap.get(String(post.id)) || 0,
  })) as SpacePost[];
}

function getHotPosts(posts: SpacePost[]) {
  return [...posts]
    .sort((a, b) => {
      const scoreA = (a.likeCount || 0) * 3 + (a.commentCount || 0) * 2;
      const scoreB = (b.likeCount || 0) * 3 + (b.commentCount || 0) * 2;

      return scoreB - scoreA;
    })
    .slice(0, 3);
}

export default async function SpacePage({ searchParams }: Props) {
  const { feed } = await searchParams;

  const activeFeed =
    feed === "hot-diaries" ||
    feed === "latest-articles" ||
    feed === "hot-articles"
      ? feed
      : "latest-diaries";

  const [articles, diaries] = await Promise.all([
    fetchSpacePosts("article"),
    fetchSpacePosts("diary"),
  ]);

  return (
    <SpaceClient
      activeFeed={activeFeed}
      latestDiaries={diaries.slice(0, 3)}
      latestArticles={articles.slice(0, 3)}
      hotDiaries={getHotPosts(diaries)}
      hotArticles={getHotPosts(articles)}
    />
  );
}
