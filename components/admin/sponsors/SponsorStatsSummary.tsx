"use client";

import { AlertCircle, BarChart3, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  SponsorPlacement,
  SponsorStatsRange,
} from "@/lib/sponsors/types";

type StatsCounter = {
  impressions: number;
  clicks: number;
  ctr: number;
};

export type SponsorStatsData = {
  range: SponsorStatsRange;
  timezone: string;
  startDate: string;
  endDate: string;
  bucketUnit: "day" | "week";
  totals: StatsCounter;
  buckets: Array<
    StatsCounter & {
      startDate: string;
      endDate: string;
    }
  >;
  byCampaign: Array<StatsCounter & { campaignId: string }>;
  byPlacement: Array<StatsCounter & { placement: SponsorPlacement }>;
};

type SponsorStatsSummaryProps = {
  campaignNames?: Record<string, string>;
  onStatsChange?: (stats: SponsorStatsData) => void;
};

const ranges: Array<{ value: SponsorStatsRange; label: string }> = [
  { value: "today", label: "今日" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
  { value: "3m", label: "3 个月" },
];

const placementLabels: Record<SponsorPlacement, string> = {
  home_wide: "居民首页宽幅",
  space_wide: "故事广场宽幅",
  article_inline: "文章正文中段",
  diary_inline: "日记正文中段",
  article_after: "文章正文结束后",
  diary_after: "日记正文结束后",
  desktop_left: "桌面左侧直式",
  desktop_right: "桌面右侧直式",
};

export default function SponsorStatsSummary({
  campaignNames = {},
  onStatsChange,
}: SponsorStatsSummaryProps) {
  const [range, setRange] = useState<SponsorStatsRange>("7d");
  const [stats, setStats] = useState<SponsorStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadStats() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/admin/sponsors/stats?range=${range}`,
          { cache: "no-store" }
        );
        const body = await readJson(response);

        if (!response.ok || !isStatsResponse(body)) {
          throw new Error(readApiError(body, "无法读取商业合作统计。"));
        }

        if (active) {
          setStats(body.stats);
          onStatsChange?.(body.stats);
        }
      } catch (reason) {
        if (active) {
          setError(errorMessage(reason, "无法读取商业合作统计。"));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      active = false;
    };
  }, [onStatsChange, range, retryKey]);

  return (
    <section
      aria-labelledby="sponsor-stats-title"
      className="rounded-lg border border-zinc-800 bg-zinc-950/50"
    >
      <div className="flex flex-col gap-4 border-b border-zinc-800 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-zinc-200">
            <BarChart3 aria-hidden="true" className="h-4 w-4" />
            <h2 id="sponsor-stats-title" className="text-base font-semibold">
              匿名投放统计
            </h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            仅汇总曝光、点击与 CTR，不记录居民或阅读轨迹。
          </p>
        </div>

        <div
          aria-label="统计时间范围"
          className="grid grid-cols-2 gap-1 rounded-md border border-zinc-800 bg-black p-1 sm:grid-cols-4"
        >
          {ranges.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={range === item.value}
              onClick={() => setRange(item.value)}
              className={`min-h-11 rounded-[4px] px-3 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                range === item.value
                  ? "bg-zinc-100 text-black"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !stats ? (
        <div className="flex min-h-32 items-center gap-3 p-5 text-sm text-zinc-500">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          正在汇总投放统计...
        </div>
      ) : error && !stats ? (
        <div className="flex min-h-32 items-start gap-3 p-5">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 text-red-300" />
          <div>
            <p role="alert" className="text-sm leading-6 text-red-200">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setRetryKey((current) => current + 1)}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-red-400/30 px-3 text-sm text-red-100 transition hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              重试统计
            </button>
          </div>
        </div>
      ) : stats ? (
        <div className="p-5">
          <div className="grid grid-cols-3 divide-x divide-zinc-800 border-y border-zinc-800 py-3">
            <Metric label="曝光" value={formatNumber(stats.totals.impressions)} />
            <Metric label="点击" value={formatNumber(stats.totals.clicks)} />
            <Metric label="CTR" value={`${formatCtr(stats.totals.ctr)}%`} />
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-300">
              {error} 当前仍显示上一次成功读取的数据。
            </p>
          )}

          <div className="mt-5 grid gap-6 xl:grid-cols-2">
            <Breakdown
              title="按业配"
              emptyText="这个范围还没有业配数据。"
              rows={stats.byCampaign.map((item) => ({
                key: item.campaignId,
                label:
                  campaignNames[item.campaignId] ?? shortCampaignId(item.campaignId),
                ...item,
              }))}
            />
            <Breakdown
              title="按广告位"
              emptyText="这个范围还没有广告位数据。"
              rows={stats.byPlacement.map((item) => ({
                key: item.placement,
                label: placementLabels[item.placement],
                ...item,
              }))}
            />
          </div>

          <div className="mt-4 flex flex-col gap-1 border-t border-zinc-800 pt-3 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {stats.startDate} 至 {stats.endDate}
            </span>
            <span>
              {stats.timezone} · {stats.bucketUnit === "week" ? "按周" : "按日"}
              {loading ? " · 更新中" : ""}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2 text-center sm:px-4">
      <p className="text-xs text-zinc-600">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function Breakdown({
  title,
  emptyText,
  rows,
}: {
  title: string;
  emptyText: string;
  rows: Array<
    StatsCounter & {
      key: string;
      label: string;
    }
  >;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-medium text-zinc-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 border-t border-zinc-800 py-4 text-sm text-zinc-600">
          {emptyText}
        </p>
      ) : (
        <div className="mt-2 border-t border-zinc-800">
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid gap-1 border-b border-zinc-900 py-2.5 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3"
            >
              <span className="truncate text-zinc-300" title={row.label}>
                {row.label}
              </span>
              <span className="text-zinc-600 sm:whitespace-nowrap">
                {formatNumber(row.impressions)} 曝光 · {formatNumber(row.clicks)} 点击 · {formatCtr(row.ctr)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatCtr(value: number) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function shortCampaignId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isStatsResponse(value: unknown): value is { stats: SponsorStatsData } {
  return (
    typeof value === "object" &&
    value !== null &&
    "stats" in value &&
    typeof value.stats === "object" &&
    value.stats !== null
  );
}

function readApiError(value: unknown, fallback: string) {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }

  return fallback;
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
