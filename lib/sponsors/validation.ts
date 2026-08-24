import { z } from "zod";

import {
  sponsorPlacements,
  type CampaignInput,
  type SponsorPlacementEnabled,
} from "@/lib/sponsors/types";

const campaignStates = ["draft", "published", "paused", "archived"] as const;

const defaultPlacementEnabled: SponsorPlacementEnabled = {
  home_wide: false,
  space_wide: false,
  article_inline: false,
  diary_inline: false,
  article_after: false,
  diary_after: false,
  desktop_left: false,
  desktop_right: false,
};

const placementSchema = z.enum(sponsorPlacements);

const placementEnabledSchema = z
  .object({
    home_wide: z.boolean(),
    space_wide: z.boolean(),
    article_inline: z.boolean(),
    diary_inline: z.boolean(),
    article_after: z.boolean(),
    diary_after: z.boolean(),
    desktop_left: z.boolean(),
    desktop_right: z.boolean(),
  })
  .strict()
  .default(() => ({ ...defaultPlacementEnabled }));

const placementInputSchema = z
  .object({
    placement: placementSchema,
    imagePath: z.string().trim().min(1),
    altText: z.string().trim().min(1),
    enabled: z.boolean(),
    publicTitle: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
  })
  .strict();

const nonNegativeInteger = z.number().int().nonnegative();

export function isSafeSponsorUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const campaignInputSchema = z
  .object({
    internalName: z.string().trim().min(1),
    partnerName: z.string().trim().min(1),
    publicTitle: z.string().trim().min(1),
    description: z.string().trim().min(1),
    destinationUrl: z.string().url().refine(isSafeSponsorUrl),
    state: z.enum(campaignStates),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    weight: z.number().int().min(1).max(1000),
    placements: z.array(placementInputSchema).optional(),
  })
  .strict()
  .superRefine((campaign, context) => {
    if (new Date(campaign.endsAt) <= new Date(campaign.startsAt)) {
      context.addIssue({
        code: "custom",
        message: "End time must be after start time.",
        path: ["endsAt"],
      });
    }

    const placementNames = campaign.placements?.map(
      ({ placement }) => placement
    );

    if (
      placementNames &&
      new Set(placementNames).size !== placementNames.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Each placement can only be configured once.",
        path: ["placements"],
      });
    }
  }) satisfies z.ZodType<CampaignInput>;

export const settingsInputSchema = z
  .object({
    commercialEnabled: z.boolean().default(false),
    placementEnabled: placementEnabledSchema,
    minimumParagraphs: nonNegativeInteger,
    minimumCharacters: nonNegativeInteger,
    maxAdsPerPage: nonNegativeInteger.max(3),
    eligibleProbability: nonNegativeInteger.max(100),
    cooldownPageViews: nonNegativeInteger,
    maxAdPagesPerTen: nonNegativeInteger,
    timezone: z.string().trim().min(1),
    placementPriority: z
      .array(placementSchema)
      .refine((placements) => new Set(placements).size === placements.length),
  })
  .strict();
