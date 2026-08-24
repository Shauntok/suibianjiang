import { describe, expect, it } from "vitest";

import {
  campaignInputSchema,
  isSafeSponsorUrl,
  settingsInputSchema,
} from "@/lib/sponsors/validation";

const validCampaign = {
  internalName: "深夜咖啡",
  partnerName: "月光咖啡社",
  publicTitle: "慢一点的咖啡",
  description: "留一点温度给今晚。",
  destinationUrl: "https://partner.example/coffee",
  state: "draft",
  startsAt: "2026-08-25T00:00:00.000Z",
  endsAt: "2026-09-01T00:00:00.000Z",
  weight: 100,
} as const;

const validSettings = {
  commercialEnabled: false,
  minimumParagraphs: 8,
  minimumCharacters: 1200,
  maxAdsPerPage: 2,
  eligibleProbability: 60,
  cooldownPageViews: 2,
  maxAdPagesPerTen: 4,
  timezone: "Asia/Kuala_Lumpur",
  placementPriority: [
    "article_inline",
    "article_after",
    "desktop_left",
    "desktop_right",
  ],
} as const;

describe("isSafeSponsorUrl", () => {
  it("accepts HTTPS destinations and rejects executable URL schemes", () => {
    expect(isSafeSponsorUrl("https://partner.example/offer")).toBe(true);
    expect(isSafeSponsorUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeSponsorUrl("data:text/html,bad")).toBe(false);
  });
});

describe("campaignInputSchema", () => {
  it("accepts the approved campaign fixture", () => {
    expect(() => campaignInputSchema.parse(validCampaign)).not.toThrow();
  });

  it("rejects a campaign that ends before it starts", () => {
    expect(() =>
      campaignInputSchema.parse({
        ...validCampaign,
        endsAt: "2026-08-24T00:00:00.000Z",
      })
    ).toThrow();
  });

  it("rejects placement assets without alt text", () => {
    expect(() =>
      campaignInputSchema.parse({
        ...validCampaign,
        placements: [
          {
            placement: "article_inline",
            imagePath: "sponsors/campaign/article_inline/banner.webp",
            altText: "",
            enabled: false,
          },
        ],
      })
    ).toThrow();
  });

  it("rejects unsupported placement names", () => {
    expect(() =>
      campaignInputSchema.parse({
        ...validCampaign,
        placements: [
          {
            placement: "footer_banner",
            imagePath: "sponsors/campaign/footer_banner/banner.webp",
            altText: "A quiet partner message",
            enabled: false,
          },
        ],
      })
    ).toThrow();
  });
});

describe("settingsInputSchema", () => {
  it("defaults an omitted commercialEnabled switch to false", () => {
    const settings = settingsInputSchema.parse({
      minimumParagraphs: 8,
      minimumCharacters: 1200,
      maxAdsPerPage: 2,
      eligibleProbability: 60,
      cooldownPageViews: 2,
      maxAdPagesPerTen: 4,
      timezone: "Asia/Kuala_Lumpur",
      placementPriority: [
        "article_inline",
        "article_after",
        "desktop_left",
        "desktop_right",
      ],
    });

    expect(settings.commercialEnabled).toBe(false);
  });

  it("accepts the approved settings fixture and defaults every placement off", () => {
    const settings = settingsInputSchema.parse(validSettings);

    expect(settings.placementEnabled).toEqual({
      home_wide: false,
      space_wide: false,
      article_inline: false,
      diary_inline: false,
      article_after: false,
      diary_after: false,
      desktop_left: false,
      desktop_right: false,
    });
  });

  it("rejects a probability above 100", () => {
    expect(() =>
      settingsInputSchema.parse({ ...validSettings, eligibleProbability: 101 })
    ).toThrow();
  });

  it("rejects more than three ads per page", () => {
    expect(() =>
      settingsInputSchema.parse({ ...validSettings, maxAdsPerPage: 4 })
    ).toThrow();
  });

  it("rejects duplicate placement priorities", () => {
    expect(() =>
      settingsInputSchema.parse({
        ...validSettings,
        placementPriority: ["article_inline", "article_inline"],
      })
    ).toThrow();
  });
});
