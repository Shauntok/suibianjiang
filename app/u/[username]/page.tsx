import type { Metadata } from "next";
import UserRoomLoader from "@/components/UserRoomLoader";
import { supabase } from "@/lib/supabase";
import { SITE_NAME, SITE_URL } from "@/lib/site";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, bio")
    .eq("username", decodedUsername)
    .maybeSingle();

  if (!profile?.username) {
    return { title: "居民房间不存在", robots: { index: false, follow: false } };
  }

  const url = `${SITE_URL}/u/${encodeURIComponent(profile.username)}`;
  const description =
    profile.bio?.trim().slice(0, 120) ||
    `${profile.username} 在${SITE_NAME}留下的故事、日记与生活痕迹。`;

  return {
    title: `${profile.username}的房间`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${profile.username}的房间｜${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      locale: "zh_CN",
      type: "profile",
      images: ["/og-cover.png"],
    },
  };
}

export default async function UserPage({ params, searchParams }: Props) {
  const { username } = await params;
  const { tab } = await searchParams;

  const activeTab = tab === "diary" || tab === "article" ? tab : "all";

  return (
    <UserRoomLoader
      username={decodeURIComponent(username)}
      activeTab={activeTab}
    />
  );
}
