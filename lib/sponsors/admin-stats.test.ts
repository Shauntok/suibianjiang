import { describe, expect, it, vi } from "vitest";

import {
  aggregateSponsorStats,
  getSponsorStatsWindow,
  parseSponsorStatsQuery,
} from "@/lib/sponsors/admin-service";

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {},
}));

const campaignId = "c0000000-0000-0000-0000-000000000001";

describe("getSponsorStatsWindow", () => {
  it("starts Today at Malaysia midnight instead of UTC midnight", () => {
    const window = getSponsorStatsWindow(
      "today",
      new Date("2026-08-24T16:30:00.000Z")
    );

    expect(window).toMatchObject({
      startDate: "2026-08-25",
      endDate: "2026-08-25",
      startAt: "2026-08-24T16:00:00.000Z",
      endAtExclusive: "2026-08-25T16:00:00.000Z",
      bucketUnit: "day",
    });
    expect(window.buckets).toEqual([
      { startDate: "2026-08-25", endDate: "2026-08-25" },
    ]);
  });

  it.each([
    ["7d", "2026-08-18", 7],
    ["30d", "2026-07-26", 30],
  ] as const)("returns complete daily buckets for %s", (range, start, count) => {
    const window = getSponsorStatsWindow(
      range,
      new Date("2026-08-24T12:00:00.000Z")
    );

    expect(window.startDate).toBe(start);
    expect(window.endDate).toBe("2026-08-24");
    expect(window.bucketUnit).toBe("day");
    expect(window.buckets).toHaveLength(count);
    expect(window.buckets[0]).toEqual({ startDate: start, endDate: start });
    expect(window.buckets.at(-1)).toEqual({
      startDate: "2026-08-24",
      endDate: "2026-08-24",
    });
  });

  it("uses contiguous weekly buckets for the past three Malaysia months", () => {
    const window = getSponsorStatsWindow(
      "3m",
      new Date("2026-08-24T12:00:00.000Z")
    );

    expect(window.startDate).toBe("2026-05-24");
    expect(window.endDate).toBe("2026-08-24");
    expect(window.bucketUnit).toBe("week");
    expect(window.buckets).toHaveLength(14);
    expect(window.buckets[0]).toEqual({
      startDate: "2026-05-24",
      endDate: "2026-05-30",
    });
    expect(window.buckets.at(-1)).toEqual({
      startDate: "2026-08-23",
      endDate: "2026-08-24",
    });
  });
});

describe("parseSponsorStatsQuery", () => {
  it("accepts the four ranges and a single optional UUID campaign filter", () => {
    for (const range of ["today", "7d", "30d", "3m"] as const) {
      expect(
        parseSponsorStatsQuery(
          new URL(
            `https://ourlittleage.test/api/admin/sponsors/stats?range=${range}&campaignId=${campaignId}`
          )
        )
      ).toEqual({ range, campaignId });
    }
  });

  it("defaults an omitted range to the approved seven-day view", () => {
    expect(
      parseSponsorStatsQuery(
        new URL("https://ourlittleage.test/api/admin/sponsors/stats")
      )
    ).toEqual({ range: "7d", campaignId: undefined });
  });

  it.each([
    ["range=90d", "unsupported range"],
    ["range=7d&campaignId=not-a-uuid", "malformed campaign id"],
    ["range=7d&extra=1", "unknown parameter"],
    ["range=7d&range=30d", "duplicate parameter"],
  ])("rejects %s as an %s", (query) => {
    expect(() =>
      parseSponsorStatsQuery(
        new URL(`https://ourlittleage.test/api/admin/sponsors/stats?${query}`)
      )
    ).toThrowError("Invalid sponsorship statistics query.");
  });
});

describe("aggregateSponsorStats", () => {
  it("returns zero CTR when impressions are zero", () => {
    const window = getSponsorStatsWindow(
      "today",
      new Date("2026-08-24T12:00:00.000Z")
    );

    const result = aggregateSponsorStats(
      [
        {
          stat_date: "2026-08-24",
          campaign_id: campaignId,
          placement: "home_wide",
          impressions: 0,
          clicks: 0,
        },
      ],
      window
    );

    expect(result.totals).toEqual({ impressions: 0, clicks: 0, ctr: 0 });
    expect(result.buckets[0]).toMatchObject({ ctr: 0 });
    expect(result.byCampaign[0]).toMatchObject({ ctr: 0 });
    expect(result.byPlacement[0]).toMatchObject({ ctr: 0 });
  });

  it("aggregates campaign, placement, and daily bucket totals", () => {
    const window = getSponsorStatsWindow(
      "7d",
      new Date("2026-08-24T12:00:00.000Z")
    );

    const result = aggregateSponsorStats(
      [
        {
          stat_date: "2026-08-23",
          campaign_id: campaignId,
          placement: "home_wide",
          impressions: 10,
          clicks: 1,
        },
        {
          stat_date: "2026-08-24",
          campaign_id: campaignId,
          placement: "space_wide",
          impressions: 30,
          clicks: 5,
        },
      ],
      window
    );

    expect(result.totals).toEqual({ impressions: 40, clicks: 6, ctr: 15 });
    expect(result.byCampaign).toEqual([
      { campaignId, impressions: 40, clicks: 6, ctr: 15 },
    ]);
    expect(result.byPlacement).toEqual([
      { placement: "home_wide", impressions: 10, clicks: 1, ctr: 10 },
      {
        placement: "space_wide",
        impressions: 30,
        clicks: 5,
        ctr: 16.67,
      },
    ]);
    expect(result.buckets.at(-2)).toMatchObject({
      startDate: "2026-08-23",
      impressions: 10,
      clicks: 1,
      ctr: 10,
    });
    expect(result.buckets.at(-1)).toMatchObject({
      startDate: "2026-08-24",
      impressions: 30,
      clicks: 5,
      ctr: 16.67,
    });
  });
});
