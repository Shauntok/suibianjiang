import { NextResponse } from "next/server";

import {
  canManageSponsors,
  getAdminActor,
} from "@/lib/admin/authorization";
import {
  getSponsorStats,
  parseSponsorStatsQuery,
  SPONSOR_ADMIN_NO_STORE_HEADERS,
  toSponsorApiError,
} from "@/lib/sponsors/admin-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await getAdminActor();

    if (!actor) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!canManageSponsors(actor.role)) {
      return json({ error: "Forbidden" }, 403);
    }

    const { range, campaignId } = parseSponsorStatsQuery(
      new URL(request.url)
    );
    const stats = await getSponsorStats(range, campaignId);

    return json({ stats });
  } catch (error) {
    console.error("sponsor statistics read failed", error);
    const response = toSponsorApiError(
      error,
      "Unable to load sponsorship statistics."
    );

    return json(response.body, response.status);
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: SPONSOR_ADMIN_NO_STORE_HEADERS,
  });
}
