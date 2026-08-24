import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "世界公告",
  description: "小时代的最新世界公告与社区消息。",
  alternates: { canonical: `${SITE_URL}/announcements` },
};

export default function AnnouncementsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
