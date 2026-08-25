import { describe, expect, it } from "vitest";

import {
  feedbackStatusInputSchema,
  getFeedbackNotification,
  isFeedbackFinalStatus,
} from "./feedback-status";

describe("isFeedbackFinalStatus", () => {
  it.each(["resolved", "closed"])("treats %s as the end of the feedback loop", (status) => {
    expect(isFeedbackFinalStatus(status)).toBe(true);
  });

  it.each(["pending", "in_progress", "unknown"])(
    "keeps actions available for %s",
    (status) => {
      expect(isFeedbackFinalStatus(status)).toBe(false);
    }
  );
});

describe("getFeedbackNotification", () => {
  it.each([
    ["in_progress", "你的反馈正在处理中"],
    ["resolved", "你的反馈已处理完成"],
    ["closed", "你的反馈已关闭"],
  ] as const)("provides editable copy for %s", (status, title) => {
    const notification = getFeedbackNotification(status, "自动保存文章");

    expect(notification.title).toBe(title);
    expect(notification.content).toContain("自动保存文章");
    expect(notification.content.trim().length).toBeGreaterThan(0);
  });
});

describe("feedbackStatusInputSchema", () => {
  it("accepts an editable notification for a supported status", () => {
    expect(
      feedbackStatusInputSchema.parse({
        status: "resolved",
        message: "这项功能已经完成，感谢你的建议。",
      })
    ).toEqual({
      status: "resolved",
      message: "这项功能已经完成，感谢你的建议。",
    });
  });

  it.each(["pending", "rejected", "done"])(
    "rejects unsupported status %s",
    (status) => {
      expect(() =>
        feedbackStatusInputSchema.parse({ status, message: "测试消息" })
      ).toThrow();
    }
  );

  it("rejects blank or excessively long notifications", () => {
    expect(() =>
      feedbackStatusInputSchema.parse({
        status: "in_progress",
        message: "   ",
      })
    ).toThrow();
    expect(() =>
      feedbackStatusInputSchema.parse({
        status: "closed",
        message: "太".repeat(801),
      })
    ).toThrow();
  });
});
