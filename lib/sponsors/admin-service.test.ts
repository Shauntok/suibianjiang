import { describe, expect, it, vi } from "vitest";

import type { CampaignInput, SponsorSettings } from "@/lib/sponsors/types";
import {
  createSponsorCampaign,
  deriveCampaignDisplayStatus,
  isSameOriginRequest,
  readBoundedJson,
  SponsorAdminServiceError,
  toSponsorApiError,
  updateSponsorCampaign,
  updateSponsorSettings,
} from "@/lib/sponsors/admin-service";

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {},
}));

const actorId = "a0000000-0000-0000-0000-000000000001";
const campaignId = "c0000000-0000-0000-0000-000000000001";

const validCampaign: CampaignInput = {
  internalName: "Night coffee",
  partnerName: "Moonlight Coffee",
  publicTitle: "A slower cup",
  description: "A quiet cup for the evening.",
  destinationUrl: "https://partner.example/coffee",
  state: "draft",
  startsAt: "2026-08-25T00:00:00.000Z",
  endsAt: "2026-09-01T00:00:00.000Z",
  weight: 100,
  placements: [],
};

const validSettings: SponsorSettings = {
  commercialEnabled: false,
  placementEnabled: {
    home_wide: false,
    space_wide: false,
    article_inline: false,
    diary_inline: false,
    article_after: false,
    diary_after: false,
    desktop_left: false,
    desktop_right: false,
  },
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
};

function rpcClient(result: { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  };
}

describe("deriveCampaignDisplayStatus", () => {
  const startsAt = "2026-08-25T00:00:00.000Z";
  const endsAt = "2026-09-01T00:00:00.000Z";

  it.each([
    ["2026-08-24T23:59:59.000Z", "scheduled"],
    ["2026-08-28T12:00:00.000Z", "live"],
    ["2026-09-01T00:00:00.000Z", "ended"],
  ] as const)("maps a published campaign at %s to %s", (now, expected) => {
    expect(
      deriveCampaignDisplayStatus("published", startsAt, endsAt, new Date(now))
    ).toBe(expected);
  });

  it("keeps a paused campaign paused regardless of its schedule", () => {
    expect(
      deriveCampaignDisplayStatus(
        "paused",
        startsAt,
        endsAt,
        new Date("2026-08-28T12:00:00.000Z")
      )
    ).toBe("paused");
  });
});

describe("transactional sponsor mutation services", () => {
  it("creates a campaign through one atomic RPC and returns only public fields", async () => {
    const client = rpcClient({
      data: {
        id: campaignId,
        internal_name: validCampaign.internalName,
        partner_name: validCampaign.partnerName,
        public_title: validCampaign.publicTitle,
        description: validCampaign.description,
        destination_url: validCampaign.destinationUrl,
        state: validCampaign.state,
        starts_at: validCampaign.startsAt,
        ends_at: validCampaign.endsAt,
        weight: validCampaign.weight,
        placements: [],
        created_by: actorId,
        updated_by: actorId,
        created_at: "2026-08-24T12:00:00.000Z",
        updated_at: "2026-08-24T12:00:00.000Z",
        private_note: "must not leave the server",
      },
      error: null,
    });

    await expect(
      createSponsorCampaign(actorId, validCampaign, client)
    ).resolves.toEqual({
      id: campaignId,
      ...validCampaign,
      placements: [],
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: "2026-08-24T12:00:00.000Z",
      updatedAt: "2026-08-24T12:00:00.000Z",
    });
    expect(client.rpc).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledWith(
      "create_sponsor_campaign_with_log",
      {
        p_actor_id: actorId,
        p_campaign: validCampaign,
      }
    );
  });

  it("maps a missing campaign without exposing the database error", async () => {
    const client = rpcClient({
      data: null,
      error: {
        code: "P0002",
        message: "relation and actor details that must stay private",
      },
    });

    await expect(
      updateSponsorCampaign(campaignId, actorId, validCampaign, client)
    ).rejects.toMatchObject({
      name: "SponsorAdminServiceError",
      kind: "not_found",
      status: 404,
      message: "Sponsor campaign not found.",
    });
  });

  it("completes a partial priority list before the settings RPC", async () => {
    const completePriority = [
      "article_inline",
      "article_after",
      "desktop_left",
      "desktop_right",
      "home_wide",
      "space_wide",
      "diary_inline",
      "diary_after",
    ];
    const client = rpcClient({
      data: {
        commercial_enabled: false,
        placement_enabled: validSettings.placementEnabled,
        minimum_paragraphs: 8,
        minimum_characters: 1200,
        max_ads_per_page: 2,
        eligible_probability: 60,
        cooldown_page_views: 2,
        max_ad_pages_per_ten: 4,
        timezone: "Asia/Kuala_Lumpur",
        placement_priority: completePriority,
      },
      error: null,
    });

    await expect(
      updateSponsorSettings(actorId, validSettings, client)
    ).resolves.toMatchObject({ placementPriority: completePriority });
    expect(client.rpc).toHaveBeenCalledWith(
      "update_sponsor_settings_with_log",
      {
        p_actor_id: actorId,
        p_settings: {
          ...validSettings,
          placementPriority: completePriority,
        },
      }
    );
  });
});

describe("bounded and sanitized API helpers", () => {
  it("allows absent or matching origins and rejects a cross-origin mutation", () => {
    const url = "https://ourlittleage.test/api/admin/sponsors";

    expect(isSameOriginRequest(new Request(url))).toBe(true);
    expect(
      isSameOriginRequest(
        new Request(url, { headers: { origin: "https://ourlittleage.test" } })
      )
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request(url, { headers: { origin: "https://attacker.test" } })
      )
    ).toBe(false);
  });

  it("rejects a JSON body after its encoded bytes cross the limit", async () => {
    const request = new Request("https://ourlittleage.test/api/admin/sponsors", {
      method: "POST",
      body: JSON.stringify({ value: "1234567890" }),
    });

    await expect(readBoundedJson(request, 8)).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
    });
  });

  it("returns a generic public error for an unexpected internal failure", () => {
    expect(
      toSponsorApiError(
        new Error("service_role query leaked a private table name"),
        "Unable to save sponsorship data."
      )
    ).toEqual({
      status: 500,
      body: { error: "Unable to save sponsorship data." },
    });
  });

  it("preserves only deliberate public service errors", () => {
    expect(
      toSponsorApiError(
        new SponsorAdminServiceError(
          "invalid_input",
          400,
          "Invalid sponsorship data."
        ),
        "Unable to save sponsorship data."
      )
    ).toEqual({
      status: 400,
      body: { error: "Invalid sponsorship data." },
    });
  });
});
