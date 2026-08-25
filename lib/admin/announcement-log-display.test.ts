import { describe, expect, it } from "vitest";

import { getAnnouncementLogPresentation } from "./announcement-log-display";

describe("getAnnouncementLogPresentation", () => {
  it.each([
    ["create_announcement_now", "发布公告"],
    ["create_announcement_scheduled", "预约公告"],
    ["show_announcement", "显示公告"],
    ["hide_announcement", "关闭公告"],
    ["delete_announcement", "删除公告"],
    ["auto_publish_scheduled_announcement", "自动发布公告"],
    ["auto_publish_due_announcement", "自动发布公告"],
  ] as const)("localizes %s", (action, label) => {
    expect(getAnnouncementLogPresentation(action)).toMatchObject({
      label,
      color: expect.stringContaining("violet"),
    });
  });

  it("does not intercept unrelated actions", () => {
    expect(getAnnouncementLogPresentation("delete_comment")).toBeNull();
  });
});
