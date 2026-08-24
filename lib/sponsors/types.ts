export const sponsorPlacements = [
  "home_wide",
  "space_wide",
  "article_inline",
  "diary_inline",
  "article_after",
  "diary_after",
  "desktop_left",
  "desktop_right",
] as const;

export type SponsorPlacement = (typeof sponsorPlacements)[number];
export type CampaignState = "draft" | "published" | "paused" | "archived";
export type SponsorStatsRange = "today" | "7d" | "30d" | "3m";

export type SponsorPlacementEnabled = Record<SponsorPlacement, boolean>;

export interface SponsorSettings {
  commercialEnabled: boolean;
  placementEnabled: SponsorPlacementEnabled;
  minimumParagraphs: number;
  minimumCharacters: number;
  maxAdsPerPage: number;
  eligibleProbability: number;
  cooldownPageViews: number;
  maxAdPagesPerTen: number;
  timezone: string;
  placementPriority: SponsorPlacement[];
}

export interface SponsorCampaignPlacement {
  placement: SponsorPlacement;
  imagePath: string;
  altText: string;
  enabled: boolean;
  publicTitle?: string;
  description?: string;
}

export interface CampaignInput {
  internalName: string;
  partnerName: string;
  publicTitle: string;
  description: string;
  destinationUrl: string;
  state: CampaignState;
  startsAt: string;
  endsAt: string;
  weight: number;
  placements?: SponsorCampaignPlacement[];
}

export interface SponsorCampaign extends CampaignInput {
  id: string;
  placements: SponsorCampaignPlacement[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}
