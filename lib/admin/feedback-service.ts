import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  FeedbackActionStatus,
  getFeedbackNotification,
} from "./feedback-status";

type FeedbackSnapshot = {
  id: string;
  user_id: string | null;
  title: string;
  status: string;
  handled_by: string | null;
  handled_at: string | null;
  updated_at: string | null;
};

export class FeedbackStatusError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

export async function updateFeedbackStatusAndNotify({
  actorId,
  feedbackId,
  status,
  message,
}: {
  actorId: string;
  feedbackId: string;
  status: FeedbackActionStatus;
  message: string;
}) {
  const { data, error: lookupError } = await supabaseAdmin
    .from("feedbacks")
    .select(
      "id,user_id,title,status,handled_by,handled_at,updated_at"
    )
    .eq("id", feedbackId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!data) throw new FeedbackStatusError("找不到这条反馈。", 404);

  const feedback = data as FeedbackSnapshot;

  if (!feedback.user_id) {
    throw new FeedbackStatusError("这条反馈没有可接收通知的提交者。", 400);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("feedbacks")
    .update({
      status,
      handled_by: actorId,
      handled_at: now,
      updated_at: now,
    })
    .eq("id", feedbackId);

  if (updateError) throw updateError;

  const notification = getFeedbackNotification(status, feedback.title);
  const { error: notificationError } = await supabaseAdmin
    .from("notifications")
    .insert({
      user_id: feedback.user_id,
      type: "system",
      title: notification.title,
      content: message,
      is_important: status === "resolved",
    });

  if (notificationError) {
    const { error: rollbackError } = await supabaseAdmin
      .from("feedbacks")
      .update({
        status: feedback.status,
        handled_by: feedback.handled_by,
        handled_at: feedback.handled_at,
        updated_at: feedback.updated_at,
      })
      .eq("id", feedbackId);

    if (rollbackError) {
      console.error("feedback status rollback failed", rollbackError);
    }

    throw notificationError;
  }

  const { error: logError } = await supabaseAdmin.from("admin_logs").insert({
    admin_id: actorId,
    action: "update_feedback_status_and_notify",
    target_type: "feedback",
    target_id: feedbackId,
    details: `反馈状态修改为 ${status}，并发送居民通知`,
  });

  if (logError) {
    console.error("feedback action log failed", logError);
  }

  return { id: feedbackId, status, handledAt: now };
}
