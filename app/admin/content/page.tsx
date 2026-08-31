"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import ContentFilters from "@/components/admin/content/ContentFilters";
import ContentCard from "@/components/admin/content/ContentCard";
import type { AdminContentPost } from "@/components/admin/content/ContentCard";
import ContentStats from "@/components/admin/content/ContentStats";
import ContentSearch from "@/components/admin/content/ContentSearch";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type ContentFilter = "all" | "article" | "diary";
type StatusFilter = "all" | "published" | "draft";
type VisibilityFilter =
  | "all"
  | "public"
  | "hidden"
  | "private"
  | "unlisted";

type ConfirmConfig = {
  title: string;
  description: string;
  confirmText: string;
  danger?: boolean;
  action: (() => Promise<void>) | null;
};

type AdminContentProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  role: string | null;
  status: string | null;
};

const VIEW_COUNT_BATCH_SIZE = 200;

export default function AdminContentPage() {
  const [posts, setPosts] = useState<AdminContentPost[]>([]);
  const [profileMap, setProfileMap] = useState<
    Record<string, AdminContentProfile>
  >({});
  const [viewCounts, setViewCounts] = useState<Record<number, number>>({});
  const [viewCountUnavailable, setViewCountUnavailable] = useState(false);
  const requestSequence = useRef(0);
  const viewCountController = useRef<AbortController | null>(null);

  const [filter, setFilter] = useState<ContentFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>("all");

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

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

    window.setTimeout(() => {
      setMessage("");
    }, 3500);
  }, []);

  function openConfirm(config: ConfirmConfig) {
    setConfirmConfig(config);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!confirmConfig.action) return;

    setConfirmLoading(true);
    await confirmConfig.action();
    setConfirmLoading(false);
    setConfirmOpen(false);
  }

  const loadViewCounts = useCallback(async (
    postIds: number[],
    requestId: number
  ) => {
    setViewCounts({});
    setViewCountUnavailable(false);

    if (postIds.length === 0) return;

    const controller = new AbortController();
    viewCountController.current = controller;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Admin session unavailable");
      }
      if (controller.signal.aborted) return;

      const batches: number[][] = [];
      for (let index = 0; index < postIds.length; index += VIEW_COUNT_BATCH_SIZE) {
        batches.push(postIds.slice(index, index + VIEW_COUNT_BATCH_SIZE));
      }

      const batchCounts = await Promise.all(
        batches.map(async (batchPostIds) => {
          const response = await fetch("/api/admin/content/view-counts", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            cache: "no-store",
            body: JSON.stringify({ postIds: batchPostIds }),
            signal: controller.signal,
          });

          if (!response.ok) throw new Error("Unable to load view counts");

          return parseViewCounts(await response.json(), batchPostIds);
        })
      );

      const counts = Object.assign({}, ...batchCounts) as Record<
        number,
        number
      >;

      if (
        requestId === requestSequence.current &&
        !controller.signal.aborted
      ) {
        setViewCounts(counts);
        setViewCountUnavailable(false);
      }
    } catch {
      if (
        requestId === requestSequence.current &&
        !controller.signal.aborted
      ) {
        controller.abort();
        setViewCounts({});
        setViewCountUnavailable(true);
      }
    } finally {
      if (viewCountController.current === controller) {
        viewCountController.current = null;
      }
    }
  }, []);

  const fetchContent = useCallback(async () => {
    const requestId = ++requestSequence.current;
    viewCountController.current?.abort();
    setLoading(true);

    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", {
        ascending: false,
      });

    if (requestId !== requestSequence.current) return;

    if (error) {
      showMessage(error.message);
      setLoading(false);
      return;
    }

    const rows: AdminContentPost[] = data || [];
    setPosts(rows);
    void loadViewCounts(
      rows.map((post) => post.id),
      requestId
    );

    const authorIds = Array.from(
      new Set(rows.map((post) => post.author_id).filter(Boolean))
    );

    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, role, status")
        .in("id", authorIds);

      if (requestId !== requestSequence.current) return;

      const nextProfileMap: Record<string, AdminContentProfile> = {};

      (profiles || []).forEach((profile: AdminContentProfile) => {
        nextProfileMap[profile.id] = profile;
      });

      setProfileMap(nextProfileMap);
    } else {
      setProfileMap({});
    }

    if (requestId === requestSequence.current) {
      setLoading(false);
    }
  }, [loadViewCounts, showMessage]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void fetchContent();
    });

    return () => {
      cancelled = true;
      requestSequence.current += 1;
      viewCountController.current?.abort();
    };
  }, [fetchContent]);

  async function writeLog(
    action: string,
    targetId: string | number,
    details: string
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase.from("admin_logs").insert([
      {
        admin_id: user.id,
        action,
        target_type: "post",
        target_id: String(targetId),
        details,
      },
    ]);
  }

  function updateVisibility(id: number, visibility: string) {
    openConfirm({
      title: "修改可见性？",
      description: `确定把这篇内容设为「${visibility}」吗？`,
      confirmText: "确认修改",
      danger: visibility === "hidden" || visibility === "private",
      action: async () => {
        const { error } = await supabase
          .from("posts")
          .update({
            visibility,
            edited_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (error) {
          showMessage(error.message);
          return;
        }

        await writeLog(
          "update_content_visibility",
          id,
          `内容可见性修改为 ${visibility}`
        );

        await fetchContent();
      },
    });
  }

  function softDeletePost(id: number) {
    openConfirm({
      title: "移入回收站？",
      description:
        "内容不会立刻永久删除，会先进入回收站。之后仍然可以恢复。",
      confirmText: "移入回收站",
      danger: true,
      action: async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          showMessage("请先登录。");
          return;
        }

        const { error } = await supabase
          .from("posts")
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: user.id,
            delete_reason: "admin_soft_delete",
            edited_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (error) {
          showMessage(error.message);
          return;
        }

        await writeLog("soft_delete_content", id, "内容已移入回收站");

        await fetchContent();
      },
    });
  }

  function getTitle(post: AdminContentPost) {
    if (post.title) return post.title;

    return `日记 · ${new Date(post.created_at).toLocaleDateString("zh-CN")}`;
  }

  function getViewHref(post: AdminContentPost) {
    if (post.type === "diary") return `/diary/${post.id}`;

    if (post.type === "article" && post.slug) {
      return `/articles/${post.slug}`;
    }

    return "/admin/content";
  }

  const filteredPosts = posts.filter((post) => {
    const keyword = search.toLowerCase().trim();
    const author = post.author_id ? profileMap[post.author_id] : undefined;

    const matchType = filter === "all" || post.type === filter;
    const matchStatus =
      statusFilter === "all" || post.status === statusFilter;
    const matchVisibility =
      visibilityFilter === "all" || post.visibility === visibilityFilter;

    const matchSearch =
      !keyword ||
      String(post.id).toLowerCase().includes(keyword) ||
      post.title?.toLowerCase().includes(keyword) ||
      post.slug?.toLowerCase().includes(keyword) ||
      post.content?.toLowerCase().includes(keyword) ||
      post.author_id?.toLowerCase().includes(keyword) ||
      author?.username?.toLowerCase().includes(keyword);

    return matchType && matchStatus && matchVisibility && matchSearch;
  });

  return (
    <div className="space-y-8 overflow-hidden">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-bold">内容管理 📚</h1>

          <p className="mt-2 text-zinc-500">
            搜索、筛选和管理全站文章与日记。
          </p>
        </div>

        <button
          type="button"
          onClick={fetchContent}
          className="rounded-full border border-zinc-700 bg-zinc-950 px-5 py-3 text-sm text-zinc-300 transition hover:border-white hover:text-white"
        >
          刷新内容
        </button>
      </div>

      <ContentStats posts={posts} />

      <ContentSearch search={search} setSearch={setSearch} />

      <ContentFilters
        posts={posts}
        filter={filter}
        setFilter={setFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        visibilityFilter={visibilityFilter}
        setVisibilityFilter={setVisibilityFilter}
      />

      <div className="rounded-full border border-zinc-800 bg-zinc-950 px-5 py-3 text-sm text-zinc-400">
        显示 {filteredPosts.length} / {posts.length} 条内容
      </div>

      {loading && (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-8 text-zinc-500">
          正在读取内容...
        </div>
      )}

      {!loading && filteredPosts.length === 0 && (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-8 text-zinc-500">
          没有找到符合条件的内容。
        </div>
      )}

      <div className="space-y-4">
        {filteredPosts.map((post) => (
          <ContentCard
            key={post.id}
            post={post}
            author={post.author_id ? profileMap[post.author_id] : undefined}
            updateVisibility={updateVisibility}
            softDeletePost={softDeletePost}
            getTitle={getTitle}
            getViewHref={getViewHref}
            viewCount={viewCounts[post.id] ?? null}
            viewCountUnavailable={viewCountUnavailable}
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

function parseViewCounts(
  body: unknown,
  postIds: number[]
): Record<number, number> {
  if (!body || typeof body !== "object" || !("counts" in body)) {
    throw new Error("Invalid view count response");
  }

  const rawCounts = body.counts;
  if (!rawCounts || typeof rawCounts !== "object" || Array.isArray(rawCounts)) {
    throw new Error("Invalid view count response");
  }

  const counts: Record<number, number> = {};
  for (const postId of postIds) {
    const count = (rawCounts as Record<string, unknown>)[String(postId)];
    if (!Number.isSafeInteger(count) || (count as number) < 0) {
      throw new Error("Invalid view count response");
    }
    counts[postId] = count as number;
  }

  return counts;
}
