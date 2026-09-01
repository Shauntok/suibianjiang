import "server-only";

import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { listEffectivePostViewCounts } from "@/lib/views/service";

const RESIDENT_POST_PAGE_SIZE = 1_000;
const VIEW_COUNT_BATCH_SIZE = 200;

const residentIdSchema = z.uuid();
const postRowSchema = z
  .object({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export async function getUserTotalEffectiveViewCount(
  residentId: string
): Promise<number> {
  const parsedResidentId = residentIdSchema.safeParse(residentId);
  if (!parsedResidentId.success) {
    throw new Error("Invalid resident ID");
  }

  const postIds: number[] = [];
  const seenPostIds = new Set<number>();

  for (let offset = 0; ; offset += RESIDENT_POST_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("posts")
      .select("id")
      .eq("author_id", parsedResidentId.data)
      .in("type", ["article", "diary"])
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + RESIDENT_POST_PAGE_SIZE - 1);

    if (error || !Array.isArray(data)) {
      throw new Error("Unable to load resident works");
    }

    for (const candidate of data) {
      const row = postRowSchema.safeParse(candidate);
      if (!row.success || seenPostIds.has(row.data.id)) {
        throw new Error("Invalid resident work response");
      }

      seenPostIds.add(row.data.id);
      postIds.push(row.data.id);
    }

    if (data.length < RESIDENT_POST_PAGE_SIZE) break;
  }

  let total = 0;

  for (let index = 0; index < postIds.length; index += VIEW_COUNT_BATCH_SIZE) {
    const batch = postIds.slice(index, index + VIEW_COUNT_BATCH_SIZE);
    const counts = await listEffectivePostViewCounts(batch);

    for (const postId of batch) {
      total += counts[postId];
      if (!Number.isSafeInteger(total)) {
        throw new Error("Resident view total is too large");
      }
    }
  }

  return total;
}
