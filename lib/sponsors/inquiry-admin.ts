import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  isSponsorInquiryFinalStatus,
  sponsorInquiryStatuses,
  type SponsorInquiryStatus,
} from "@/lib/sponsors/inquiry";

export type SponsorInquiry = {
  id: string;
  userId: string;
  partnerName: string;
  contactName: string;
  email: string;
  phoneCountry: string;
  phoneE164: string;
  subject: string;
  proposal: string;
  status: SponsorInquiryStatus;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
  residentName: string | null;
};

type InquiryRow = {
  id: string;
  user_id: string;
  partner_name: string;
  contact_name: string;
  email: string;
  phone_country: string;
  phone_e164: string;
  subject: string;
  proposal: string;
  status: SponsorInquiryStatus;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
  profiles: { username: string | null } | Array<{ username: string | null }> | null;
};

export class SponsorInquiryAdminError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
  }
}

export async function listSponsorInquiries(): Promise<SponsorInquiry[]> {
  const { data, error } = await supabaseAdmin
    .from("sponsor_inquiries")
    .select(`
      id, user_id, partner_name, contact_name, email, phone_country,
      phone_e164, subject, proposal, status, handled_by, handled_at,
      created_at, updated_at, profiles:user_id (username)
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data || []) as InquiryRow[]).map(toSponsorInquiry);
}

export async function updateSponsorInquiryStatus({
  inquiryId,
  actorId,
  status,
}: {
  inquiryId: string;
  actorId: string;
  status: Exclude<SponsorInquiryStatus, "pending">;
}) {
  if (!sponsorInquiryStatuses.includes(status)) {
    throw new SponsorInquiryAdminError("合作申请状态不正确。");
  }

  const { data: current, error: lookupError } = await supabaseAdmin
    .from("sponsor_inquiries")
    .select("id, status")
    .eq("id", inquiryId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!current) throw new SponsorInquiryAdminError("找不到这份合作申请。", 404);
  if (isSponsorInquiryFinalStatus(current.status)) {
    throw new SponsorInquiryAdminError("这份合作申请已经结束处理，不能重新打开。", 409);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("sponsor_inquiries")
    .update({
      status,
      handled_by: actorId,
      handled_at: now,
      updated_at: now,
    })
    .eq("id", inquiryId)
    .select("id, status, handled_by, handled_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

function toSponsorInquiry(row: InquiryRow): SponsorInquiry {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  return {
    id: row.id,
    userId: row.user_id,
    partnerName: row.partner_name,
    contactName: row.contact_name,
    email: row.email,
    phoneCountry: row.phone_country,
    phoneE164: row.phone_e164,
    subject: row.subject,
    proposal: row.proposal,
    status: row.status,
    handledBy: row.handled_by,
    handledAt: row.handled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    residentName: profile?.username || null,
  };
}
