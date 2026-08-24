import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/space",
          "/articles",
          "/announcements",
        ],
        disallow: [
          "/home",
          "/admin",
          "/admin-login",
          "/settings",
          "/notifications",
          "/drafts",
          "/login",
          "/forgot-password",
          "/reset-password",
          "/feedback",
          "/search",
        ],
      },
    ],
    host: SITE_URL,
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
