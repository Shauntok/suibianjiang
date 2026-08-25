"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  FeedbackActionStatus,
  getFeedbackNotification,
  isFeedbackFinalStatus,
} from "@/lib/admin/feedback-status";

type FeedbackStatus =
  | "all"
  | "pending"
  | "in_progress"
  | "resolved"
  | "closed";

type FeedbackProfile = {
  id: string;
  username: string | null;
  avatar_url?: string | null;
};

type FeedbackItem = {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  handled_at: string | null;
  profiles: FeedbackProfile | FeedbackProfile[] | null;
  handler: FeedbackProfile | FeedbackProfile[] | null;
};

function getSingleProfile(
  profile: FeedbackProfile | FeedbackProfile[] | null
) {
  return Array.isArray(profile) ? profile[0] : profile;
}

function getTypeLabel(type: string) {
  switch (type) {
    case "bug":
      return "🐛 Bug反馈";
    case "suggestion":
      return "💡 功能建议";
    case "report":
      return "🚨 投诉举报";
    case "experience":
      return "🌙 使用体验";
    default:
      return "📦 其他";
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case "pending":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
    case "in_progress":
      return "border-blue-500/30 bg-blue-500/10 text-blue-300";
    case "resolved":
      return "border-green-500/30 bg-green-500/10 text-green-300";
    case "closed":
      return "border-zinc-700 bg-zinc-900 text-zinc-400";
    default:
      return "border-zinc-700 bg-zinc-900 text-zinc-400";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "待处理";
    case "in_progress":
      return "处理中";
    case "resolved":
      return "已完成";
    case "closed":
      return "已关闭";
    default:
      return status;
  }
}

export default function AdminFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus>("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [statusAction, setStatusAction] = useState<{
    feedbackId: string;
    feedbackTitle: string;
    recipientName: string;
    status: FeedbackActionStatus;
  } | null>(null);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    fetchFeedbacks();
    // The page only needs its initial snapshot; refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 3500);
  }

  async function fetchFeedbacks() {
    setLoading(true);

    const { data, error } = await supabase
      .from("feedbacks")
      .select(`
        *,
        profiles:user_id (
          id,
          username,
          avatar_url
        ),
        handler:handled_by (
          id,
          username
        )
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      showToast(error.message);
      setLoading(false);
      return;
    }

    setFeedbacks(data || []);
    setLoading(false);
  }

  function openStatusDialog(
    item: FeedbackItem,
    status: FeedbackActionStatus
  ) {
    const profile = getSingleProfile(item.profiles);
    const notification = getFeedbackNotification(status, item.title || "反馈");

    setStatusAction({
      feedbackId: item.id,
      feedbackTitle: item.title || "未命名反馈",
      recipientName: profile?.username || "这位居民",
      status,
    });
    setNotificationMessage(notification.content);
  }

  async function confirmStatusUpdate() {
    if (!statusAction || statusUpdating) return;

    const trimmedMessage = notificationMessage.trim();

    if (!trimmedMessage) {
      showToast("请填写要发送给居民的通知内容。");
      return;
    }

    setStatusUpdating(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("登录状态已过期，请重新登录后再试。");
      }

      const response = await fetch(
        `/api/admin/feedback/${statusAction.feedbackId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: statusAction.status,
            message: trimmedMessage,
          }),
        }
      );
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "更新反馈失败，请稍后再试。");
      }

      showToast(
        `已更新为「${getStatusLabel(statusAction.status)}」并通知居民。`
      );
      setStatusAction(null);
      setNotificationMessage("");
      await fetchFeedbacks();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "更新反馈失败。");
    } finally {
      setStatusUpdating(false);
    }
  }

  const filteredFeedbacks = feedbacks.filter((item) => {
    const keyword = search.toLowerCase().trim();
    const profile = getSingleProfile(item.profiles);

    const matchStatus = statusFilter === "all" || item.status === statusFilter;

    const matchSearch =
      !keyword ||
      item.title?.toLowerCase().includes(keyword) ||
      item.content?.toLowerCase().includes(keyword) ||
      item.type?.toLowerCase().includes(keyword) ||
      profile?.username?.toLowerCase().includes(keyword) ||
      item.id?.toLowerCase().includes(keyword);

    return matchStatus && matchSearch;
  });

  const tabs = [
    { key: "all", label: "全部", count: feedbacks.length },
    {
      key: "pending",
      label: "待处理",
      count: feedbacks.filter((item) => item.status === "pending").length,
    },
    {
      key: "in_progress",
      label: "处理中",
      count: feedbacks.filter((item) => item.status === "in_progress").length,
    },
    {
      key: "resolved",
      label: "已完成",
      count: feedbacks.filter((item) => item.status === "resolved").length,
    },
    {
      key: "closed",
      label: "已关闭",
      count: feedbacks.filter((item) => item.status === "closed").length,
    },
  ] as const;

  return (
    <div className="relative space-y-8 overflow-hidden">
      {message && (
        <div className="fixed left-1/2 top-6 z-[10000] -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
          {message}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(statusAction)}
        title={
          statusAction
            ? `更新为「${getStatusLabel(statusAction.status)}」`
            : "更新反馈状态"
        }
        description={
          statusAction
            ? `确认后会更新「${statusAction.feedbackTitle}」，并把通知发送给 ${statusAction.recipientName}。`
            : undefined
        }
        confirmText="更新并发送通知"
        danger={statusAction?.status === "closed"}
        loading={statusUpdating}
        onConfirm={confirmStatusUpdate}
        onCancel={() => {
          if (statusUpdating) return;
          setStatusAction(null);
          setNotificationMessage("");
        }}
      >
        <label
          htmlFor="feedback-notification-message"
          className="block text-sm text-white/65"
        >
          发给居民的通知
        </label>
        <textarea
          id="feedback-notification-message"
          value={notificationMessage}
          onChange={(event) => setNotificationMessage(event.target.value)}
          rows={6}
          maxLength={800}
          disabled={statusUpdating}
          className="safe-pre mt-3 w-full resize-y rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-white/25 focus:border-white/30 disabled:opacity-50"
          placeholder="写下要发送给居民的信息"
        />
        <div className="mt-2 text-right text-xs text-white/30">
          {notificationMessage.length} / 800
        </div>
      </ConfirmDialog>

      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-bold">反馈中心 💌</h1>

          <p className="mt-2 text-zinc-500">
            查看、追踪和处理居民提交的反馈。
          </p>
        </div>

        <button
          onClick={fetchFeedbacks}
          className="rounded-full border border-zinc-700 bg-zinc-950 px-5 py-3 text-sm text-zinc-300 transition hover:border-white hover:text-white"
        >
          刷新
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索标题、内容、居民、类型或 ID..."
        className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-4 outline-none transition focus:border-white"
      />

      <div className="flex flex-wrap gap-3">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setStatusFilter(item.key as FeedbackStatus)}
            className={
              statusFilter === item.key
                ? "rounded-full border border-white bg-white px-5 py-3 text-sm font-semibold text-black transition"
                : "rounded-full border border-zinc-800 bg-zinc-950 px-5 py-3 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-white"
            }
          >
            {item.label}
            <span className="ml-2 text-xs opacity-60">{item.count}</span>
          </button>
        ))}
      </div>

      <div className="rounded-full border border-zinc-800 bg-zinc-950 px-5 py-3 text-sm text-zinc-400">
        显示 {filteredFeedbacks.length} / {feedbacks.length} 条反馈
      </div>

      {loading && (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-8 text-zinc-500">
          正在读取反馈...
        </div>
      )}

      {!loading && filteredFeedbacks.length === 0 && (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-8 text-zinc-500">
          暂时没有符合条件的反馈。
        </div>
      )}

      <div className="space-y-4">
        {filteredFeedbacks.map((item) => {
          const profile = getSingleProfile(item.profiles);
          const handler = getSingleProfile(item.handler);

          return (
            <article
              key={item.id}
              className="min-w-0 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950/50 p-6"
            >
              <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">
                      {getTypeLabel(item.type)}
                    </span>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs ${getStatusStyle(
                        item.status
                      )}`}
                    >
                      {getStatusLabel(item.status)}
                    </span>

                    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-500">
                      ID {item.id}
                    </span>
                  </div>

                  <h2 className="safe-text text-2xl font-bold text-white">
                    {item.title}
                  </h2>

                  <p className="safe-pre rounded-2xl border border-zinc-800 bg-black/30 p-4 text-sm leading-8 text-zinc-300">
                    {item.content}
                  </p>

                  <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span>提交者：{profile?.username || "未知居民"}</span>

                    {item.user_id && (
                      <Link
                        href={`/admin/users/${item.user_id}`}
                        className="text-zinc-400 transition hover:text-white"
                      >
                        查看居民 →
                      </Link>
                    )}

                    <span>
                      提交时间：
                      {new Date(item.created_at).toLocaleString("zh-CN")}
                    </span>

                    {handler?.username && <span>处理人：{handler.username}</span>}

                    {item.handled_at && (
                      <span>
                        处理时间：
                        {new Date(item.handled_at).toLocaleString("zh-CN")}
                      </span>
                    )}
                  </div>
                </div>

                {!isFeedbackFinalStatus(item.status) && (
                  <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col">
                    <button
                      onClick={() => openStatusDialog(item, "in_progress")}
                      disabled={!item.user_id || item.status === "in_progress"}
                      className="rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      处理中
                    </button>

                    <button
                      onClick={() => openStatusDialog(item, "resolved")}
                      disabled={!item.user_id}
                      className="rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-300 transition hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      已完成
                    </button>

                    <button
                      onClick={() => openStatusDialog(item, "closed")}
                      disabled={!item.user_id}
                      className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      关闭
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
