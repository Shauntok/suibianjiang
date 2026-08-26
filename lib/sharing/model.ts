import { SITE_URL } from "@/lib/site";

export type SharePostType = "article" | "diary";

export type ShareSourcePost = {
  id: number;
  type: SharePostType;
  slug: string | null;
  title: string | null;
  content: string | null;
  createdAt: string;
  publishedAt: string | null;
  editedAt: string | null;
};

export function isSharePostType(value: string): value is SharePostType {
  return value === "article" || value === "diary";
}

export function getCanonicalShareUrl(post: Pick<ShareSourcePost, "id" | "type" | "slug">) {
  if (post.type === "article") {
    if (!post.slug) throw new Error("A public article needs a slug to be shared.");
    return `${SITE_URL}/articles/${encodeURIComponent(post.slug)}`;
  }
  return `${SITE_URL}/diary/${post.id}`;
}

export function getShareTitle(post: ShareSourcePost) {
  const title = post.title?.trim();
  if (title) return title;
  if (post.type === "article") return "无标题文章";
  const date = new Date(post.publishedAt || post.createdAt);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(date);
  return `${parts}的日记`;
}

export function stripMarkdownForShare(value: string | null) {
  return (value || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/(^|\s)[#>*_`~\-]+/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getShareExcerpt(value: string | null, maxLength = 180) {
  const plain = stripMarkdownForShare(value);
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

export function getShareVersion(post: Pick<ShareSourcePost, "editedAt" | "publishedAt" | "createdAt">) {
  return post.editedAt || post.publishedAt || post.createdAt;
}
