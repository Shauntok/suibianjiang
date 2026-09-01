import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminActor } from "@/lib/admin/authorization";
import { getUserTotalEffectiveViewCount } from "@/lib/views/user-total";

const residentIdSchema = z.uuid();

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await getAdminActor(request);

    if (!actor) return json({ error: "Unauthorized" }, 401);
    if (actor.role !== "owner" && actor.role !== "admin") {
      return json({ error: "Forbidden" }, 403);
    }

    const parsedId = residentIdSchema.safeParse((await params).id);
    if (!parsedId.success) {
      return json({ error: "Invalid request" }, 400);
    }

    const totalEffectiveViews = await getUserTotalEffectiveViewCount(
      parsedId.data
    );

    return json({ totalEffectiveViews });
  } catch (error) {
    console.error("admin resident view total read failed", error);
    return json({ error: "Unable to load resident view total" }, 500);
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
