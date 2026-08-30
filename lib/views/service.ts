import "server-only";

import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase-admin";

const positiveSafeIntegerSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const nonNegativeSafeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const recordInputSchema = z
  .object({
    postId: positiveSafeIntegerSchema,
    viewerHash: z.string().regex(/^[0-9a-f]{64}$/),
    userId: z.uuid().nullable(),
    countedAt: z.date().optional(),
  })
  .strict();

const viewCountRowSchema = z
  .object({
    post_id: positiveSafeIntegerSchema,
    view_count: nonNegativeSafeIntegerSchema,
  })
  .strict();

type RecordEffectivePostViewInput = {
  postId: number;
  viewerHash: string;
  userId: string | null;
  countedAt?: Date;
};

export async function recordEffectivePostView(
  input: RecordEffectivePostViewInput
): Promise<void> {
  const parsed = recordInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid post view input");
  }

  const countedAt = parsed.data.countedAt ?? new Date();
  if (!Number.isFinite(countedAt.getTime())) {
    throw new Error("Invalid post view input");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "record_effective_post_view",
    {
      p_post_id: parsed.data.postId,
      p_viewer_hash: parsed.data.viewerHash,
      p_user_id: parsed.data.userId,
      p_counted_at: countedAt.toISOString(),
    }
  );

  if (error || typeof data !== "boolean") {
    throw new Error("Unable to record effective post view");
  }
}

export async function listEffectivePostViewCounts(
  postIds: number[]
): Promise<Record<number, number>> {
  const parsed = z.array(positiveSafeIntegerSchema).max(200).safeParse(postIds);
  if (!parsed.success) {
    throw new Error("Invalid post ID batch");
  }

  if (new Set(parsed.data).size !== parsed.data.length) {
    throw new Error("Duplicate post IDs are not allowed");
  }

  if (parsed.data.length === 0) return {};

  const { data, error } = await supabaseAdmin.rpc(
    "get_effective_post_view_counts",
    { p_post_ids: parsed.data }
  );
  if (error || !Array.isArray(data)) {
    throw new Error("Unable to load effective post views");
  }

  const requestedIds = new Set(parsed.data);
  const counts: Record<number, number> = {};

  for (const candidate of data) {
    const row = viewCountRowSchema.safeParse(candidate);
    if (!row.success) {
      throw new Error("Invalid view count response");
    }
    if (!requestedIds.has(row.data.post_id)) {
      throw new Error("Unexpected post ID in view count response");
    }
    if (Object.hasOwn(counts, row.data.post_id)) {
      throw new Error("Duplicate post ID in view count response");
    }

    counts[row.data.post_id] = row.data.view_count;
  }

  if (Object.keys(counts).length !== parsed.data.length) {
    throw new Error("Incomplete view count response");
  }

  return counts;
}
