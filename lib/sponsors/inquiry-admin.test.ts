import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { updateSponsorInquiryStatus } from "@/lib/sponsors/inquiry-admin";

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

describe("sponsor inquiry administration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not reopen an accepted or declined inquiry", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "inquiry-1", status: "accepted" },
            error: null,
          }),
        })),
      })),
    } as never);

    await expect(
      updateSponsorInquiryStatus({
        inquiryId: "inquiry-1",
        actorId: "admin-1",
        status: "contacting",
      })
    ).rejects.toThrow("这份合作申请已经结束处理");
  });

  it("records the handler when changing an open inquiry status", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "inquiry-1", status: "contacting" },
      error: null,
    });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
    }));
    let call = 0;

    vi.mocked(supabaseAdmin.from).mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "inquiry-1", status: "pending" },
                error: null,
              }),
            })),
          })),
        } as never;
      }
      return { update } as never;
    });

    await updateSponsorInquiryStatus({
      inquiryId: "inquiry-1",
      actorId: "admin-1",
      status: "contacting",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "contacting",
        handled_by: "admin-1",
        handled_at: expect.any(String),
      })
    );
  });
});
