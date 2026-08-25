import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SponsorInquiriesClient from "@/components/admin/sponsors/SponsorInquiriesClient";

const inquiries = [
  {
    id: "pending-1",
    userId: "resident-1",
    partnerName: "月光咖啡社",
    contactName: "林小姐",
    email: "hello@moonlight.example",
    phoneCountry: "MY",
    phoneE164: "+60123456789",
    subject: "深夜咖啡合作",
    proposal: "希望在文章阅读页安排一则安静而不打扰居民的品牌合作。",
    status: "pending",
    handledBy: null,
    handledAt: null,
    createdAt: "2026-08-25T10:00:00.000Z",
    updatedAt: "2026-08-25T10:00:00.000Z",
    residentName: "小雨",
  },
  {
    id: "accepted-1",
    userId: "resident-2",
    partnerName: "晚风书店",
    contactName: "陈先生",
    email: "hello@nightbook.example",
    phoneCountry: "SG",
    phoneE164: "+6581234567",
    subject: "夜读企划",
    proposal: "希望和小时代一起做一场安静的深夜阅读合作企划。",
    status: "accepted",
    handledBy: "admin-1",
    handledAt: "2026-08-25T12:00:00.000Z",
    createdAt: "2026-08-25T09:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
    residentName: "阿禾",
  },
];

describe("SponsorInquiriesClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ inquiries }),
      })
    );
  });

  it("shows contact details and processing actions only for open inquiries", async () => {
    render(<SponsorInquiriesClient />);

    expect(await screen.findByText("月光咖啡社")).toBeInTheDocument();
    expect(screen.getByText("hello@moonlight.example")).toBeInTheDocument();
    expect(screen.getByText("+60123456789")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标记为联系中" })).toBeInTheDocument();

    const acceptedCard = screen.getByText("晚风书店").closest("article");
    expect(acceptedCard).not.toBeNull();
    expect(acceptedCard).not.toHaveTextContent("标记为联系中");
    expect(acceptedCard).not.toHaveTextContent("接受合作");
    expect(acceptedCard).not.toHaveTextContent("婉拒合作");
  });
});
