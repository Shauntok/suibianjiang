import { NextResponse } from "next/server";

import {
  canManageSponsors,
  getAdminActor,
} from "@/lib/admin/authorization";
import {
  getSponsorCampaign,
  isSameOriginRequest,
  readBoundedJson,
  SPONSOR_ADMIN_NO_STORE_HEADERS,
  toSponsorApiError,
  updateSponsorCampaign,
} from "@/lib/sponsors/admin-service";
import { campaignInputSchema } from "@/lib/sponsors/validation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await getAdminActor();

    if (!actor) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!canManageSponsors(actor.role)) {
      return json({ error: "Forbidden" }, 403);
    }

    const { id } = await context.params;

    if (!uuidPattern.test(id)) {
      return json({ error: "Invalid sponsorship data." }, 400);
    }

    return json({ campaign: await getSponsorCampaign(id) });
  } catch (error) {
    console.error("sponsor campaign read failed", error);
    const response = toSponsorApiError(
      error,
      "Unable to load sponsorship campaign."
    );

    return json(response.body, response.status);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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

    const { id } = await context.params;

    if (!uuidPattern.test(id)) {
      return json({ error: "Invalid sponsorship data." }, 400);
    }

    const parsed = campaignInputSchema.safeParse(
      await readBoundedJson(request)
    );

    if (!parsed.success) {
      return json({ error: "Invalid sponsorship data." }, 400);
    }

    const campaign = await updateSponsorCampaign(id, actor.id, parsed.data);

    return json({ campaign });
  } catch (error) {
    console.error("sponsor campaign update failed", error);
    const response = toSponsorApiError(
      error,
      "Unable to save sponsorship campaign."
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
