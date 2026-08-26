"use client";

import { SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import CommentCard from "@/components/admin/comments/CommentCard";
import CommentFilters from "@/components/admin/comments/CommentFilters";
import CommentSearch from "@/components/admin/comments/CommentSearch";
import KeywordManager from "@/components/admin/comments/KeywordManager";
import type {
  AdminComment,
  CommentFilter,
  CommentModerationFlag,
} from "@/components/admin/comments/types";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  getMalaysiaTodayStart,
  isCommentCreatedToday,
} from "@/lib/admin/commentModeration";
import { supabase } from "@/lib/supabase";

type CommentSummary = {
  id: string;
  is_hidden: boolean;
  is_deleted: boolean;
  created_at: string;
};

type ConfirmConfig = {
  title: string;
  description: string;
  confirmText: string;
  danger?: boolean;
  action: (() => Promise<void>) | null;
};

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [allComments, setAllComments] = useState<CommentSummary[]>([]);
  const [moderationFlags, setModerationFlags] = useState<
    CommentModerationFlag[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CommentFilter>("today");
  const [search, setSearch] = useState("");
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [keywordManagerOpen, setKeywordManagerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({
    title: "",
    description: "",
    confirmText: "确认",
    danger: false,
    action: null,
  });

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3500);
  }, []);

  const fetchComments = useCallback(async () => {
    setLoading(true);

    const [summaryResult, flagResult] = await Promise.all([
      supabase
        .from("comments")
        .select("id,is_hidden,is_deleted,created_at"),
      supabase
        .from("comment_moderation_flags")
        .select(
          "comment_id,matched_keywords,status,detected_at,reviewed_at"
        ),
    ]);

    if (summaryResult.error || flagResult.error) {
      showMessage(
        summaryResult.error?.message ||
          flagResult.error?.message ||
          "读取评论统计失败。"
      );
      setLoading(false);
      return;
    }

    const summaries = summaryResult.data || [];
    const flags = (flagResult.data || []) as CommentModerationFlag[];
    const pendingFlags = flags.filter((item) => item.status === "pending");
    const pendingIds = pendingFlags.map((item) => item.comment_id);
    const flagMap = new Map(flags.map((item) => [item.comment_id, item]));

    setAllComments(summaries);
    setModerationFlags(flags);

    if (filter === "flagged" && pendingIds.length === 0) {
      setComments([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("comments")
      .select(
        `
        *,
        profiles (
          username,
          avatar_url
        ),
        posts (
          id,
          title,
          slug,
          type
        )
      `
      )
      .order("created_at", { ascending: false });

    if (filter === "today") {
      query = query.gte("created_at", getMalaysiaTodayStart().toISOString());
    }

    if (filter === "flagged") {
      query = query.in("id", pendingIds);
    }

    if (filter === "active") {
      query = query.eq("is_hidden", false).eq("is_deleted", false);
    }

    if (filter === "hidden") {
      query = query.eq("is_hidden", true).eq("is_deleted", false);
    }

    if (filter === "deleted") {
      query = query.eq("is_deleted", true);
    }

    const { data, error } = await query;

    if (error) {
      showMessage(error.message);
      setLoading(false);
      return;
    }

    const pendingIdSet = new Set(pendingIds);
    const rows =
      filter === "active"
        ? (data || []).filter((comment) => !pendingIdSet.has(comment.id))
        : data || [];

    setComments(
      rows.map((comment) => ({
        ...comment,
        moderation_flag: flagMap.get(comment.id) || null,
      })) as AdminComment[]
    );
    setLoading(false);
  }, [filter, showMessage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    async function fetchRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      setCurrentRole(data?.role || null);
    }

    void fetchRole();
  }, []);

  function openConfirm(config: ConfirmConfig) {
    setConfirmConfig(config);
    setConfirmOpen(true);
  }

  function refreshSidebarCounts() {
    window.dispatchEvent(new Event("admin-counts-changed"));
  }

  async function refreshModerationView() {
    refreshSidebarCounts();
    await fetchComments();
  }

  async function handleConfirm() {
    if (!confirmConfig.action) return;

    setConfirmLoading(true);
    await confirmConfig.action();
    setConfirmLoading(false);
    setConfirmOpen(false);
  }

  async function writeLog(action: string, commentId: string, details: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase.from("admin_logs").insert({
      admin_id: user.id,
      action,
      target_type: "comment",
      target_id: commentId,
      details,
    });
  }

  function hideComment(commentId: string) {
    openConfirm({
      title: "隐藏这条评论？",
      description: "隐藏后，普通居民将不会再看到这条评论。",
      confirmText: "隐藏评论",
      danger: true,
      action: async () => {
        const { error } = await supabase
          .from("comments")
          .update({
            is_hidden: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", commentId);

        if (error) {
          showMessage(error.message);
          return;
        }

        await writeLog("hide_comment", commentId, "隐藏评论");
        await refreshModerationView();
      },
    });
  }

  async function restoreComment(commentId: string) {
    const { error } = await supabase
      .from("comments")
      .update({
        is_hidden: false,
        is_deleted: false,
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId);

    if (error) {
      showMessage(error.message);
      return;
    }

    await writeLog("restore_comment", commentId, "恢复评论");
    await refreshModerationView();
  }

  function deleteComment(commentId: string) {
    openConfirm({
      title: "删除这条评论？",
      description: "这会软删除评论，不会直接从数据库移除。",
      confirmText: "删除评论",
      danger: true,
      action: async () => {
        const { error } = await supabase
          .from("comments")
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", commentId);

        if (error) {
          showMessage(error.message);
          return;
        }

        await writeLog("delete_comment", commentId, "软删除评论");
        await refreshModerationView();
      },
    });
  }

  async function clearModeration(commentId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("comment_moderation_flags")
      .update({
        status: "cleared",
        reviewed_by: user.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("comment_id", commentId);

    if (error) {
      showMessage(error.message);
      return;
    }

    await writeLog(
      "clear_comment_moderation",
      commentId,
      "检查异常字眼后确认保留评论"
    );
    showMessage("已检查，这条评论会继续正常显示。");
    await refreshModerationView();
  }

  const pendingIds = new Set(
    moderationFlags
      .filter((item) => item.status === "pending")
      .map((item) => item.comment_id)
  );
  const totalComments = allComments.length;
  const todayCount = allComments.filter((item) =>
    isCommentCreatedToday(item.created_at)
  ).length;
  const flaggedCount = pendingIds.size;
  const activeCount = allComments.filter(
    (item) =>
      !item.is_hidden && !item.is_deleted && !pendingIds.has(item.id)
  ).length;
  const hiddenCount = allComments.filter(
    (item) => item.is_hidden && !item.is_deleted
  ).length;
  const deletedCount = allComments.filter((item) => item.is_deleted).length;

  const filteredComments = comments.filter((comment) => {
    const keyword = search.toLowerCase().trim();

    if (!keyword) return true;

    const profile = Array.isArray(comment.profiles)
      ? comment.profiles[0]
      : comment.profiles;
    const post = Array.isArray(comment.posts)
      ? comment.posts[0]
      : comment.posts;

    return (
      String(comment.id).toLowerCase().includes(keyword) ||
      comment.content?.toLowerCase().includes(keyword) ||
      profile?.username?.toLowerCase().includes(keyword) ||
      post?.title?.toLowerCase().includes(keyword) ||
      post?.slug?.toLowerCase().includes(keyword)
    );
  });

  function getPostHref(comment: AdminComment) {
    const post = Array.isArray(comment.posts)
      ? comment.posts[0]
      : comment.posts;

    if (!post) return "/admin/published";
    if (post.type === "diary") return `/diary/${post.id}`;
    if (post.type === "article" && post.slug) return `/articles/${post.slug}`;
    return "/admin/published";
  }

  const canManageKeywords =
    currentRole === "owner" || currentRole === "admin";

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-bold">评论管理 💬</h1>
          <p className="mt-2 text-zinc-500">
            查看今日留言，并温和地处理需要人工确认的评论。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setKeywordManagerOpen((value) => !value)}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-zinc-800 px-4 py-3 text-sm text-zinc-300 transition hover:border-zinc-600 hover:text-white md:self-auto"
        >
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          检测词库
        </button>
      </div>

      <KeywordManager
        open={keywordManagerOpen}
        canManage={canManageKeywords}
        onClose={() => setKeywordManagerOpen(false)}
        onChanged={refreshModerationView}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard title="总评论" value={totalComments} />
        <StatCard
          title="今日新增"
          value={todayCount}
          active={filter === "today"}
          onClick={() => setFilter("today")}
        />
        <StatCard
          title="待检查异常"
          value={flaggedCount}
          tone="danger"
          active={filter === "flagged"}
          onClick={() => setFilter("flagged")}
        />
        <StatCard
          title="正常公开"
          value={activeCount}
          active={filter === "active"}
          onClick={() => setFilter("active")}
        />
        <StatCard title="隐藏 / 删除" value={`${hiddenCount} / ${deletedCount}`} />
      </div>

      <CommentSearch search={search} setSearch={setSearch} />
      <CommentFilters filter={filter} setFilter={setFilter} />

      {filter === "deleted" && (
        <p className="rounded-2xl border border-amber-400/15 bg-amber-400/5 px-4 py-3 text-sm leading-6 text-amber-100/70">
          已删除评论会保留 30 天供管理员恢复，之后由每日清理任务从 Supabase 永久删除。
        </p>
      )}

      {loading && (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-8 text-zinc-500">
          正在读取评论...
        </div>
      )}

      {!loading && filteredComments.length === 0 && (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-8 text-zinc-500">
          这个分类暂时没有评论。
        </div>
      )}

      <div className="space-y-4">
        {filteredComments.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            getPostHref={getPostHref}
            hideComment={hideComment}
            restoreComment={restoreComment}
            deleteComment={deleteComment}
            clearModeration={clearModeration}
          />
        ))}
      </div>

      {message && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
          {message}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        confirmText={confirmConfig.confirmText}
        cancelText="取消"
        danger={confirmConfig.danger}
        loading={confirmLoading}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  tone = "default",
  active = false,
  onClick,
}: {
  title: string;
  value: string | number;
  tone?: "default" | "danger";
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="text-sm text-zinc-500">{title}</p>
      <p
        className={`mt-2 text-3xl font-bold ${
          tone === "danger" && Number(value) > 0
            ? "text-red-300"
            : "text-white"
        }`}
      >
        {value}
      </p>
    </>
  );

  const className = `min-w-0 rounded-2xl border p-4 text-left transition ${
    active
      ? "border-zinc-500 bg-zinc-900"
      : "border-zinc-800 bg-zinc-950/50"
  }`;

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${className} hover:border-zinc-600`}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}
