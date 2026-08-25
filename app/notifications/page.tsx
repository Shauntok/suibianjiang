"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import MouseGlow from "@/components/MouseGlow";
import InteractionNotificationCard from "@/components/notifications/InteractionNotificationCard";
import MailboxFilterTabs from "@/components/notifications/MailboxFilterTabs";
import MailboxNotificationActions from "@/components/notifications/MailboxNotificationActions";
import NotificationSectionTabs from "@/components/notifications/NotificationSectionTabs";
import {
  filterInteractionNotifications,
  filterMailboxNotifications,
  type InteractionFilter,
  type MailboxFilter,
  type NotificationProfile,
  type NotificationRecord,
  type NotificationSection,
} from "@/lib/notifications/model";

function notifyNavbar() {
  window.dispatchEvent(new Event("notifications-updated"));

  setTimeout(() => {
    window.dispatchEvent(new Event("notifications-updated"));
  }, 250);
}

function getTypeLabel(type: string | null) {
  switch (type) {
    case "announcement":
      return "世界公告";
    case "badge":
    case "badge_award":
      return "徽章";
    case "system":
      return "系统来信";
    case "reply":
      return "留言回声";
    case "like":
      return "喜欢";
    case "follow":
      return "新的关注";
    case "room_visit":
      return "房间来访";
    default:
      return "小时代来信";
  }
}

function getTypeIcon(type: string | null) {
  switch (type) {
    case "announcement":
      return "📢";
    case "badge":
    case "badge_award":
      return "🎖️";
    case "system":
      return "🌙";
    case "reply":
      return "💬";
    case "like":
      return "🫧";
    case "follow":
      return "👣";
    case "room_visit":
      return "🏠";
    default:
      return "📬";
  }
}

export default function NotificationsPage() {
  const [section, setSection] = useState<NotificationSection>("mailbox");
  const [tab, setTab] = useState<MailboxFilter>("unread");
  const [interactionFilter, setInteractionFilter] =
    useState<InteractionFilter>("all");
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [actorsById, setActorsById] = useState<
    Record<string, NotificationProfile>
  >({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  function showToast(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 4000);
  }

  const mailboxNotifications = filterMailboxNotifications(notifications);
  const allInteractionNotifications = filterInteractionNotifications(
    notifications,
    "all"
  );

  const unreadCount = mailboxNotifications.filter(
    (item) => !item.is_read && !item.deleted_at
  ).length;

  const readCount = mailboxNotifications.filter(
    (item) => item.is_read && !item.deleted_at
  ).length;

  const importantCount = mailboxNotifications.filter(
    (item) => item.is_important && !item.deleted_at
  ).length;

  const starredCount = mailboxNotifications.filter(
    (item) => item.is_starred && !item.deleted_at
  ).length;

  const trashCount = mailboxNotifications.filter((item) => item.deleted_at).length;
  const interactionUnreadCount = allInteractionNotifications.filter(
    (item) => !item.is_read && !item.deleted_at
  ).length;

  const mailboxFilterCounts: Record<MailboxFilter, number> = {
    unread: unreadCount,
    read: readCount,
    important: importantCount,
    starred: starredCount,
    trash: trashCount,
  };

  useEffect(() => {
    fetchNotifications();
    // fetchNotifications is intentionally run once for the signed-in resident.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateView(
    nextSection: NotificationSection,
    nextFilter: InteractionFilter = interactionFilter
  ) {
    setSection(nextSection);

    const url = new URL(window.location.href);
    url.searchParams.set("section", nextSection);

    if (nextSection === "interactions" && nextFilter !== "all") {
      url.searchParams.set("type", nextFilter);
    } else {
      url.searchParams.delete("type");
    }

    window.history.replaceState(null, "", url);
  }

  function updateInteractionFilter(nextFilter: InteractionFilter) {
    setInteractionFilter(nextFilter);
    updateView("interactions", nextFilter);
  }

  async function fetchNotifications() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("notifications")
      .select(
        "*, post:posts!notifications_post_id_fkey(id,title,type,slug), comment:comments!notifications_comment_id_fkey(id,content)"
      )
      .eq("user_id", user.id)
      .order("last_activity_at", { ascending: false });

    if (error) {
      showToast(error.message);
      setLoading(false);
      return;
    }

    const nextNotifications = (data || []) as unknown as NotificationRecord[];
    const actorIds = Array.from(
      new Set(
        nextNotifications.flatMap((item) => [
          ...(item.recent_actor_ids || []),
          ...(item.actor_id ? [item.actor_id] : []),
        ])
      )
    );

    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", actorIds);

      setActorsById(
        Object.fromEntries(
          ((profiles || []) as NotificationProfile[]).map((profile) => [
            profile.id,
            profile,
          ])
        )
      );
    } else {
      setActorsById({});
    }

    setNotifications(nextNotifications);
    setLoading(false);
  }

  async function getCurrentUserId() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.id;
  }

  async function markAsRead(id: string) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, is_read: true } : item
      )
    );

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      showToast(error.message);
      await fetchNotifications();
      return;
    }

    notifyNavbar();
    await fetchNotifications();
  }

  async function moveToTrash(id: string) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const deletedAt = new Date().toISOString();

    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, deleted_at: deletedAt } : item
      )
    );

    const { error } = await supabase
      .from("notifications")
      .update({ deleted_at: deletedAt })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      showToast(error.message);
      await fetchNotifications();
      return;
    }

    notifyNavbar();
    await fetchNotifications();
  }

  async function restoreNotification(id: string) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, deleted_at: null } : item
      )
    );

    const { error } = await supabase
      .from("notifications")
      .update({ deleted_at: null })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      showToast(error.message);
      await fetchNotifications();
      return;
    }

    notifyNavbar();
    await fetchNotifications();
  }

  async function toggleStarred(id: string, currentValue: boolean) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, is_starred: !currentValue } : item
      )
    );

    const { error } = await supabase
      .from("notifications")
      .update({ is_starred: !currentValue })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      showToast(error.message);
      await fetchNotifications();
      return;
    }

    notifyNavbar();
    await fetchNotifications();
  }

  async function toggleImportant(id: string, currentValue: boolean) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, is_important: !currentValue } : item
      )
    );

    const { error } = await supabase
      .from("notifications")
      .update({ is_important: !currentValue })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      showToast(error.message);
      await fetchNotifications();
      return;
    }

    notifyNavbar();
    await fetchNotifications();
  }

  const filteredNotifications = mailboxNotifications.filter((item) => {
    if (tab === "trash") return item.deleted_at;
    if (tab === "unread") return !item.is_read && !item.deleted_at;
    if (tab === "read") return item.is_read && !item.deleted_at;
    if (tab === "important") return item.is_important && !item.deleted_at;
    if (tab === "starred") return item.is_starred && !item.deleted_at;

    return !item.deleted_at;
  });

  const visibleInteractions = filterInteractionNotifications(
    notifications,
    interactionFilter
  ).filter((item) => !item.deleted_at);

  const interactionTabs = [
    { key: "all", label: "全部", count: allInteractionNotifications.filter((item) => !item.deleted_at).length },
    { key: "like", label: "喜欢", count: filterInteractionNotifications(notifications, "like").filter((item) => !item.deleted_at).length },
    { key: "comment", label: "评论", count: filterInteractionNotifications(notifications, "comment").filter((item) => !item.deleted_at).length },
    { key: "reply", label: "回复", count: filterInteractionNotifications(notifications, "reply").filter((item) => !item.deleted_at).length },
  ] as const;

  return (
    <main className="relative z-10 min-h-screen overflow-x-hidden bg-black px-5 pb-24 pt-16 text-white md:px-6 md:py-24">
      <MouseGlow />

      {message && (
        <div className="fixed left-1/2 top-6 z-[999] -translate-x-1/2">
          <div className="rounded-2xl border border-white/10 bg-black/85 px-5 py-3 text-sm text-white shadow-2xl backdrop-blur-2xl">
            {message}
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-black via-zinc-950 to-black" />
      <div className="pointer-events-none fixed left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl md:h-[560px] md:w-[560px]" />

      <div className="relative z-10 mx-auto max-w-5xl">
        <Link
          href="/home"
          className="mb-7 inline-flex text-sm text-white/35 transition hover:text-white/70 md:mb-10"
        >
          ← 回到首页
        </Link>

        <NotificationSectionTabs
          section={section}
          mailboxUnread={unreadCount}
          interactionUnread={interactionUnreadCount}
          onChange={updateView}
        />

        <header className="mb-7 md:mb-10">
          <p className="text-xs tracking-[0.4em] text-white/25 md:tracking-[0.45em]">
            {section === "mailbox" ? "NIGHT MAILBOX" : "QUIET ECHOES"}
          </p>

          <h1 className="mt-2 text-5xl font-light tracking-tight md:mt-5 md:text-6xl">
            {section === "mailbox" ? "小时代信箱" : "互动回声"}
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-7 text-white/35 md:mt-5 md:leading-8">
            {section === "mailbox"
              ? "这里放着系统提醒、世界公告和不想错过的正式来信。"
              : "居民留下的喜欢、评论和回复，都安静地收在这里。"}
          </p>
        </header>

        {section === "mailbox" ? (
          <MailboxFilterTabs
            activeFilter={tab}
            counts={mailboxFilterCounts}
            onChange={setTab}
          />
        ) : (
          <div className="mb-6 flex flex-wrap gap-1 border-b border-white/[0.07] pb-3 md:mb-8">
            {interactionTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateInteractionFilter(item.key)}
                className={
                  interactionFilter === item.key
                    ? "rounded-full bg-white/[0.09] px-4 py-2 text-sm text-white/85"
                    : "rounded-full px-4 py-2 text-sm text-white/35 transition hover:bg-white/[0.04] hover:text-white/65"
                }
              >
                {item.label}
                <span className="ml-2 text-xs opacity-55">{item.count}</span>
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-10 text-center text-white/35 backdrop-blur-2xl md:rounded-[2.5rem] md:p-14">
            {section === "mailbox"
              ? "正在翻开今晚的信箱..."
              : "正在听今晚的回声..."}
          </div>
        )}

        {!loading &&
          (section === "mailbox"
            ? filteredNotifications.length === 0
            : visibleInteractions.length === 0) && (
          <div className="flex min-h-[280px] items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-2xl md:min-h-[360px] md:rounded-[2.5rem] md:p-14">
            <div>
              <div className="text-5xl">
                {section === "mailbox" ? "📪" : "🌙"}
              </div>

              <h2 className="mt-6 text-2xl font-light text-white/70">
                {section === "mailbox"
                  ? "这里暂时没有来信"
                  : "这里暂时没有新的回声"}
              </h2>

              <p className="mt-4 max-w-md text-sm leading-7 text-white/35">
                {section === "mailbox"
                  ? "世界很安静，但不是没有人在。也许下一封信，正在路上。"
                  : "等下一次喜欢、评论或回复落下时，它会出现在这里。"}
              </p>
            </div>
          </div>
        )}

        {section === "interactions" && !loading && visibleInteractions.length > 0 && (
          <div className="border-t border-white/[0.07]">
            {visibleInteractions.map((item) => (
              <InteractionNotificationCard
                key={item.id}
                notification={item}
                actorsById={actorsById}
                onMarkRead={markAsRead}
                onDelete={moveToTrash}
              />
            ))}
          </div>
        )}

        {section === "mailbox" && (
          <div className="space-y-4 md:space-y-5">
            {filteredNotifications.map((item) => {
            const isUnread = !item.is_read && !item.deleted_at;

            return (
              <article
                key={item.id}
                className={
                  isUnread
                    ? "rounded-[2rem] border border-yellow-400/20 bg-yellow-400/[0.055] p-5 shadow-[0_0_70px_rgba(250,204,21,0.05)] backdrop-blur-2xl md:rounded-[2.4rem] md:p-7"
                    : "rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 opacity-80 backdrop-blur-2xl md:rounded-[2.4rem] md:p-7"
                }
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 md:gap-3">
                      {isUnread && (
                        <span className="h-2.5 w-2.5 rounded-full bg-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.9)]" />
                      )}

                      <span className="text-xl md:text-2xl">
                        {getTypeIcon(item.type)}
                      </span>

                      <p className="text-xs uppercase tracking-[0.25em] text-white/30 md:tracking-[0.28em]">
                        {getTypeLabel(item.type)}
                      </p>

                      {item.is_important && (
                        <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs text-red-200/80">
                          重要
                        </span>
                      )}

                      {item.is_starred && (
                        <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs text-yellow-100/80">
                          星标
                        </span>
                      )}
                    </div>

                    <h2 className="safe-text mt-4 text-xl font-light text-white/90 md:text-2xl">
                      {item.title}
                    </h2>

                    <p className="safe-pre mt-3 whitespace-pre-wrap text-sm leading-7 text-white/55 md:leading-8">
                      {item.content}
                    </p>

                    <p className="mt-4 text-xs text-white/25">
                      {new Date(item.created_at).toLocaleString("zh-CN")}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                    <MailboxNotificationActions
                      notificationId={item.id}
                      isRead={item.is_read}
                      isStarred={item.is_starred}
                      isImportant={item.is_important}
                      isDeleted={Boolean(item.deleted_at)}
                      onStar={() => toggleStarred(item.id, item.is_starred)}
                      onImportant={() =>
                        toggleImportant(item.id, item.is_important)
                      }
                      onRead={() => markAsRead(item.id)}
                      onDelete={() => moveToTrash(item.id)}
                      onRestore={() => restoreNotification(item.id)}
                    />
                  </div>
                </div>
              </article>
            );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
