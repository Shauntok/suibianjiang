import { describe, expect, it } from "vitest";

import {
  VIEWER_COOKIE_NAME,
  createViewerIdentity,
} from "./viewer-identity";

const secret = "0123456789abcdef0123456789abcdef";
const sharedId = "d0000000-0000-0000-0000-000000000002";
const validCookie = `${sharedId}.-W-CJJMy1HLzDgTAa3DbbWeWrDyzzefrX41uD6U9b78`;
const residentHash =
  "34e7ecb6f5106d4f56f94c3aec1e8f61e7d07e092068fef83c5bb5287568e80f";
const visitorHash =
  "b2477122adffb244f50664fcf34ec04b0b0f8c8e5247aa3796f81282b3dd2638";

describe("createViewerIdentity", () => {
  it("uses the dedicated viewer cookie name", () => {
    expect(VIEWER_COOKIE_NAME).toBe("ola_viewer");
  });

  it("keeps a signed anonymous visitor stable", () => {
    const first = createViewerIdentity({
      userId: null,
      cookieValue: undefined,
      secret,
    });
    const again = createViewerIdentity({
      userId: null,
      cookieValue: first.cookieValue,
      secret,
    });

    expect(first.cookieValue).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/
    );
    expect(again.viewerHash).toBe(first.viewerHash);
    expect(first.viewerHash).toMatch(/^[0-9a-f]{64}$/);
    expect(again.cookieValue).toBeUndefined();
  });

  it("reuses a valid signed anonymous cookie", () => {
    expect(
      createViewerIdentity({ userId: null, cookieValue: validCookie, secret })
    ).toEqual({ viewerHash: visitorHash });
  });

  it("replaces a tampered anonymous cookie", () => {
    const tamperedCookie = `${sharedId}.AW-CJJMy1HLzDgTAa3DbbWeWrDyzzefrX41uD6U9b78`;
    const result = createViewerIdentity({
      userId: null,
      cookieValue: tamperedCookie,
      secret,
    });

    expect(result.cookieValue).toBeDefined();
    expect(result.cookieValue).not.toBe(tamperedCookie);
    expect(result.viewerHash).not.toBe(visitorHash);
  });

  it("uses the resident identity when logged in", () => {
    const result = createViewerIdentity({
      userId: sharedId,
      cookieValue: validCookie,
      secret,
    });

    expect(result).toEqual({ viewerHash: residentHash });
  });

  it("rejects secrets shorter than 32 characters", () => {
    expect(() =>
      createViewerIdentity({
        userId: null,
        cookieValue: undefined,
        secret: "x".repeat(31),
      })
    ).toThrow(/32 characters/);
  });

  it.each([
    "",
    "not-a-cookie",
    sharedId,
    `${sharedId}.invalid.signature`,
    `not-a-uuid.-W-CJJMy1HLzDgTAa3DbbWeWrDyzzefrX41uD6U9b78`,
    `${sharedId}.short`,
    ` ${validCookie}`,
  ])("replaces malformed anonymous cookie %j", (cookieValue) => {
    const result = createViewerIdentity({
      userId: null,
      cookieValue,
      secret,
    });

    expect(result.cookieValue).toBeDefined();
    expect(result.cookieValue).not.toBe(cookieValue);
  });

  it("separates resident, visitor, and cookie-signing domains", () => {
    const resident = createViewerIdentity({
      userId: sharedId,
      cookieValue: undefined,
      secret,
    });
    const visitor = createViewerIdentity({
      userId: null,
      cookieValue: validCookie,
      secret,
    });

    expect(resident.viewerHash).toBe(residentHash);
    expect(visitor.viewerHash).toBe(visitorHash);
    expect(resident.viewerHash).not.toBe(visitor.viewerHash);
    expect(validCookie.split(".")[1]).not.toBe(visitor.viewerHash);
  });
});
