import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import DiariesSpaceClient, {
  DiaryPost,
} from "@/components/DiariesSpaceClient";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "日记广场",
  description: "翻开小时代居民在清晨、午后与深夜公开留下的日记。",
  alternates: { canonical: `${SITE_URL}/space/diaries` },
};

export const dynamic = "force-dynamic";

type ProfileInfo = {
  username: string | null;
  avatar_url: string | null;
};

async function fetchDiaryPosts(): Promise<DiaryPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("id, content, published_at, author_id")
    .eq("type", "diary")
    .eq("visibility", "public")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", {
      ascending: false,
    });

  if (error || !data) return [];

  const authorIds = Array.from(
    new Set(data.map((post: any) => post.author_id).filter(Boolean))
  );

  const { data: profiles } =
    authorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", authorIds)
      : { data: [] as any[] };

  const profileMap = new Map<string, ProfileInfo>(
    (profiles || []).map((profile: any) => [
      profile.id,
      {
        username: profile.username,
        avatar_url: profile.avatar_url,
      },
    ])
  );

  const postIds = data.map((post: any) => post.id);

  const { data: likesData } =
    postIds.length > 0
      ? await supabase
          .from("post_likes")
          .select("post_id")
          .in("post_id", postIds)
          .eq("is_active", true)
      : { data: [] as any[] };

  const { data: commentsData } =
    postIds.length > 0
      ? await supabase
          .from("comments")
          .select("post_id")
          .in("post_id", postIds)
          .eq("is_deleted", false)
          .eq("is_hidden", false)
      : { data: [] as any[] };

  const likeCountMap = new Map<number, number>();
  const commentCountMap = new Map<number, number>();

  (likesData || []).forEach((like: any) => {
    likeCountMap.set(like.post_id, (likeCountMap.get(like.post_id) || 0) + 1);
  });

  (commentsData || []).forEach((comment: any) => {
    commentCountMap.set(
      comment.post_id,
      (commentCountMap.get(comment.post_id) || 0) + 1
    );
  });

  return data.map((post: any) => ({
    ...post,
    authorProfile: profileMap.get(post.author_id) || null,
    likeCount: likeCountMap.get(post.id) || 0,
    commentCount: commentCountMap.get(post.id) || 0,
  }));
}

export default async function PublicDiaryPage() {
  const posts = await fetchDiaryPosts();

  return <DiariesSpaceClient initialPosts={posts} />;
}
