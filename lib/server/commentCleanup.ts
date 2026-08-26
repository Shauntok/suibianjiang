const COMMENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type CleanupResult = {
  count: number | null;
  error: Error | null;
};

type DeleteQuery = {
  eq: (column: string, value: boolean) => DeleteQuery;
  not: (column: string, operator: "is", value: null) => DeleteQuery;
  lte: (column: string, value: string) => PromiseLike<CleanupResult>;
};

type CleanupClient = {
  from: (table: string) => {
    delete: (options: { count: "exact" }) => DeleteQuery;
  };
};

export async function cleanupExpiredDeletedComments(
  client: CleanupClient,
  now = new Date()
) {
  const cutoff = new Date(now.getTime() - COMMENT_RETENTION_MS).toISOString();

  const { count, error } = await client
    .from("comments")
    .delete({ count: "exact" })
    .eq("is_deleted", true)
    .not("deleted_at", "is", null)
    .lte("deleted_at", cutoff);

  if (error) throw error;

  return count || 0;
}
