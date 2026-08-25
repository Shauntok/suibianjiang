export type NotificationSection = "mailbox" | "interactions";
export type MailboxFilter =
  | "unread"
  | "read"
  | "important"
  | "starred"
  | "trash";
export type InteractionKind = "like" | "comment" | "reply";
export type InteractionFilter = "all" | InteractionKind;

export type NotificationProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

export type NotificationPost = {
  id: number;
  title: string;
  type: "article" | "diary" | string;
  slug: string | null;
};

export type NotificationComment = {
  id: string;
  content: string;
};

export type NotificationRecord = {
  id: string;
  user_id: string;
  title: string | null;
  content: string | null;
  type: string | null;
  is_read: boolean;
  is_important: boolean;
  is_starred: boolean;
  deleted_at: string | null;
  created_at: string;
  actor_id: string | null;
  post_id: number | null;
  comment_id: string | null;
  actor_count: number | null;
  recent_actor_ids: string[] | null;
  last_activity_at: string | null;
  actor?: NotificationProfile | NotificationProfile[] | null;
  post?: NotificationPost | NotificationPost[] | null;
  comment?: NotificationComment | NotificationComment[] | null;
};

const legacyLikeTitles = [
  "有人喜欢了你的内容",
  "有人喜欢了你的留言",
];

const legacyCommentTitles = ["有人给你的内容留言了"];

export function getInteractionKind(
  notification: Pick<NotificationRecord, "type" | "title">
): InteractionKind | null {
  if (
    notification.type === "like" ||
    notification.type === "comment" ||
    notification.type === "reply"
  ) {
    return notification.type;
  }

  const title = notification.title?.trim() || "";

  if (legacyLikeTitles.some((prefix) => title.startsWith(prefix))) {
    return "like";
  }

  if (legacyCommentTitles.some((prefix) => title.startsWith(prefix))) {
    return "comment";
  }

  return null;
}

export function isInteractionNotification(
  notification: Pick<NotificationRecord, "type" | "title">
) {
  return getInteractionKind(notification) !== null;
}

export function filterMailboxNotifications<T extends NotificationRecord>(
  notifications: T[]
) {
  return notifications.filter((item) => !isInteractionNotification(item));
}

export function filterInteractionNotifications<T extends NotificationRecord>(
  notifications: T[],
  filter: InteractionFilter
) {
  return notifications.filter((item) => {
    const kind = getInteractionKind(item);

    return kind !== null && (filter === "all" || kind === filter);
  });
}
