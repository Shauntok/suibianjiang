import { NextResponse } from "next/server";

import {
  canManageSponsors,
  getAdminActor,
} from "@/lib/admin/authorization";
import {
  getSponsorSettings,
  isSameOriginRequest,
  readBoundedJson,
  SPONSOR_ADMIN_NO_STORE_HEADERS,
  toSponsorApiError,
  updateSponsorSettings,
} from "@/lib/sponsors/admin-service";
import { settingsInputSchema } from "@/lib/sponsors/validation";

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

    return json({ settings: await getSponsorSettings() });
  } catch (error) {
    console.error("sponsor settings read failed", error);
    const response = toSponsorApiError(
      error,
      "Unable to load sponsorship settings."
    );

    return json(response.body, response.status);
  }
}

export async function PATCH(request: Request) {
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

    const parsed = settingsInputSchema.safeParse(
      await readBoundedJson(request)
    );

    if (!parsed.success) {
      return json({ error: "Invalid sponsorship data." }, 400);
    }

    const settings = await updateSponsorSettings(actor.id, parsed.data);

    return json({ settings });
  } catch (error) {
    console.error("sponsor settings update failed", error);
    const response = toSponsorApiError(
      error,
      "Unable to save sponsorship settings."
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
