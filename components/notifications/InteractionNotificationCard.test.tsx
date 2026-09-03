import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import InteractionNotificationCard from "@/components/notifications/InteractionNotificationCard";
import type {
  NotificationProfile,
  NotificationRecord,
} from "@/lib/notifications/model";

const actors: Record<string, NotificationProfile> = {
  rain: { id: "rain", username: "小雨", avatar_url: null },
  grain: { id: "grain", username: "阿禾", avatar_url: null },
  wood: { id: "wood", username: "木木", avatar_url: null },
};

const baseNotification: NotificationRecord = {
  id: "notification-1",
  user_id: "recipient",
  title: "有人喜欢了你的内容",
  content: "有人喜欢了你的内容。",
  type: "like",
  is_read: false,
  is_important: false,
  is_starred: false,
  deleted_at: null,
  created_at: "2026-08-25T08:00:00.000Z",
  actor_id: "rain",
  post_id: 42,
  comment_id: null,
  actor_count: 12,
  recent_actor_ids: ["rain", "grain", "wood"],
  last_activity_at: "2026-08-25T08:15:00.000Z",
  post: {
    id: 42,
    title: "凌晨四点",
    type: "article",
    slug: "four-in-the-morning",
  },
};

afterEach(cleanup);

describe("InteractionNotificationCard", () => {
  it("renders one aggregated like group with its article target", () => {
    render(
      <InteractionNotificationCard
        notification={baseNotification}
        actorsById={actors}
        onMarkRead={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("小雨、阿禾和另外 10 位居民")).toBeInTheDocument();
    expect(screen.getByText("喜欢了你的文章《凌晨四点》")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /凌晨四点/ })).toHaveAttribute(
      "href",
      "/articles/four-in-the-morning"
    );
    expect(screen.getAllByText(/12/).length).toBeGreaterThan(0);
  });

  it("identifies a comment like without claiming the linked article belongs to the recipient", () => {
    render(
      <InteractionNotificationCard
        notification={{
          ...baseNotification,
          actor_count: 1,
          recent_actor_ids: ["rain"],
          comment_id: "comment-1",
          post: {
            id: 42,
            title: "迷茫",
            type: "article",
            slug: "mi-mang",
          },
          comment: {
            id: "comment-1",
            content: "我看完了你的文章。",
          },
        }}
        actorsById={actors}
        onMarkRead={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(
      screen.getByRole("link", { name: "喜欢了你在文章《迷茫》下的留言" })
    ).toHaveAttribute("href", "/articles/mi-mang");
    expect(screen.queryByText("喜欢了你的文章《迷茫》")).not.toBeInTheDocument();
  });

  it("keeps comment text visible and links diaries by database id", () => {
    render(
      <InteractionNotificationCard
        notification={{
          ...baseNotification,
          type: "comment",
          actor_count: 1,
          recent_actor_ids: ["wood"],
          actor_id: "wood",
          post_id: 73,
          comment_id: "comment-1",
          post: {
            id: 73,
            title: "雨停以后",
            type: "diary",
            slug: null,
          },
          comment: {
            id: "comment-1",
            content: "原来真的有人也有这种感觉。",
          },
        }}
        actorsById={actors}
        onMarkRead={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("木木").closest("p")).toHaveTextContent(
      "木木评论了你的日记"
    );
    expect(screen.getByText("“原来真的有人也有这种感觉。”")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /雨停以后/ })).toHaveAttribute(
      "href",
      "/diary/73"
    );
  });

  it("marks unread interactions as read and can remove them", () => {
    const onMarkRead = vi.fn();
    const onDelete = vi.fn();

    render(
      <InteractionNotificationCard
        notification={baseNotification}
        actorsById={actors}
        onMarkRead={onMarkRead}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "标记为已读" }));
    fireEvent.click(screen.getByRole("button", { name: "移除互动通知" }));

    expect(onMarkRead).toHaveBeenCalledWith("notification-1");
    expect(onDelete).toHaveBeenCalledWith("notification-1");
  });
});
