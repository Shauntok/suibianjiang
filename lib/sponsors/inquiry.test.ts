import { describe, expect, it } from "vitest";

import {
  normalizeSponsorInquiryInput,
  sponsorInquiryStatuses,
  type SponsorInquiryInput,
} from "@/lib/sponsors/inquiry";

const validInput: SponsorInquiryInput = {
  partnerName: " 月光咖啡社 ",
  contactName: " 林小姐 ",
  email: " hello@moonlight.example ",
  phoneCountry: "MY",
  phoneNumber: "012-345 6789",
  subject: " 深夜咖啡合作 ",
  proposal: " 希望在文章阅读页安排一则安静的品牌合作。 ",
};

describe("sponsor inquiry input", () => {
  it("normalizes a Malaysian phone and trims proposal fields", () => {
    expect(normalizeSponsorInquiryInput(validInput)).toEqual({
      partnerName: "月光咖啡社",
      contactName: "林小姐",
      email: "hello@moonlight.example",
      phoneCountry: "MY",
      phoneE164: "+60123456789",
      subject: "深夜咖啡合作",
      proposal: "希望在文章阅读页安排一则安静的品牌合作。",
    });
  });

  it("rejects a missing email", () => {
    expect(() =>
      normalizeSponsorInquiryInput({ ...validInput, email: "" })
    ).toThrow("请输入有效的 Email");
  });

  it("rejects a phone that is invalid for the selected country", () => {
    expect(() =>
      normalizeSponsorInquiryInput({
        ...validInput,
        phoneCountry: "SG",
        phoneNumber: "012-345 6789",
      })
    ).toThrow("请输入有效的新加坡手机号码");
  });

  it("keeps the processing lifecycle intentionally small", () => {
    expect(sponsorInquiryStatuses).toEqual([
      "pending",
      "contacting",
      "accepted",
      "declined",
    ]);
  });
});
