import { z } from "zod";

export const feedbackActionStatuses = [
  "in_progress",
  "resolved",
  "closed",
] as const;

export type FeedbackActionStatus = (typeof feedbackActionStatuses)[number];

export function isFeedbackFinalStatus(status: string) {
  return status === "resolved" || status === "closed";
}

export const feedbackStatusInputSchema = z.object({
  status: z.enum(feedbackActionStatuses),
  message: z.string().trim().min(1).max(800),
});

export function getFeedbackNotification(
  status: FeedbackActionStatus,
  feedbackTitle: string
) {
  const safeTitle = feedbackTitle.trim() || "你的反馈";

  switch (status) {
    case "in_progress":
      return {
        title: "你的反馈正在处理中",
        content: `你提交的反馈「${safeTitle}」已经进入处理阶段。我们正在认真查看，有新的进展会再通知你。`,
      };
    case "resolved":
      return {
        title: "你的反馈已处理完成",
        content: `你提交的反馈「${safeTitle}」已经处理完成。谢谢你认真写下这些，也谢谢你帮助小时代慢慢变得更好。`,
      };
    case "closed":
      return {
        title: "你的反馈已关闭",
        content: `你提交的反馈「${safeTitle}」现已关闭。谢谢你的反馈与理解，这份记录仍会被好好保留。`,
      };
  }
}
