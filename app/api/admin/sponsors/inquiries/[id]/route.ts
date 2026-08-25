import { NextResponse } from "next/server";
import { z } from "zod";

import { canManageSponsors, getAdminActor } from "@/lib/admin/authorization";
import {
  SponsorInquiryAdminError,
  updateSponsorInquiryStatus,
} from "@/lib/sponsors/inquiry-admin";

type RouteContext = { params: Promise<{ id: string }> };

const statusSchema = z.object({
  status: z.enum(["contacting", "accepted", "declined"]),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    if (!isSameOriginRequest(request)) {
      return json({ error: "Forbidden" }, 403);
    }

    const actor = await getAdminActor(request);
    if (!actor) return json({ error: "Unauthorized" }, 401);
    if (!canManageSponsors(actor.role)) {
      return json({ error: "只有 Owner 或 Admin 可以处理合作申请。" }, 403);
    }

    const parsed = statusSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "合作申请状态不正确。" }, 400);

    const { id } = await context.params;
    const inquiry = await updateSponsorInquiryStatus({
      inquiryId: id,
      actorId: actor.id,
      status: parsed.data.status,
    });

    return json({ inquiry });
  } catch (error) {
    if (error instanceof SponsorInquiryAdminError) {
      return json({ error: error.message }, error.statusCode);
    }
    console.error("sponsor inquiry status update failed", error);
    return json({ error: "暂时无法更新合作申请。" }, 500);
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
