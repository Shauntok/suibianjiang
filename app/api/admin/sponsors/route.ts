import { NextResponse } from "next/server";

import {
  canManageSponsors,
  getAdminActor,
} from "@/lib/admin/authorization";
import {
  createSponsorCampaign,
  isSameOriginRequest,
  listSponsorCampaigns,
  readBoundedJson,
  SPONSOR_ADMIN_NO_STORE_HEADERS,
  toSponsorApiError,
} from "@/lib/sponsors/admin-service";
import { campaignInputSchema } from "@/lib/sponsors/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getAdminActor();

    if (!actor) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!canManageSponsors(actor.role)) {
      return json({ error: "Forbidden" }, 403);
    }

    return json({ campaigns: await listSponsorCampaigns() });
  } catch (error) {
    console.error("sponsor campaign list failed", error);
    const response = toSponsorApiError(
      error,
      "Unable to load sponsorship campaigns."
    );

    return json(response.body, response.status);
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return json({ error: "Forbidden" }, 403);
    }

    const actor = await getAdminActor();

    if (!actor) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!canManageSponsors(actor.role)) {
      return json({ error: "Forbidden" }, 403);
    }

    const parsed = campaignInputSchema.safeParse(
      await readBoundedJson(request)
    );

    if (!parsed.success) {
      return json({ error: "Invalid sponsorship data." }, 400);
    }

    const campaign = await createSponsorCampaign(actor.id, parsed.data);

    return json({ campaign }, 201);
  } catch (error) {
    console.error("sponsor campaign creation failed", error);
    const response = toSponsorApiError(
      error,
      "Unable to create sponsorship campaign."
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
