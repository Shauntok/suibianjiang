import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { updateFeedbackStatusAndNotify } from "./feedback-service";

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

const feedback = {
  id: "feedback-1",
  user_id: "resident-1",
  title: "自动保存文章",
  status: "pending",
  handled_by: null,
  handled_at: null,
  updated_at: "2026-08-25T00:00:00.000Z",
};

function lookupBuilder() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: feedback, error: null }),
      })),
    })),
  };
}

describe("updateFeedbackStatusAndNotify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the feedback, notifies its author, and records the action", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const notificationInsert = vi.fn().mockResolvedValue({ error: null });
    const logInsert = vi.fn().mockResolvedValue({ error: null });
    let feedbackCall = 0;

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === "feedbacks") {
        feedbackCall += 1;
        return (feedbackCall === 1
          ? lookupBuilder()
          : { update: vi.fn(() => ({ eq: updateEq })) }) as never;
      }
      if (table === "notifications") {
        return { insert: notificationInsert } as never;
      }
      return { insert: logInsert } as never;
    });

    await expect(
      updateFeedbackStatusAndNotify({
        actorId: "admin-1",
        feedbackId: feedback.id,
        status: "resolved",
        message: "已经完成，谢谢你的建议。",
      })
    ).resolves.toMatchObject({ id: feedback.id, status: "resolved" });

    expect(notificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "resident-1",
        title: "你的反馈已处理完成",
        content: "已经完成，谢谢你的建议。",
      })
    );
    expect(logInsert).toHaveBeenCalledOnce();
  });

  it("restores the previous feedback state when notification delivery fails", async () => {
    const firstUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const rollbackEq = vi.fn().mockResolvedValue({ error: null });
    const rollbackUpdate = vi.fn(() => ({ eq: rollbackEq }));
    let feedbackCall = 0;

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === "feedbacks") {
        feedbackCall += 1;
        if (feedbackCall === 1) return lookupBuilder() as never;
        if (feedbackCall === 2) {
          return {
            update: vi.fn(() => ({ eq: firstUpdateEq })),
          } as never;
        }
        return { update: rollbackUpdate } as never;
      }
      if (table === "notifications") {
        return {
          insert: vi.fn().mockResolvedValue({
            error: new Error("notification insert failed"),
          }),
        } as never;
      }
      return { insert: vi.fn() } as never;
    });

    await expect(
      updateFeedbackStatusAndNotify({
        actorId: "admin-1",
        feedbackId: feedback.id,
        status: "closed",
        message: "这条反馈现已关闭。",
      })
    ).rejects.toThrow("notification insert failed");

    expect(rollbackUpdate).toHaveBeenCalledWith({
      status: "pending",
      handled_by: null,
      handled_at: null,
      updated_at: "2026-08-25T00:00:00.000Z",
    });
    expect(rollbackEq).toHaveBeenCalledWith("id", feedback.id);
  });
});
