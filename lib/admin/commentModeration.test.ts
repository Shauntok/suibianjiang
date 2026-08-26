import { describe, expect, it } from "vitest";

import {
  getMalaysiaTodayStart,
  isCommentCreatedToday,
} from "./commentModeration";

describe("comment moderation date helpers", () => {
  it("uses Malaysia midnight for the today boundary", () => {
    const now = new Date("2026-08-26T04:00:00.000Z");

    expect(getMalaysiaTodayStart(now).toISOString()).toBe(
      "2026-08-25T16:00:00.000Z"
    );
  });

  it("separates comments around Malaysia midnight", () => {
    const now = new Date("2026-08-26T04:00:00.000Z");

    expect(isCommentCreatedToday("2026-08-25T15:59:59.999Z", now)).toBe(
      false
    );
    expect(isCommentCreatedToday("2026-08-25T16:00:00.000Z", now)).toBe(
      true
    );
  });
});
