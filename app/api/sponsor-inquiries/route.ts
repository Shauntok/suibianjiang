import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeSponsorInquiryInput } from "@/lib/sponsors/inquiry";

export async function POST(request: Request) {
  const token = readBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "登录状态已过期，请重新登录。" }, { status: 401 });
  }

  try {
    const input = normalizeSponsorInquiryInput(await request.json());
    const { data, error } = await supabaseAdmin
      .from("sponsor_inquiries")
      .insert({
        user_id: user.id,
        partner_name: input.partnerName,
        contact_name: input.contactName,
        email: input.email,
        phone_country: input.phoneCountry,
        phone_e164: input.phoneE164,
        subject: input.subject,
        proposal: input.proposal,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ inquiry: data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "请检查合作申请内容。" },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.startsWith("请输入有效的")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("sponsor inquiry submission failed", error);
    return NextResponse.json(
      { error: "合作申请暂时无法送出，请稍后再试。" },
      { status: 500 }
    );
  }
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  return authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1] || null;
}
