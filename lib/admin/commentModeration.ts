const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getMalaysiaTodayStart(now = new Date()) {
  const malaysiaNow = new Date(now.getTime() + MALAYSIA_OFFSET_MS);

  return new Date(
    Date.UTC(
      malaysiaNow.getUTCFullYear(),
      malaysiaNow.getUTCMonth(),
      malaysiaNow.getUTCDate()
    ) - MALAYSIA_OFFSET_MS
  );
}

export function isCommentCreatedToday(
  createdAt: string,
  now = new Date()
) {
  const start = getMalaysiaTodayStart(now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const created = new Date(createdAt);

  return created >= start && created < end;
}
