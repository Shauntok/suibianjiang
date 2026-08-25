import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { z } from "zod";

export const sponsorInquiryStatuses = [
  "pending",
  "contacting",
  "accepted",
  "declined",
] as const;

export type SponsorInquiryStatus = (typeof sponsorInquiryStatuses)[number];

export const sponsorPhoneCountries = [
  { code: "MY", label: "马来西亚", dialCode: "+60", example: "012-345 6789" },
  { code: "SG", label: "新加坡", dialCode: "+65", example: "8123 4567" },
  { code: "ID", label: "印度尼西亚", dialCode: "+62", example: "0812-3456-7890" },
  { code: "CN", label: "中国大陆", dialCode: "+86", example: "138 0013 8000" },
  { code: "HK", label: "香港", dialCode: "+852", example: "9123 4567" },
  { code: "TW", label: "台湾", dialCode: "+886", example: "0912 345 678" },
] as const satisfies ReadonlyArray<{
  code: CountryCode;
  label: string;
  dialCode: string;
  example: string;
}>;

export type SponsorPhoneCountry = (typeof sponsorPhoneCountries)[number]["code"];

const phoneCountryCodes = sponsorPhoneCountries.map((country) => country.code) as [
  SponsorPhoneCountry,
  ...SponsorPhoneCountry[],
];

export const sponsorInquiryInputSchema = z.object({
  partnerName: z.string().trim().min(2, "请输入合作方或品牌名称。").max(120),
  contactName: z.string().trim().min(2, "请输入联系人姓名。").max(80),
  email: z.string().trim().email("请输入有效的 Email。").max(254),
  phoneCountry: z.enum(phoneCountryCodes),
  phoneNumber: z.string().trim().min(5, "请输入手机号码。").max(40),
  subject: z.string().trim().min(3, "请输入合作主题。").max(160),
  proposal: z.string().trim().min(20, "合作方案至少需要 20 个字。").max(5000),
});

export type SponsorInquiryInput = z.input<typeof sponsorInquiryInputSchema>;

export type NormalizedSponsorInquiryInput = {
  partnerName: string;
  contactName: string;
  email: string;
  phoneCountry: SponsorPhoneCountry;
  phoneE164: string;
  subject: string;
  proposal: string;
};

export function normalizeSponsorInquiryInput(
  input: SponsorInquiryInput
): NormalizedSponsorInquiryInput {
  const parsed = sponsorInquiryInputSchema.parse(input);
  const country = sponsorPhoneCountries.find(
    (item) => item.code === parsed.phoneCountry
  );
  const phone = parsePhoneNumberFromString(
    parsed.phoneNumber,
    parsed.phoneCountry
  );

  if (!country || !phone?.isValid() || phone.country !== parsed.phoneCountry) {
    throw new Error(
      `请输入有效的${country?.label || "所选国家或地区"}手机号码。`
    );
  }

  return {
    partnerName: parsed.partnerName,
    contactName: parsed.contactName,
    email: parsed.email,
    phoneCountry: parsed.phoneCountry,
    phoneE164: phone.number,
    subject: parsed.subject,
    proposal: parsed.proposal,
  };
}

export function isSponsorInquiryFinalStatus(status: string) {
  return status === "accepted" || status === "declined";
}
