"use client";

import Link from "next/link";
import { Check, Heart, MessageCircle, Reply, Trash2 } from "lucide-react";

import {
  getInteractionKind,
  type NotificationPost,
  type NotificationProfile,
  type NotificationRecord,
} from "@/lib/notifications/model";

type InteractionNotificationCardProps = {
  notification: NotificationRecord;
  actorsById: Record<string, NotificationProfile>;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
};

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function getTargetHref(post: NotificationPost | null) {
  if (!post) return null;
  if (post.type === "diary") return `/diary/${post.id}`;
  if (post.type === "article" && post.slug) return `/articles/${post.slug}`;
  return null;
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}天前`;

  return new Date(value).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function getActorNames(
  notification: NotificationRecord,
  actorsById: Record<string, NotificationProfile>
) {
  const relatedActor = one(notification.actor);
  const actorIds = notification.recent_actor_ids?.length
    ? notification.recent_actor_ids
    : notification.actor_id
      ? [notification.actor_id]
      : [];

  return actorIds
    .map((id) => actorsById[id]?.username || (relatedActor?.id === id ? relatedActor.username : null))
    .filter((name): name is string => Boolean(name));
}

function getActorSummary(names: string[], count: number) {
  if (names.length === 0) {
    return count > 1 ? `${count} 位居民` : "有位居民";
  }

  if (count <= 1) return names[0];
  if (count === 2 && names.length >= 2) return `${names[0]}、${names[1]}`;

  const visibleNames = names.slice(0, 2);
  const remaining = Math.max(count - visibleNames.length, 0);

  return remaining > 0
    ? `${visibleNames.join("、")}和另外 ${remaining} 位居民`
    : visibleNames.join("、");
}

export default function InteractionNotificationCard({
  notification,
  actorsById,
  onMarkRead,
  onDelete,
}: InteractionNotificationCardProps) {
  const kind = getInteractionKind(notification) || "comment";
  const post = one(notification.post);
  const comment = one(notification.comment);
  const targetHref = getTargetHref(post);
  const actorCount = Math.max(notification.actor_count || 1, 1);
  const actorNames = getActorNames(notification, actorsById);
  const actorSummary = getActorSummary(actorNames, actorCount);
  const isLegacy = !notification.actor_id && !notification.post_id && !notification.comment_id;
  const activityAt = notification.last_activity_at || notification.created_at;
  const Icon = kind === "like" ? Heart : kind === "reply" ? Reply : MessageCircle;

  const targetLabel = post
    ? `${post.type === "diary" ? "日记" : post.type === "article" ? "文章" : "内容"}《${post.title}》`
    : "内容";

  return (
    <article
      className={
        notification.is_read
          ? "border-b border-white/[0.07] px-1 py-5 opacity-70 md:px-3"
          : "border-b border-white/[0.09] bg-white/[0.018] px-1 py-5 md:px-3"
      }
    >
      <div className="flex gap-3 md:gap-4">
        <div
          className={
            kind === "like"
              ? "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-300/15 bg-rose-300/[0.07] text-rose-200/75"
              : "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/55"
          }
        >
          <Icon aria-hidden="true" size={16} strokeWidth={1.7} />
        </div>

        <div className="min-w-0 flex-1">
          {isLegacy ? (
            <>
              <p className="safe-text text-sm text-white/80 md:text-[15px]">
                {notification.title || "社区互动"}
              </p>
              <p className="safe-pre mt-1.5 whitespace-pre-wrap text-sm leading-6 text-white/42">
                {notification.content}
              </p>
            </>
          ) : kind === "like" ? (
            <>
              <p className="safe-text text-sm font-medium text-white/82 md:text-[15px]">
                {actorSummary}
              </p>
              <p className="safe-text mt-1 text-sm leading-6 text-white/45">
                {targetHref ? (
                  <Link href={targetHref} className="transition hover:text-white/75">
                    喜欢了你的{targetLabel}
                  </Link>
                ) : (
                  <>喜欢了你的{targetLabel}</>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="safe-text text-sm text-white/78 md:text-[15px]">
                <span className="font-medium text-white/88">{actorSummary}</span>
                {kind === "reply"
                  ? "回复了你的评论"
                  : `评论了你的${post?.type === "diary" ? "日记" : post?.type === "article" ? "文章" : "内容"}`}
              </p>
              {comment?.content && (
                <p className="safe-text mt-1.5 line-clamp-2 text-sm leading-6 text-white/48">
                  “{comment.content}”
                </p>
              )}
              {post && targetHref && (
                <Link
                  href={targetHref}
                  className="safe-text mt-1.5 inline-block text-xs text-white/28 transition hover:text-white/60"
                >
                  《{post.title}》
                </Link>
              )}
            </>
          )}

          <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/25">
            <time dateTime={activityAt}>{formatRelativeTime(activityAt)}</time>
            {kind === "like" && actorCount > 1 && <span>{actorCount} 次喜欢</span>}
            {!notification.is_read && (
              <span className="inline-flex items-center gap-1 text-amber-100/45">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-200/60" />
                未读
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-1">
          {!notification.is_read && (
            <button
              type="button"
              aria-label="标记为已读"
              title="标记为已读"
              onClick={() => onMarkRead(notification.id)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/30 transition hover:bg-white/[0.06] hover:text-white/70"
            >
              <Check aria-hidden="true" size={16} />
            </button>
          )}
          <button
            type="button"
            aria-label="移除互动通知"
            title="移除互动通知"
            onClick={() => onDelete(notification.id)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/25 transition hover:bg-red-400/[0.07] hover:text-red-200/65"
          >
            <Trash2 aria-hidden="true" size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
