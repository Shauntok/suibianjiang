import { describe, expect, it } from "vitest";

import {
  buildCommentThreads,
  getReplyDepth,
  type ThreadableComment,
} from "@/lib/comments/thread";

function comment(
  id: string,
  parentId: string | null,
  createdAt: string,
  depth = parentId ? 1 : 0
): ThreadableComment {
  return {
    id,
    parent_id: parentId,
    created_at: createdAt,
    depth,
  };
}

describe("comment threads", () => {
  const rows = [
    comment("reply-2", "reply-1", "2026-08-26T00:11:00Z", 2),
    comment("root-2", null, "2026-08-25T22:00:00Z"),
    comment("reply-1", "root-1", "2026-08-26T00:03:00Z"),
    comment("root-1", null, "2026-08-25T21:00:00Z"),
  ];

  it("keeps one visual reply level while preserving who each reply targets", () => {
    const threads = buildCommentThreads(rows, "oldest");

    expect(threads[0].root.id).toBe("root-1");
    expect(threads[0].replies.map(({ comment }) => comment.id)).toEqual([
      "reply-1",
      "reply-2",
    ]);
    expect(threads[0].replies[0].replyTo?.id).toBe("root-1");
    expect(threads[0].replies[1].replyTo?.id).toBe("reply-1");
  });

  it("sorts roots by the selected mode but keeps replies chronological", () => {
    const threads = buildCommentThreads(rows, "newest");

    expect(threads.map(({ root }) => root.id)).toEqual(["root-2", "root-1"]);
    expect(threads[1].replies.map(({ comment }) => comment.id)).toEqual([
      "reply-1",
      "reply-2",
    ]);
  });

  it("keeps an orphaned historical reply visible as its own thread", () => {
    const threads = buildCommentThreads(
      [comment("orphan", "missing", "2026-08-26T01:00:00Z")],
      "oldest"
    );

    expect(threads[0].root.id).toBe("orphan");
    expect(threads[0].replies).toEqual([]);
  });

  it("increments depth when replying to either a root or another reply", () => {
    expect(getReplyDepth(comment("root", null, "2026-08-26T00:00:00Z"))).toBe(1);
    expect(
      getReplyDepth(comment("reply", "root", "2026-08-26T00:01:00Z", 1))
    ).toBe(2);
  });
});
