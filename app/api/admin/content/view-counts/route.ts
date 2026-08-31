import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminActor } from "@/lib/admin/authorization";
import { listEffectivePostViewCounts } from "@/lib/views/service";

const postIdSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const requestSchema = z
  .object({
    postIds: z.array(postIdSchema).min(1).max(200),
  })
  .strict()
  .refine(
    ({ postIds }) => new Set(postIds).size === postIds.length,
    "Post IDs must be unique"
  );

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await getAdminActor(request);

    if (!actor) return json({ error: "Unauthorized" }, 401);
    if (actor.role !== "owner" && actor.role !== "admin") {
      return json({ error: "Forbidden" }, 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: "Invalid request" }, 400);
    }

    const counts = await listEffectivePostViewCounts(parsed.data.postIds);
    return json({ counts });
  } catch (error) {
    console.error("admin content view count read failed", error);
    return json({ error: "Unable to load view counts" }, 500);
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
