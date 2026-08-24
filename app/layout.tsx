import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";

import { LanguageProvider } from "@/components/LanguageProvider";
import SiteShell from "@/components/SiteShell";
import PageRouterTransition from "@/components/PageRouterTransition";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: "小时代｜深夜故事社区",
    template: "%s｜小时代",
  },

  description:
    "小时代是一个慢节奏的深夜文字社区。在这里写日记、分享故事、留下生活痕迹，与仍未入睡的人相遇。",

  openGraph: {
    title: "小时代｜深夜故事社区",
    description:
      "世界已经睡了，但这里还有一些人，静静留下今天。",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "zh_CN",
    type: "website",

    images: [
      {
        url: "/og-cover.png",
        width: 1200,
        height: 630,
        alt: "小时代｜深夜故事社区",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "小时代｜深夜故事社区",
    description:
      "世界已经睡了，但这里还有一些人，静静留下今天。",
    images: ["/og-cover.png"],
  },

};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-white">
        <PresenceHeartbeat />

        <LanguageProvider>
          <SiteShell>
            <PageRouterTransition>
              {children}
            </PageRouterTransition>
          </SiteShell>
        </LanguageProvider>

        <Toaster
          position="top-center"
          richColors
          closeButton
          theme="dark"
          duration={4000}
        />
      </body>
    </html>
  );
}
