import { NextResponse } from "next/server";

import {
  canManageFeedback,
  getAdminActor,
} from "@/lib/admin/authorization";
import {
  FeedbackStatusError,
  updateFeedbackStatusAndNotify,
} from "@/lib/admin/feedback-service";
import { feedbackStatusInputSchema } from "@/lib/admin/feedback-status";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext) {
  try {
    if (!isSameOriginRequest(request)) {
      return json({ error: "Forbidden" }, 403);
    }

    const actor = await getAdminActor(request);

    if (!actor) return json({ error: "Unauthorized" }, 401);
    if (!canManageFeedback(actor.role)) {
      return json({ error: "只有 owner 或 admin 可以处理反馈。" }, 403);
    }

    const parsed = feedbackStatusInputSchema.safeParse(await request.json());

    if (!parsed.success) {
      return json({ error: "请填写 1 至 800 个字的通知内容。" }, 400);
    }

    const { id } = await context.params;
    const result = await updateFeedbackStatusAndNotify({
      actorId: actor.id,
      feedbackId: id,
      status: parsed.data.status,
      message: parsed.data.message,
    });

    return json({ feedback: result });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json({ error: "请求内容格式不正确。" }, 400);
    }

    if (error instanceof FeedbackStatusError) {
      return json({ error: error.message }, error.statusCode);
    }

    console.error("feedback status update failed", error);
    return json({ error: "更新反馈或发送通知失败，请稍后再试。" }, 500);
  }
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
