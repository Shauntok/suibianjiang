import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_HOST = "www.ourlittleage.com";

export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host")?.split(":")[0].toLowerCase();

  if (hostname === "ourlittleage.com") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const privatePrefixes = [
    "/admin",
    "/settings",
    "/notifications",
    "/drafts",
  ];
  const privateExactPaths = new Set([
    "/home",
    "/login",
    "/admin-login",
    "/forgot-password",
    "/reset-password",
    "/feedback",
    "/search",
    "/articles",
    "/diary",
  ]);

  if (
    privateExactPaths.has(pathname) ||
    privatePrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    ) ||
    pathname.startsWith("/articles/edit/") ||
    pathname === "/articles/new" ||
    pathname === "/diary/new" ||
    pathname.endsWith("/edit")
  ) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}
