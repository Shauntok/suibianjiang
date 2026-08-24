"use client";

import {
  AlertCircle,
  Archive,
  Handshake,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import SponsorSettingsPanel from "@/components/admin/sponsors/SponsorSettingsPanel";
import SponsorStatsSummary, {
  type SponsorStatsData,
} from "@/components/admin/sponsors/SponsorStatsSummary";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type {
  CampaignInput,
  CampaignState,
  SponsorCampaign,
  SponsorPlacement,
} from "@/lib/sponsors/types";

type AdminSponsorCampaign = SponsorCampaign & {
  displayStatus: string;
};

type CampaignStats = {
  impressions: number;
  clicks: number;
  ctr: number;
};

const displayStatusLabels: Record<string, string> = {
  draft: "草稿",
  scheduled: "待开始",
  live: "进行中",
  ended: "已结束",
  paused: "暂停",
  archived: "归档",
};

const placementLabels: Record<SponsorPlacement, string> = {
  home_wide: "首页宽幅",
  space_wide: "广场宽幅",
  article_inline: "文章中段",
  diary_inline: "日记中段",
  article_after: "文章文末",
  diary_after: "日记文末",
  desktop_left: "桌面左侧",
  desktop_right: "桌面右侧",
};

export default function SponsorCenterClient() {
  const [campaigns, setCampaigns] = useState<AdminSponsorCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [updatingCampaignId, setUpdatingCampaignId] = useState("");
  const [archiveCampaign, setArchiveCampaign] =
    useState<AdminSponsorCampaign | null>(null);
  const [campaignStats, setCampaignStats] = useState<
    Record<string, CampaignStats>
  >({});

  useEffect(() => {
    let active = true;

    async function loadCampaigns() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/admin/sponsors", {
          cache: "no-store",
        });
        const body = await readJson(response);

        if (!response.ok || !isCampaignListResponse(body)) {
          throw new Error(readApiError(body, "无法读取业配列表。"));
        }

        if (active) {
          setCampaigns(body.campaigns);
        }
      } catch (reason) {
        if (active) {
          setError(errorMessage(reason, "无法读取业配列表。"));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadCampaigns();

    return () => {
      active = false;
    };
  }, [retryKey]);

  const campaignNames = useMemo(
    () =>
      Object.fromEntries(
        campaigns.map((campaign) => [campaign.id, campaign.internalName])
      ),
    [campaigns]
  );

  const handleStatsChange = useCallback((stats: SponsorStatsData) => {
    setCampaignStats(
      Object.fromEntries(
        stats.byCampaign.map((item) => [
          item.campaignId,
          {
            impressions: item.impressions,
            clicks: item.clicks,
            ctr: item.ctr,
          },
        ])
      )
    );
  }, []);

  async function updateCampaignState(
    campaign: AdminSponsorCampaign,
    state: CampaignState
  ) {
    setUpdatingCampaignId(campaign.id);
    setActionError("");

    try {
      const response = await fetch(`/api/admin/sponsors/${campaign.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(campaignInput(campaign, state)),
      });
      const body = await readJson(response);

      if (!response.ok || !isCampaignResponse(body)) {
        throw new Error(readApiError(body, "无法更新业配状态。"));
      }

      const updated = withDisplayStatus(body.campaign);
      setCampaigns((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      toast.success(
        state === "archived"
          ? "业配已归档"
          : state === "paused"
            ? "业配已暂停"
            : "业配已恢复发布"
      );
      setArchiveCampaign(null);
    } catch (reason) {
      const message = errorMessage(reason, "无法更新业配状态。");
      setActionError(message);
      toast.error(message);
    } finally {
      setUpdatingCampaignId("");
    }
  }

  const liveCount = campaigns.filter(
    (campaign) => campaign.displayStatus === "live"
  ).length;

  return (
    <div className="space-y-5 pt-12 lg:pt-0">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-amber-200/80">
            <Handshake aria-hidden="true" className="h-4 w-4" />
            <span className="text-xs">商业合作</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-100">业配中心</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            管理默认关闭的合作设置、排期、素材与匿名统计。这里不会启用任何前台广告组件。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="刷新业配列表"
            title="刷新业配列表"
            onClick={() => setRetryKey((current) => current + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 transition hover:border-zinc-600 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </button>
          <Link
            href="/admin/sponsors/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-black transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            新建业配
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 border-y border-zinc-800 py-3 sm:grid-cols-4">
        <HeaderMetric label="业配总数" value={String(campaigns.length)} />
        <HeaderMetric label="当前进行中" value={String(liveCount)} />
        <HeaderMetric
          label="待开始"
          value={String(
            campaigns.filter((item) => item.displayStatus === "scheduled").length
          )}
        />
        <HeaderMetric
          label="草稿"
          value={String(campaigns.filter((item) => item.state === "draft").length)}
        />
      </div>

      <SponsorSettingsPanel />
      <SponsorStatsSummary
        campaignNames={campaignNames}
        onStatsChange={handleStatsChange}
      />

      <section
        aria-labelledby="campaign-list-title"
        className="rounded-lg border border-zinc-800 bg-zinc-950/50"
      >
        <div className="flex flex-col gap-2 border-b border-zinc-800 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="campaign-list-title" className="text-base font-semibold">
              业配排期
            </h2>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              行内统计跟随上方选定范围；暂停与归档不会删除历史数据。
            </p>
          </div>
          {!loading && !error && (
            <span className="text-xs text-zinc-600">{campaigns.length} 条记录</span>
          )}
        </div>

        {actionError && (
          <p role="alert" className="border-b border-red-500/20 px-5 py-3 text-sm text-red-300">
            {actionError}
          </p>
        )}

        {loading ? (
          <div className="flex min-h-36 items-center gap-3 p-5 text-sm text-zinc-500">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            正在读取业配排期...
          </div>
        ) : error ? (
          <div className="flex min-h-36 items-start gap-3 p-5">
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
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                重试列表
              </button>
            </div>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-8 text-center">
            <Handshake aria-hidden="true" className="mx-auto h-6 w-6 text-zinc-700" />
            <p className="mt-3 text-sm text-zinc-400">还没有业配草稿。</p>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              新建内容仍会保持草稿与所有位置关闭。
            </p>
          </div>
        ) : (
          <div>
            {campaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                stats={campaignStats[campaign.id]}
                updating={updatingCampaignId === campaign.id}
                onPauseResume={() =>
                  void updateCampaignState(
                    campaign,
                    campaign.state === "paused" ? "published" : "paused"
                  )
                }
                onArchive={() => setArchiveCampaign(campaign)}
              />
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(archiveCampaign)}
        title="归档这份业配？"
        description="归档会停止这份业配参与投放，但不会删除素材、排期或历史统计。"
        confirmText="归档业配"
        cancelText="取消"
        danger
        loading={Boolean(
          archiveCampaign && updatingCampaignId === archiveCampaign.id
        )}
        onClose={() => setArchiveCampaign(null)}
        onConfirm={() => {
          if (archiveCampaign) {
            void updateCampaignState(archiveCampaign, "archived");
          }
        }}
      />
    </div>
  );
}

function CampaignRow({
  campaign,
  stats = { impressions: 0, clicks: 0, ctr: 0 },
  updating,
  onPauseResume,
  onArchive,
}: {
  campaign: AdminSponsorCampaign;
  stats?: CampaignStats;
  updating: boolean;
  onPauseResume: () => void;
  onArchive: () => void;
}) {
  const enabledPlacements = campaign.placements.filter((item) => item.enabled);
  const canPause = campaign.state === "published" || campaign.state === "paused";
  const isArchived = campaign.state === "archived";

  return (
    <article className="border-b border-zinc-800 p-4 last:border-b-0 sm:p-5">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(13rem,1.4fr)_minmax(12rem,1fr)_minmax(13rem,1.2fr)_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="truncate text-sm font-semibold text-zinc-100">
              {campaign.internalName}
            </h3>
            <span className={statusTextClass(campaign.displayStatus)}>
              {displayStatusLabels[campaign.displayStatus] ?? campaign.displayStatus}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-zinc-600">
            {campaign.partnerName} · 权重 {campaign.weight}
          </p>
        </div>

        <div className="min-w-0 text-xs leading-5 text-zinc-500">
          <p>{formatSchedule(campaign.startsAt)}</p>
          <p>至 {formatSchedule(campaign.endsAt)}</p>
        </div>

        <div className="min-w-0">
          <p className="truncate text-xs text-zinc-500">
            {enabledPlacements.length > 0
              ? enabledPlacements
                  .map((item) => placementLabels[item.placement])
                  .join("、")
              : "未启用业配位置"}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            {formatNumber(stats.impressions)} 曝光 · {formatNumber(stats.clicks)} 点击 · {formatCtr(stats.ctr)}% CTR
          </p>
        </div>

        <div className="flex items-center gap-1 xl:justify-end">
          <Link
            href={`/admin/sponsors/${campaign.id}`}
            aria-label={`编辑${campaign.internalName}`}
            title="编辑业配"
            className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </Link>
          {canPause && (
            <button
              type="button"
              aria-label={`${campaign.state === "paused" ? "恢复" : "暂停"}${campaign.internalName}`}
              title={campaign.state === "paused" ? "恢复发布" : "暂停业配"}
              disabled={updating}
              onClick={onPauseResume}
              className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {updating ? (
                <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : campaign.state === "paused" ? (
                <Play aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Pause aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          )}
          {!isArchived && (
            <button
              type="button"
              aria-label={`归档${campaign.internalName}`}
              title="归档业配"
              disabled={updating}
              onClick={onArchive}
              className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Archive aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2 sm:px-4">
      <p className="truncate text-xs text-zinc-600">{label}</p>
      <p className="mt-1 text-xl font-semibold text-zinc-200">{value}</p>
    </div>
  );
}

function campaignInput(
  campaign: SponsorCampaign,
  state: CampaignState
): CampaignInput {
  return {
    internalName: campaign.internalName,
    partnerName: campaign.partnerName,
    publicTitle: campaign.publicTitle,
    description: campaign.description,
    destinationUrl: campaign.destinationUrl,
    state,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    weight: campaign.weight,
    placements: campaign.placements,
  };
}

function withDisplayStatus(campaign: SponsorCampaign): AdminSponsorCampaign {
  return {
    ...campaign,
    displayStatus: deriveDisplayStatus(campaign),
  };
}

function deriveDisplayStatus(campaign: SponsorCampaign) {
  if (campaign.state !== "published") return campaign.state;

  const now = Date.now();
  if (now < new Date(campaign.startsAt).getTime()) return "scheduled";
  if (now >= new Date(campaign.endsAt).getTime()) return "ended";
  return "live";
}

function statusTextClass(status: string) {
  if (status === "live") return "text-xs font-medium text-emerald-300";
  if (status === "scheduled") return "text-xs font-medium text-amber-200";
  if (status === "paused" || status === "archived") {
    return "text-xs font-medium text-zinc-500";
  }
  return "text-xs font-medium text-zinc-400";
}

function formatSchedule(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Kuala_Lumpur",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatCtr(value: number) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isCampaignListResponse(
  value: unknown
): value is { campaigns: AdminSponsorCampaign[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "campaigns" in value &&
    Array.isArray(value.campaigns)
  );
}

function isCampaignResponse(
  value: unknown
): value is { campaign: SponsorCampaign } {
  return (
    typeof value === "object" &&
    value !== null &&
    "campaign" in value &&
    typeof value.campaign === "object" &&
    value.campaign !== null &&
    "id" in value.campaign &&
    typeof value.campaign.id === "string"
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
