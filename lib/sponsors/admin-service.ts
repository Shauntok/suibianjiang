import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  sponsorPlacements,
  type CampaignInput,
  type CampaignState,
  type SponsorCampaign,
  type SponsorCampaignPlacement,
  type SponsorPlacement,
  type SponsorSettings,
  type SponsorStatsRange,
} from "@/lib/sponsors/types";

export const SPONSOR_ADMIN_BODY_LIMIT = 64 * 1024;
export const SPONSOR_ADMIN_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;
export const SPONSOR_TIMEZONE = "Asia/Kuala_Lumpur";

const MALAYSIA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const campaignStates = ["draft", "published", "paused", "archived"] as const;

const placementEnabledRowSchema = z.object({
  home_wide: z.boolean(),
  space_wide: z.boolean(),
  article_inline: z.boolean(),
  diary_inline: z.boolean(),
  article_after: z.boolean(),
  diary_after: z.boolean(),
  desktop_left: z.boolean(),
  desktop_right: z.boolean(),
});

const campaignPlacementRowSchema = z
  .object({
    placement: z.enum(sponsorPlacements),
    image_path: z.string(),
    alt_text: z.string(),
    enabled: z.boolean(),
    public_title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .passthrough();

const campaignRowSchema = z
  .object({
    id: z.string(),
    internal_name: z.string(),
    partner_name: z.string(),
    public_title: z.string(),
    description: z.string(),
    destination_url: z.string(),
    state: z.enum(campaignStates),
    starts_at: z.string(),
    ends_at: z.string(),
    weight: z.number(),
    placements: z.array(campaignPlacementRowSchema).nullish(),
    created_by: z.string(),
    updated_by: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();

const settingsRowSchema = z
  .object({
    commercial_enabled: z.boolean(),
    placement_enabled: placementEnabledRowSchema,
    minimum_paragraphs: z.number(),
    minimum_characters: z.number(),
    max_ads_per_page: z.number(),
    eligible_probability: z.number(),
    cooldown_page_views: z.number(),
    max_ad_pages_per_ten: z.number(),
    timezone: z.string(),
    placement_priority: z.array(z.enum(sponsorPlacements)),
  })
  .passthrough();

const statsRowSchema = z.object({
  stat_date: z.string(),
  campaign_id: z.string(),
  placement: z.enum(sponsorPlacements),
  impressions: z.union([z.number(), z.string()]),
  clicks: z.union([z.number(), z.string()]),
});

const campaignSelect = `
  id,
  internal_name,
  partner_name,
  public_title,
  description,
  destination_url,
  state,
  starts_at,
  ends_at,
  weight,
  created_by,
  updated_by,
  created_at,
  updated_at,
  placements:sponsor_campaign_placements (
    placement,
    image_path,
    alt_text,
    enabled,
    public_title,
    description
  )
`;

const settingsSelect = `
  commercial_enabled,
  placement_enabled,
  minimum_paragraphs,
  minimum_characters,
  max_ads_per_page,
  eligible_probability,
  cooldown_page_views,
  max_ad_pages_per_ten,
  timezone,
  placement_priority
`;

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type RpcClient = {
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type Counter = {
  impressions: number;
  clicks: number;
};

export type CampaignDisplayStatus =
  | Exclude<CampaignState, "published">
  | "scheduled"
  | "live"
  | "ended";

export type SponsorStatsBucket = Counter & {
  startDate: string;
  endDate: string;
  ctr: number;
};

export type SponsorStatsWindow = {
  range: SponsorStatsRange;
  timezone: typeof SPONSOR_TIMEZONE;
  startDate: string;
  endDate: string;
  startAt: string;
  endAtExclusive: string;
  bucketUnit: "day" | "week";
  buckets: Array<{ startDate: string; endDate: string }>;
};

export class SponsorAdminServiceError extends Error {
  constructor(
    public readonly kind:
      | "invalid_input"
      | "forbidden"
      | "not_found"
      | "internal",
    public readonly status: 400 | 403 | 404 | 500,
    message: string
  ) {
    super(message);
    this.name = "SponsorAdminServiceError";
  }
}

export function deriveCampaignDisplayStatus(
  state: CampaignState,
  startsAt: string,
  endsAt: string,
  now: Date
): CampaignDisplayStatus {
  if (state !== "published") {
    return state;
  }

  const currentTime = now.getTime();

  if (currentTime < new Date(startsAt).getTime()) {
    return "scheduled";
  }

  if (currentTime >= new Date(endsAt).getTime()) {
    return "ended";
  }

  return "live";
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function readBoundedJson(
  request: Request,
  maximumBytes = SPONSOR_ADMIN_BODY_LIMIT
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");

  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maximumBytes
  ) {
    throw invalidInput();
  }

  const reader = request.body?.getReader();

  if (!reader) {
    throw invalidInput();
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      receivedBytes += value.byteLength;

      if (receivedBytes > maximumBytes) {
        await cancelBodyReader(reader);
        throw invalidInput();
      }

      body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();
  } catch (error) {
    if (error instanceof SponsorAdminServiceError) {
      throw error;
    }

    await cancelBodyReader(reader);
    throw invalidInput();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw invalidInput();
  }
}

export function toSponsorApiError(
  error: unknown,
  fallbackMessage: string
): { status: number; body: { error: string } } {
  if (
    error instanceof SponsorAdminServiceError &&
    error.kind !== "internal"
  ) {
    return {
      status: error.status,
      body: { error: error.message },
    };
  }

  return {
    status: 500,
    body: { error: fallbackMessage },
  };
}

export async function createSponsorCampaign(
  actorId: string,
  campaign: CampaignInput,
  client: RpcClient = supabaseAdmin as unknown as RpcClient
): Promise<SponsorCampaign> {
  const { data, error } = await client.rpc(
    "create_sponsor_campaign_with_log",
    {
      p_actor_id: actorId,
      p_campaign: campaign,
    }
  );

  if (error) {
    throw mapDatabaseError(error);
  }

  return mapCampaignRow(data);
}

export async function updateSponsorCampaign(
  campaignId: string,
  actorId: string,
  campaign: CampaignInput,
  client: RpcClient = supabaseAdmin as unknown as RpcClient
): Promise<SponsorCampaign> {
  const { data, error } = await client.rpc(
    "update_sponsor_campaign_with_log",
    {
      p_actor_id: actorId,
      p_campaign_id: campaignId,
      p_campaign: campaign,
    }
  );

  if (error) {
    throw mapDatabaseError(error, { missingResource: "campaign" });
  }

  return mapCampaignRow(data);
}

export async function updateSponsorSettings(
  actorId: string,
  settings: SponsorSettings,
  client: RpcClient = supabaseAdmin as unknown as RpcClient
): Promise<SponsorSettings> {
  const normalizedSettings = normalizeSettings(settings);
  const { data, error } = await client.rpc(
    "update_sponsor_settings_with_log",
    {
      p_actor_id: actorId,
      p_settings: normalizedSettings,
    }
  );

  if (error) {
    throw mapDatabaseError(error);
  }

  return mapSettingsRow(data);
}

export async function listSponsorCampaigns(now = new Date()) {
  const { data, error } = await supabaseAdmin
    .from("sponsor_campaigns")
    .select(campaignSelect)
    .order("created_at", { ascending: false });

  if (error) {
    throw mapDatabaseError(error);
  }

  return (data ?? []).map((row) => {
    const campaign = mapCampaignRow(row);

    return {
      ...campaign,
      displayStatus: deriveCampaignDisplayStatus(
        campaign.state,
        campaign.startsAt,
        campaign.endsAt,
        now
      ),
    };
  });
}

export async function getSponsorCampaign(campaignId: string, now = new Date()) {
  const { data, error } = await supabaseAdmin
    .from("sponsor_campaigns")
    .select(campaignSelect)
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw mapDatabaseError(error);
  }

  if (!data) {
    throw notFound();
  }

  const campaign = mapCampaignRow(data);

  return {
    ...campaign,
    displayStatus: deriveCampaignDisplayStatus(
      campaign.state,
      campaign.startsAt,
      campaign.endsAt,
      now
    ),
  };
}

export async function getSponsorSettings(): Promise<SponsorSettings> {
  const { data, error } = await supabaseAdmin
    .from("sponsor_settings")
    .select(settingsSelect)
    .eq("id", true)
    .maybeSingle();

  if (error) {
    throw mapDatabaseError(error);
  }

  if (!data) {
    throw new SponsorAdminServiceError(
      "internal",
      500,
      "Sponsorship settings are unavailable."
    );
  }

  return mapSettingsRow(data);
}

export function parseSponsorStatsQuery(url: URL): {
  range: SponsorStatsRange;
  campaignId: string | undefined;
} {
  const allowedKeys = new Set(["range", "campaignId"]);

  for (const key of url.searchParams.keys()) {
    if (
      !allowedKeys.has(key) ||
      url.searchParams.getAll(key).length !== 1
    ) {
      throw invalidStatsQuery();
    }
  }

  const rawRange = url.searchParams.get("range") ?? "7d";

  if (!isSponsorStatsRange(rawRange)) {
    throw invalidStatsQuery();
  }

  const campaignId = url.searchParams.get("campaignId");

  if (campaignId !== null && !uuidPattern.test(campaignId)) {
    throw invalidStatsQuery();
  }

  return { range: rawRange, campaignId: campaignId ?? undefined };
}

export function getSponsorStatsWindow(
  range: SponsorStatsRange,
  now = new Date()
): SponsorStatsWindow {
  const endDay = malaysiaCalendarDay(now);
  let startDay = endDay;
  let bucketUnit: SponsorStatsWindow["bucketUnit"] = "day";

  if (range === "7d") {
    startDay = addCalendarDays(endDay, -6);
  } else if (range === "30d") {
    startDay = addCalendarDays(endDay, -29);
  } else if (range === "3m") {
    startDay = addCalendarMonths(endDay, -3);
    bucketUnit = "week";
  }

  const startDate = formatCalendarDay(startDay);
  const endDate = formatCalendarDay(endDay);
  const buckets: SponsorStatsWindow["buckets"] = [];
  let cursor = startDay;

  while (cursor.getTime() <= endDay.getTime()) {
    const bucketEnd =
      bucketUnit === "day"
        ? cursor
        : minimumCalendarDay(addCalendarDays(cursor, 6), endDay);

    buckets.push({
      startDate: formatCalendarDay(cursor),
      endDate: formatCalendarDay(bucketEnd),
    });
    cursor = addCalendarDays(bucketEnd, 1);
  }

  return {
    range,
    timezone: SPONSOR_TIMEZONE,
    startDate,
    endDate,
    startAt: malaysiaMidnightInstant(startDay).toISOString(),
    endAtExclusive: malaysiaMidnightInstant(
      addCalendarDays(endDay, 1)
    ).toISOString(),
    bucketUnit,
    buckets,
  };
}

export function aggregateSponsorStats(
  rawRows: unknown[],
  window: SponsorStatsWindow
) {
  const bucketCounters = window.buckets.map(() => emptyCounter());
  const campaignCounters = new Map<string, Counter>();
  const placementCounters = new Map<SponsorPlacement, Counter>();
  const totals = emptyCounter();

  for (const rawRow of rawRows) {
    const row = statsRowSchema.parse(rawRow);

    if (row.stat_date < window.startDate || row.stat_date > window.endDate) {
      continue;
    }

    const impressions = parseCount(row.impressions);
    const clicks = parseCount(row.clicks);

    totals.impressions += impressions;
    totals.clicks += clicks;
    addCounts(campaignCounters, row.campaign_id, impressions, clicks);
    addCounts(placementCounters, row.placement, impressions, clicks);

    const bucketIndex = window.buckets.findIndex(
      (bucket) =>
        row.stat_date >= bucket.startDate && row.stat_date <= bucket.endDate
    );

    if (bucketIndex >= 0) {
      bucketCounters[bucketIndex].impressions += impressions;
      bucketCounters[bucketIndex].clicks += clicks;
    }
  }

  return {
    totals: withCtr(totals),
    buckets: window.buckets.map((bucket, index) => ({
      ...bucket,
      ...withCtr(bucketCounters[index]),
    })),
    byCampaign: [...campaignCounters.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([campaignId, counter]) => ({
        campaignId,
        ...withCtr(counter),
      })),
    byPlacement: [...placementCounters.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([placement, counter]) => ({
        placement,
        ...withCtr(counter),
      })),
  };
}

export async function getSponsorStats(
  range: SponsorStatsRange,
  campaignId?: string,
  now = new Date()
) {
  const window = getSponsorStatsWindow(range, now);
  let query = supabaseAdmin
    .from("sponsor_daily_stats")
    .select("stat_date,campaign_id,placement,impressions,clicks")
    .gte("stat_date", window.startDate)
    .lte("stat_date", window.endDate)
    .order("stat_date", { ascending: true });

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  const { data, error } = await query;

  if (error) {
    throw mapDatabaseError(error);
  }

  return {
    range: window.range,
    timezone: window.timezone,
    startDate: window.startDate,
    endDate: window.endDate,
    startAt: window.startAt,
    endAtExclusive: window.endAtExclusive,
    bucketUnit: window.bucketUnit,
    ...aggregateSponsorStats(data ?? [], window),
  };
}

function mapCampaignRow(rawRow: unknown): SponsorCampaign {
  const row = campaignRowSchema.parse(rawRow);

  return {
    id: row.id,
    internalName: row.internal_name,
    partnerName: row.partner_name,
    publicTitle: row.public_title,
    description: row.description,
    destinationUrl: row.destination_url,
    state: row.state,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    weight: row.weight,
    placements: (row.placements ?? []).map(mapPlacementRow),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlacementRow(
  row: z.infer<typeof campaignPlacementRowSchema>
): SponsorCampaignPlacement {
  return {
    placement: row.placement,
    imagePath: row.image_path,
    altText: row.alt_text,
    enabled: row.enabled,
    ...(row.public_title ? { publicTitle: row.public_title } : {}),
    ...(row.description ? { description: row.description } : {}),
  };
}

function mapSettingsRow(rawRow: unknown): SponsorSettings {
  const row = settingsRowSchema.parse(rawRow);

  return {
    commercialEnabled: row.commercial_enabled,
    placementEnabled: row.placement_enabled,
    minimumParagraphs: row.minimum_paragraphs,
    minimumCharacters: row.minimum_characters,
    maxAdsPerPage: row.max_ads_per_page,
    eligibleProbability: row.eligible_probability,
    cooldownPageViews: row.cooldown_page_views,
    maxAdPagesPerTen: row.max_ad_pages_per_ten,
    timezone: row.timezone,
    placementPriority: row.placement_priority,
  };
}

function normalizeSettings(settings: SponsorSettings): SponsorSettings {
  const existing = new Set(settings.placementPriority);

  return {
    ...settings,
    placementPriority: [
      ...settings.placementPriority,
      ...sponsorPlacements.filter((placement) => !existing.has(placement)),
    ],
  };
}

function mapDatabaseError(
  error: unknown,
  options: { missingResource?: "campaign" } = {}
): SponsorAdminServiceError {
  const code = isErrorLike(error) ? error.code : undefined;

  if (
    (code === "P0002" && options.missingResource === "campaign") ||
    code === "PGRST116"
  ) {
    return notFound();
  }

  if (code === "42501") {
    return new SponsorAdminServiceError("forbidden", 403, "Forbidden.");
  }

  if (
    code === "22023" ||
    code === "22P02" ||
    code === "23502" ||
    code === "23503" ||
    code === "23505" ||
    code === "23514"
  ) {
    return invalidInput();
  }

  return new SponsorAdminServiceError(
    "internal",
    500,
    "Sponsorship service failed."
  );
}

async function cancelBodyReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The public response remains a sanitized invalid-input error.
  }
}

function isErrorLike(value: unknown): value is SupabaseErrorLike {
  return typeof value === "object" && value !== null;
}

function invalidInput(): SponsorAdminServiceError {
  return new SponsorAdminServiceError(
    "invalid_input",
    400,
    "Invalid sponsorship data."
  );
}

function invalidStatsQuery(): SponsorAdminServiceError {
  return new SponsorAdminServiceError(
    "invalid_input",
    400,
    "Invalid sponsorship statistics query."
  );
}

function notFound(): SponsorAdminServiceError {
  return new SponsorAdminServiceError(
    "not_found",
    404,
    "Sponsor campaign not found."
  );
}

function isSponsorStatsRange(value: string): value is SponsorStatsRange {
  return value === "today" || value === "7d" || value === "30d" || value === "3m";
}

function malaysiaCalendarDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SPONSOR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day))
  );
}

function malaysiaMidnightInstant(calendarDay: Date): Date {
  return new Date(calendarDay.getTime() - MALAYSIA_UTC_OFFSET_MS);
}

function addCalendarDays(calendarDay: Date, amount: number): Date {
  const next = new Date(calendarDay);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function addCalendarMonths(calendarDay: Date, amount: number): Date {
  const year = calendarDay.getUTCFullYear();
  const month = calendarDay.getUTCMonth();
  const day = calendarDay.getUTCDate();
  const targetMonthStart = new Date(Date.UTC(year, month + amount, 1));
  const targetMonthEnd = new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth() + 1,
      0
    )
  );

  targetMonthStart.setUTCDate(Math.min(day, targetMonthEnd.getUTCDate()));
  return targetMonthStart;
}

function minimumCalendarDay(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function formatCalendarDay(calendarDay: Date): string {
  return calendarDay.toISOString().slice(0, 10);
}

function parseCount(value: number | string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new SponsorAdminServiceError(
      "internal",
      500,
      "Invalid sponsorship statistics data."
    );
  }

  return parsed;
}

function emptyCounter(): Counter {
  return { impressions: 0, clicks: 0 };
}

function addCounts<Key extends string>(
  counters: Map<Key, Counter>,
  key: Key,
  impressions: number,
  clicks: number
): void {
  const counter = counters.get(key) ?? emptyCounter();
  counter.impressions += impressions;
  counter.clicks += clicks;
  counters.set(key, counter);
}

function withCtr(counter: Counter): Counter & { ctr: number } {
  return {
    ...counter,
    ctr:
      counter.impressions === 0
        ? 0
        : Math.round((counter.clicks / counter.impressions) * 10_000) / 100,
  };
}
