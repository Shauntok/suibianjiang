"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { getFeedbackLogPresentation } from "@/lib/admin/feedback-log-display";
import { getAnnouncementLogPresentation } from "@/lib/admin/announcement-log-display";

type LogFilter =
  | "all"
  | "report"
  | "content"
  | "user"
  | "badge"
  | "growth"
  | "other";

type AdminLog = {
  id: string;
  admin_id: string | null;
  action: string;
  details: string | null;
  target_type: string | null;
  target_id: string | number | null;
  created_at: string | null;
  admin_username?: string | null;
};

type AdminProfile = {
  id: string;
  username: string | null;
};

type ActionStyle = {
  label: string;
  color: string;
  icon: string;
  details?: string;
};

function getActionStyle(
  action: string,
  details?: string | null
): ActionStyle {
  const feedbackPresentation = getFeedbackLogPresentation(action, details);
  const announcementPresentation = getAnnouncementLogPresentation(action);

  if (feedbackPresentation) return feedbackPresentation;
  if (announcementPresentation) return announcementPresentation;

  switch (action) {
    case "give_badge":
      return {
        label: "发放徽章",
        color: "bg-violet-500/15 text-violet-300 border-violet-500/30",
        icon: "🎖️",
      };

    case "remove_badge":
      return {
        label: "移除徽章",
        color: "bg-red-500/15 text-red-300 border-red-500/30",
        icon: "❌",
      };

    case "create_badge":
      return {
        label: "创建徽章",
        color: "bg-purple-500/15 text-purple-300 border-purple-500/30",
        icon: "✨",
      };

    case "delete_badge":
      return {
        label: "删除徽章",
        color: "bg-red-500/15 text-red-300 border-red-500/30",
        icon: "🗑️",
      };

    case "update_role":
      return {
        label: "修改身份",
        color: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
        icon: "👑",
      };

    case "update_status":
      return {
        label: "修改状态",
        color: "bg-red-500/15 text-red-300 border-red-500/30",
        icon: "🚨",
      };

    case "update_growth":
      return {
        label: "调整成长值",
        color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        icon: "🌱",
      };

    case "hide_comment":
      return {
        label: "隐藏评论",
        color: "bg-orange-500/15 text-orange-300 border-orange-500/30",
        icon: "🙈",
      };

    case "restore_comment":
      return {
        label: "恢复评论",
        color: "bg-green-500/15 text-green-300 border-green-500/30",
        icon: "♻️",
      };

    case "delete_comment":
      return {
        label: "删除评论",
        color: "bg-red-500/15 text-red-300 border-red-500/30",
        icon: "🗑️",
      };

    case "update_report_status":
      return {
        label: "处理举报",
        color: "bg-blue-500/15 text-blue-300 border-blue-500/30",
        icon: "🚩",
      };

    case "hide_reported_post":
      return {
        label: "隐藏被举报内容",
        color: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
        icon: "🙈",
      };

    case "hide_reported_comment":
      return {
        label: "隐藏被举报评论",
        color: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
        icon: "💬",
      };

    case "update_reported_user_status":
      return {
        label: "处理被举报用户",
        color: "bg-red-500/15 text-red-300 border-red-500/30",
        icon: "⛔",
      };

    case "mark_malicious_report":
      return {
        label: "恶意举报",
        color: "bg-red-500/15 text-red-300 border-red-500/30",
        icon: "🚨",
      };

    default:
      return {
        label: action || "未知操作",
        color: "bg-zinc-800 text-zinc-300 border-zinc-700",
        icon: "📄",
      };
  }
}

function getLogCategory(action: string): LogFilter {
  if (
    [
      "update_report_status",
      "hide_reported_post",
      "hide_reported_comment",
      "update_reported_user_status",
      "mark_malicious_report",
    ].includes(action)
  ) {
    return "report";
  }

  if (["hide_comment", "restore_comment", "delete_comment"].includes(action)) {
    return "content";
  }

  if (["update_role", "update_status"].includes(action)) {
    return "user";
  }

  if (
    ["give_badge", "remove_badge", "create_badge", "delete_badge"].includes(
      action
    )
  ) {
    return "badge";
  }

  if (action === "update_growth") {
    return "growth";
  }

  return "other";
}

export default function AdminLogsPage() {
  const router = useRouter();

  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LogFilter>("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    checkAndFetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 4200);
  }

  async function checkAndFetchLogs() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "owner") {
      router.push("/admin");
      return;
    }

    const { data, error } = await supabase
      .from("admin_logs")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      showToast(`读取操作日志失败：${error.message}`);
      setLoading(false);
      return;
    }

    const rawLogs = (data || []) as AdminLog[];

    const adminIds = Array.from(
      new Set(
        rawLogs
          .map((log) => log.admin_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const { data: adminProfiles } =
      adminIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, username")
            .in("id", adminIds)
        : { data: [] as AdminProfile[] };

    const profileMap = new Map(
      ((adminProfiles || []) as AdminProfile[]).map((item) => [
        item.id,
        item.username,
      ])
    );

    const logsWithAdminName = rawLogs.map((log) => ({
      ...log,
      admin_username:
        (log.admin_id ? profileMap.get(log.admin_id) : null) || "未知管理员",
    }));

    setLogs(logsWithAdminName);
    setLoading(false);
  }

  const filteredLogs = logs.filter((log) => {
    const keyword = search.toLowerCase().trim();
    const category = getLogCategory(log.action);

    if (filter !== "all" && category !== filter) {
      return false;
    }

    if (!keyword) return true;

    return (
      log.action?.toLowerCase().includes(keyword) ||
      log.details?.toLowerCase().includes(keyword) ||
      log.target_type?.toLowerCase().includes(keyword) ||
      String(log.target_id || "").toLowerCase().includes(keyword) ||
      log.admin_username?.toLowerCase().includes(keyword)
    );
  });

  const filterTabs = [
    {
      key: "all",
      label: "全部",
      count: logs.length,
    },
    {
      key: "report",
      label: "举报处理",
      count: logs.filter((log) => getLogCategory(log.action) === "report")
        .length,
    },
    {
      key: "content",
      label: "内容处理",
      count: logs.filter((log) => getLogCategory(log.action) === "content")
        .length,
    },
    {
      key: "user",
      label: "用户处理",
      count: logs.filter((log) => getLogCategory(log.action) === "user").length,
    },
    {
      key: "badge",
      label: "徽章",
      count: logs.filter((log) => getLogCategory(log.action) === "badge")
        .length,
    },
    {
      key: "growth",
      label: "成长",
      count: logs.filter((log) => getLogCategory(log.action) === "growth")
        .length,
    },
    {
      key: "other",
      label: "其他",
      count: logs.filter((log) => getLogCategory(log.action) === "other")
        .length,
    },
  ] as const;

  if (loading) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-8 text-zinc-500">
        正在读取操作日志...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className="fixed left-1/2 top-6 z-[999] -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
          {message}
        </div>
      )}

      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-bold">操作日志 📜</h1>

          <p className="mt-2 text-zinc-500">
            记录后台管理员的所有重要操作。仅 owner 可查看。
          </p>
        </div>

        <button
          type="button"
          onClick={checkAndFetchLogs}
          className="rounded-full border border-zinc-700 bg-zinc-950 px-5 py-3 text-sm text-zinc-300 transition hover:border-white hover:text-white"
        >
          刷新日志
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索管理员、动作、目标 ID 或详情..."
        className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-4 outline-none transition focus:border-white"
      />

      <div className="flex flex-wrap gap-3">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              filter === tab.key
                ? "border-white bg-white text-black"
                : "border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-white hover:text-white"
            }`}
          >
            {tab.label}{" "}
            <span
              className={filter === tab.key ? "text-black/60" : "text-zinc-600"}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-full border border-zinc-800 bg-zinc-950 px-5 py-3 text-sm text-zinc-400">
        当前显示 {filteredLogs.length} / {logs.length} 条日志
      </div>

      <div className="space-y-4">
        {filteredLogs.length === 0 && (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-8 text-zinc-500">
            没有找到符合条件的日志。
          </div>
        )}

        {filteredLogs.map((log) => {
          const actionStyle = getActionStyle(log.action, log.details);
          const displayDetails = actionStyle.details || log.details;

          return (
            <div
              key={log.id}
              className="min-w-0 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950/50 p-5"
            >
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                <div className="min-w-0 space-y-3">
                  <div
                    className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-sm font-bold ${actionStyle.color}`}
                  >
                    <span>{actionStyle.icon}</span>
                    <span className="safe-text">{actionStyle.label}</span>
                  </div>

                  <p className="safe-pre text-sm leading-7 text-zinc-400">
                    {displayDetails || "没有详情。"}
                  </p>

                  <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
                    <span>Admin：{log.admin_username || "未知管理员"}</span>

                    <span>Target：{log.target_type || "unknown"}</span>

                    <span className="break-all">
                      ID：{log.target_id || "无"}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-sm text-zinc-600">
                  {log.created_at
                    ? new Date(log.created_at).toLocaleString("zh-CN", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "未知时间"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
