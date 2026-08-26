export type CommentFilter =
  | "today"
  | "flagged"
  | "active"
  | "hidden"
  | "deleted";

export type CommentModerationFlag = {
  comment_id: string;
  matched_keywords: string[];
  status: "pending" | "cleared";
  detected_at: string;
  reviewed_at: string | null;
};

export type AdminCommentProfile = {
  username: string | null;
  avatar_url: string | null;
};

export type AdminCommentPost = {
  id: number;
  title: string | null;
  slug: string | null;
  type: string;
};

export type AdminComment = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  is_hidden: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  profiles: AdminCommentProfile | AdminCommentProfile[] | null;
  posts: AdminCommentPost | AdminCommentPost[] | null;
  moderation_flag: CommentModerationFlag | null;
};
