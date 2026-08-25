import { describe, expect, it } from "vitest";

import { getFeedbackLogPresentation } from "./feedback-log-display";

describe("getFeedbackLogPresentation", () => {
  it.each([
    [
      "in_progress",
      "反馈处理中",
      "blue",
      "已将反馈设为「处理中」，并向居民发送通知。",
    ],
    [
      "resolved",
      "反馈已完成",
      "emerald",
      "已将反馈设为「已完成」，并向居民发送通知。",
    ],
    [
      "closed",
      "反馈已关闭",
      "rose",
      "已将反馈设为「已关闭」，并向居民发送通知。",
    ],
  ] as const)("localizes and colors %s feedback logs", (status, label, color, details) => {
    const presentation = getFeedbackLogPresentation(
      "update_feedback_status_and_notify",
      `反馈状态修改为 ${status}，并发送居民通知`
    );

    expect(presentation).toMatchObject({ label, details });
    expect(presentation?.color).toContain(color);
  });

  it("uses a readable fallback for an older unrecognized feedback log", () => {
    expect(
      getFeedbackLogPresentation(
        "update_feedback_status_and_notify",
        "旧格式反馈日志"
      )
    ).toMatchObject({
      label: "更新反馈状态",
      details: "旧格式反馈日志",
    });
  });

  it("does not intercept unrelated admin actions", () => {
    expect(getFeedbackLogPresentation("delete_comment", "软删除评论")).toBeNull();
  });
});
