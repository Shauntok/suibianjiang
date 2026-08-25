"use client";

import { Check, Handshake, Mail, Phone, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { SponsorInquiry } from "@/lib/sponsors/inquiry-admin";
import {
  isSponsorInquiryFinalStatus,
  type SponsorInquiryStatus,
} from "@/lib/sponsors/inquiry";

type FilterStatus = "all" | SponsorInquiryStatus;

const statusLabels: Record<SponsorInquiryStatus, string> = {
  pending: "待查看",
  contacting: "联系中",
  accepted: "已接受",
  declined: "已婉拒",
};

const statusStyles: Record<SponsorInquiryStatus, string> = {
  pending: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  contacting: "border-sky-500/25 bg-sky-500/10 text-sky-200",
  accepted: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  declined: "border-zinc-700 bg-zinc-900 text-zinc-400",
};

export default function SponsorInquiriesClient() {
  const [inquiries, setInquiries] = useState<SponsorInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [updatingId, setUpdatingId] = useState("");
  const [confirmation, setConfirmation] = useState<{
    inquiry: SponsorInquiry;
    status: "accepted" | "declined";
  } | null>(null);

  const refreshInquiries = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setInquiries(await requestSponsorInquiries());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法读取合作申请。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialInquiries() {
      try {
        const nextInquiries = await requestSponsorInquiries();
        if (active) setInquiries(nextInquiries);
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "暂时无法读取合作申请。");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitialInquiries();
    return () => {
      active = false;
    };
  }, []);

  const visibleInquiries = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return inquiries.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!keyword) return true;
      return [
        item.partnerName,
        item.contactName,
        item.email,
        item.phoneE164,
        item.subject,
        item.proposal,
        item.residentName || "",
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [filter, inquiries, search]);

  async function updateStatus(
    inquiry: SponsorInquiry,
    status: "contacting" | "accepted" | "declined"
  ) {
    if (updatingId) return;
    setUpdatingId(inquiry.id);
    try {
      const response = await fetch(`/api/admin/sponsors/inquiries/${inquiry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "暂时无法更新合作申请。");

      setInquiries((current) =>
        current.map((item) =>
          item.id === inquiry.id
            ? {
                ...item,
                status,
                handledAt: body.inquiry?.handled_at || new Date().toISOString(),
                updatedAt: body.inquiry?.updated_at || new Date().toISOString(),
              }
            : item
        )
      );
      toast.success(`合作申请已更新为「${statusLabels[status]}」。`);
      setConfirmation(null);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "暂时无法更新合作申请。");
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-amber-200/75">
            <Handshake aria-hidden="true" className="h-4 w-4" />
            <span className="text-xs">商业合作</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-100">合作申请</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            查看居民提交的品牌资料、联系方式与合作方案。这里只对 Owner 与 Admin 开放。
          </p>
        </div>
        <button
          type="button"
          aria-label="刷新合作申请"
          title="刷新合作申请"
          onClick={() => void refreshInquiries()}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 transition hover:border-zinc-600 hover:text-white"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-col gap-3 border-y border-zinc-800 py-4 lg:flex-row lg:items-center">
        <label className="relative block min-w-0 flex-1">
          <Search aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <span className="sr-only">搜索合作申请</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索品牌、联系人、Email、号码或合作主题"
            className="h-11 w-full rounded-md border border-zinc-800 bg-zinc-950 pl-11 pr-4 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto">
          {(["all", "pending", "contacting", "accepted", "declined"] as const).map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`h-10 shrink-0 rounded-full px-4 text-xs transition ${
                  filter === status
                    ? "bg-white font-semibold text-black"
                    : "border border-zinc-800 text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {status === "all" ? "全部" : statusLabels[status]}
              </button>
            )
          )}
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-zinc-600">正在读取合作申请...</p>
      ) : error ? (
        <p className="rounded-lg border border-red-900/50 bg-red-950/20 p-5 text-sm text-red-300">{error}</p>
      ) : visibleInquiries.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-600">这里暂时没有合作申请。</p>
      ) : (
        <div className="space-y-4">
          {visibleInquiries.map((inquiry) => (
            <article key={inquiry.id} className="rounded-lg border border-zinc-800 bg-zinc-950/45 p-5">
              <div className="flex flex-col gap-5 xl:flex-row xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs ${statusStyles[inquiry.status]}`}>
                      {statusLabels[inquiry.status]}
                    </span>
                    <span className="text-xs text-zinc-600">居民：{inquiry.residentName || "未知居民"}</span>
                    <span className="text-xs text-zinc-700">{formatDate(inquiry.createdAt)}</span>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold text-zinc-100">{inquiry.partnerName}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{inquiry.subject}</p>

                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
                    <span>{inquiry.contactName}</span>
                    <a href={`mailto:${inquiry.email}`} className="inline-flex items-center gap-2 hover:text-zinc-200">
                      <Mail aria-hidden="true" className="h-4 w-4" />{inquiry.email}
                    </a>
                    <a href={`tel:${inquiry.phoneE164}`} className="inline-flex items-center gap-2 hover:text-zinc-200">
                      <Phone aria-hidden="true" className="h-4 w-4" />{inquiry.phoneE164}
                    </a>
                  </div>

                  <p className="mt-5 whitespace-pre-wrap rounded-md border border-zinc-800 bg-black/40 p-4 text-sm leading-7 text-zinc-400">
                    {inquiry.proposal}
                  </p>
                </div>

                {!isSponsorInquiryFinalStatus(inquiry.status) && (
                  <div className="flex shrink-0 flex-row gap-2 xl:w-32 xl:flex-col">
                    {inquiry.status === "pending" && (
                      <button
                        type="button"
                        aria-label="标记为联系中"
                        disabled={Boolean(updatingId)}
                        onClick={() => void updateStatus(inquiry, "contacting")}
                        className="min-h-10 rounded-md border border-sky-800/70 px-3 text-xs text-sky-300 transition hover:bg-sky-950/40 disabled:opacity-40"
                      >
                        联系中
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="接受合作"
                      disabled={Boolean(updatingId)}
                      onClick={() => setConfirmation({ inquiry, status: "accepted" })}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-800/70 px-3 text-xs text-emerald-300 transition hover:bg-emerald-950/40 disabled:opacity-40"
                    >
                      <Check aria-hidden="true" className="h-4 w-4" />接受
                    </button>
                    <button
                      type="button"
                      aria-label="婉拒合作"
                      disabled={Boolean(updatingId)}
                      onClick={() => setConfirmation({ inquiry, status: "declined" })}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-xs text-zinc-400 transition hover:bg-zinc-900 disabled:opacity-40"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />婉拒
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.status === "accepted" ? "接受这份合作申请？" : "婉拒这份合作申请？"}
        description="确认后这份申请会结束处理，右侧操作按钮将不再显示。"
        confirmText={confirmation?.status === "accepted" ? "确认接受" : "确认婉拒"}
        cancelText="再看看"
        danger={confirmation?.status === "declined"}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation) void updateStatus(confirmation.inquiry, confirmation.status);
        }}
      />
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

async function requestSponsorInquiries(): Promise<SponsorInquiry[]> {
  const response = await fetch("/api/admin/sponsors/inquiries", {
    cache: "no-store",
  });
  const body = await response.json();

  if (!response.ok || !Array.isArray(body.inquiries)) {
    throw new Error(body?.error || "暂时无法读取合作申请。");
  }

  return body.inquiries;
}
