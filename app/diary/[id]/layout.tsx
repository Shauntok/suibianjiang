import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { SITE_NAME, SITE_URL } from "@/lib/site";

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

function stripMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*\]\(.*?\)/g, "")
    .replace(/\[[^\]]*\]\(.*?\)/g, "")
    .replace(/[#>*_`~\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { data: diary } = await supabase
    .from("posts")
    .select("id, title, content, visibility, published_at")
    .eq("id", id)
    .eq("type", "diary")
    .eq("status", "published")
    .in("visibility", ["public", "unlisted"])
    .is("deleted_at", null)
    .maybeSingle();

  if (!diary) {
    return {
      title: "日记不存在",
      robots: { index: false, follow: false },
    };
  }

  const title = diary.title || "一篇深夜日记";
  const description =
    stripMarkdown(diary.content || "").slice(0, 110) ||
    "有人在小时代留下了一页日记。";
  const url = `${SITE_URL}/diary/${diary.id}`;
  const shouldIndex = diary.visibility === "public";

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: shouldIndex, follow: shouldIndex },
    openGraph: {
      title: `${title}｜${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      locale: "zh_CN",
      type: "article",
      images: ["/og-cover.png"],
    },
  };
}

export default function DiaryDetailLayout({ children }: Props) {
  return children;
}
