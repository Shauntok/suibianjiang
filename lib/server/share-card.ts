import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getCanonicalShareUrl,
  getShareExcerpt,
  getShareTitle,
  type SharePostType,
  type ShareSourcePost,
} from "@/lib/sharing/model";

export type ShareCardData = {
  id: number;
  type: SharePostType;
  title: string;
  excerpt: string;
  authorName: string;
  canonicalUrl: string;
};

export async function loadPublicShareCardData(type: SharePostType, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return null;

  const { data: post } = await supabaseAdmin
    .from("posts")
    .select("id, type, slug, title, content, author_id, created_at, published_at, edited_at")
    .eq("id", id)
    .eq("type", type)
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .maybeSingle();

  if (!post || post.type !== type) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", post.author_id)
    .maybeSingle();

  const source: ShareSourcePost = {
    id: Number(post.id),
    type,
    slug: post.slug,
    title: post.title,
    content: post.content,
    createdAt: post.created_at,
    publishedAt: post.published_at,
    editedAt: post.edited_at,
  };

  return {
    id: source.id,
    type,
    title: getShareTitle(source),
    excerpt: getShareExcerpt(source.content),
    authorName: profile?.username?.trim() || "已离开的居民",
    canonicalUrl: getCanonicalShareUrl(source),
  } satisfies ShareCardData;
}
