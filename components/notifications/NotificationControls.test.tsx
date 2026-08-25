import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MailboxNotificationActions from "@/components/notifications/MailboxNotificationActions";
import MailboxFilterTabs from "@/components/notifications/MailboxFilterTabs";
import NotificationSectionTabs from "@/components/notifications/NotificationSectionTabs";

afterEach(cleanup);

describe("NotificationSectionTabs", () => {
  it("keeps the selected section visibly bordered without relying on focus", () => {
    const onChange = vi.fn();

    render(
      <NotificationSectionTabs
        section="interactions"
        mailboxUnread={1}
        interactionUnread={11}
        onChange={onChange}
      />
    );

    const mailbox = screen.getByRole("tab", { name: /信箱/ });
    const interactions = screen.getByRole("tab", { name: /互动/ });

    expect(mailbox).toHaveAttribute("aria-selected", "false");
    expect(interactions).toHaveAttribute("aria-selected", "true");
    expect(mailbox).toHaveClass("border-transparent");
    expect(interactions).toHaveClass("border-white/70");

    fireEvent.click(mailbox);
    expect(onChange).toHaveBeenCalledWith("mailbox");
  });
});

describe("MailboxNotificationActions", () => {
  it("uses icon actions with desktop tooltips and mobile labels", () => {
    const onStar = vi.fn();
    const onImportant = vi.fn();
    const onRead = vi.fn();
    const onDelete = vi.fn();

    render(
      <MailboxNotificationActions
        notificationId="notice-1"
        isRead={false}
        isStarred={false}
        isImportant={false}
        isDeleted={false}
        onStar={onStar}
        onImportant={onImportant}
        onRead={onRead}
        onDelete={onDelete}
        onRestore={vi.fn()}
      />
    );

    const star = screen.getByRole("button", { name: "星标" });
    const read = screen.getByRole("button", { name: "标记为已读" });

    expect(star).toHaveAttribute("aria-describedby", "notice-1-star-tooltip");
    expect(within(star).getByText("星标", { selector: "[data-mobile-label]" })).toHaveClass(
      "md:hidden"
    );
    expect(screen.getByRole("tooltip", { name: "星标" })).toHaveClass(
      "md:group-hover:opacity-100"
    );
    expect(within(read).getByText("已读", { selector: "[data-mobile-label]" })).toHaveClass(
      "md:hidden"
    );

    fireEvent.click(star);
    fireEvent.click(read);

    expect(onStar).toHaveBeenCalledOnce();
    expect(onRead).toHaveBeenCalledOnce();
    expect(onImportant).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("shows a restore action for deleted mail", () => {
    const onRestore = vi.fn();

    render(
      <MailboxNotificationActions
        notificationId="notice-2"
        isRead
        isStarred={false}
        isImportant={false}
        isDeleted
        onStar={vi.fn()}
        onImportant={vi.fn()}
        onRead={vi.fn()}
        onDelete={vi.fn()}
        onRestore={onRestore}
      />
    );

    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "恢复" }));
    expect(onRestore).toHaveBeenCalledOnce();
  });
});

describe("MailboxFilterTabs", () => {
  it("shows readable text filters that match the interaction filter row", () => {
    const onChange = vi.fn();

    render(
      <MailboxFilterTabs
        activeFilter="unread"
        counts={{ unread: 1, read: 0, important: 0, starred: 0, trash: 0 }}
        onChange={onChange}
      />
    );

    const unread = screen.getByRole("tab", { name: "未读" });
    const trash = screen.getByRole("tab", { name: "垃圾桶" });

    expect(unread).toHaveAttribute("aria-selected", "true");
    expect(trash).toHaveAttribute("aria-selected", "false");
    expect(within(unread).getByText("未读", { selector: "[data-filter-label]" })).toBeVisible();
    expect(within(unread).getByText("1", { selector: "[data-filter-count]" })).toBeVisible();
    expect(screen.queryByRole("tooltip", { name: "未读 1" })).not.toBeInTheDocument();

    fireEvent.click(trash);
    expect(onChange).toHaveBeenCalledWith("trash");
  });
});
