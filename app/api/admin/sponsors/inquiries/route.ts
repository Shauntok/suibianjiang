import { NextResponse } from "next/server";

import { canManageSponsors, getAdminActor } from "@/lib/admin/authorization";
import { listSponsorInquiries } from "@/lib/sponsors/inquiry-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getAdminActor();

    if (!actor) return json({ error: "Unauthorized" }, 401);
    if (!canManageSponsors(actor.role)) {
      return json({ error: "只有 Owner 或 Admin 可以查看合作申请。" }, 403);
    }

    return json({ inquiries: await listSponsorInquiries() });
  } catch (error) {
    console.error("sponsor inquiry list failed", error);
    return json({ error: "暂时无法读取合作申请。" }, 500);
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
