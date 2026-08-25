import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, single, insert, from } = vi.hoisted(() => {
  const getUser = vi.fn();
  const single = vi.fn();
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));

  return { getUser, single, insert, from };
});

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    auth: { getUser },
    from,
  },
}));

import { POST } from "@/app/api/sponsor-inquiries/route";

const payload = {
  partnerName: "月光咖啡社",
  contactName: "林小姐",
  email: "hello@moonlight.example",
  phoneCountry: "MY",
  phoneNumber: "012-345 6789",
  subject: "深夜咖啡合作",
  proposal: "希望在文章阅读页安排一则安静而不打扰居民的品牌合作。",
};

describe("POST /api/sponsor-inquiries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    single.mockResolvedValue({ data: { id: "inquiry-1" }, error: null });
  });

  it("requires an authenticated resident", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(request(payload, ""));

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects invalid contact information", async () => {
    const response = await POST(request({ ...payload, email: "bad" }));

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("stores normalized contact information with a pending status", async () => {
    const response = await POST(request(payload));

    expect(response.status).toBe(201);
    expect(from).toHaveBeenCalledWith("sponsor_inquiries");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      partner_name: "月光咖啡社",
      contact_name: "林小姐",
      email: "hello@moonlight.example",
      phone_country: "MY",
      phone_e164: "+60123456789",
      subject: "深夜咖啡合作",
      proposal: "希望在文章阅读页安排一则安静而不打扰居民的品牌合作。",
      status: "pending",
    });
  });
});

function request(body: unknown, token = "resident-token") {
  return new Request("https://ourlittleage.test/api/sponsor-inquiries", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
