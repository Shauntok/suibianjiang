export type CommentSortMode = "oldest" | "newest";

export type ThreadableComment = {
  id: string;
  parent_id: string | null;
  created_at: string;
  depth: number | null;
};

export type CommentThread<T extends ThreadableComment> = {
  root: T;
  replies: Array<{
    comment: T;
    replyTo: T | null;
  }>;
};

function byOldest<T extends ThreadableComment>(left: T, right: T) {
  return Date.parse(left.created_at) - Date.parse(right.created_at);
}

export function buildCommentThreads<T extends ThreadableComment>(
  comments: T[],
  sortMode: CommentSortMode
): CommentThread<T>[] {
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));
  const childrenByParent = new Map<string, T[]>();

  comments.forEach((comment) => {
    if (!comment.parent_id || !commentsById.has(comment.parent_id)) return;

    const children = childrenByParent.get(comment.parent_id) || [];
    children.push(comment);
    childrenByParent.set(comment.parent_id, children);
  });

  const roots = comments
    .filter(
      (comment) =>
        !comment.parent_id || !commentsById.has(comment.parent_id)
    )
    .sort((left, right) =>
      sortMode === "oldest" ? byOldest(left, right) : byOldest(right, left)
    );

  return roots.map((root) => {
    const replies: CommentThread<T>["replies"] = [];

    const collectReplies = (parent: T) => {
      const children = [...(childrenByParent.get(parent.id) || [])].sort(byOldest);

      children.forEach((child) => {
        replies.push({ comment: child, replyTo: parent });
        collectReplies(child);
      });
    };

    collectReplies(root);

    return { root, replies };
  });
}

export function getReplyDepth(comment: ThreadableComment) {
  return Math.max(comment.depth || 0, 0) + 1;
}
