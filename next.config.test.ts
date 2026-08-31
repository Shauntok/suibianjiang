import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("Content Security Policy", () => {
  it("allows the Google Analytics script and collection endpoints", async () => {
    const headerGroups = await nextConfig.headers?.();
    const contentSecurityPolicy = headerGroups
      ?.flatMap((group) => group.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    expect(contentSecurityPolicy).toContain(
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com"
    );
    expect(contentSecurityPolicy).toContain(
      "img-src 'self' data: blob: https: https://*.google-analytics.com https://www.googletagmanager.com"
    );
    expect(contentSecurityPolicy).toContain(
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com"
    );
  });
});
