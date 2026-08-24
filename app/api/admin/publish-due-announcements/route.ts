import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get("origin");

    if (origin && origin !== requestUrl.origin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !["owner", "admin", "moderator"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date().toISOString();

    const { data: announcements, error: fetchError } = await supabaseAdmin
      .from("announcements")
      .select("*")
      .eq("publish_mode", "scheduled")
      .lte("scheduled_for", now)
      .is("sent_at", null);

    if (fetchError) throw fetchError;

    if (!announcements || announcements.length === 0) {
      return NextResponse.json({ ok: true, published: 0 });
    }

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("status", "active");

    if (profilesError) throw profilesError;

    let published = 0;

    for (const announcement of announcements) {
      const publishTime = new Date().toISOString();

      const { data: updatedRows, error: updateError } = await supabaseAdmin
        .from("announcements")
        .update({
          is_active: true,
          published_at: publishTime,
          sent_at: publishTime,
        })
        .eq("id", announcement.id)
        .is("sent_at", null)
        .select("id");

      if (updateError) throw updateError;

      if (!updatedRows || updatedRows.length === 0) {
        continue;
      }

      const notifications = (profiles || []).map((profile: { id: string }) => ({
        user_id: profile.id,
        type: "announcement",
        title: announcement.title,
        content: announcement.content,
        is_read: false,
        is_starred: false,
        is_important: true,
      }));

      if (notifications.length > 0) {
        const { error: notifyError } = await supabaseAdmin
          .from("notifications")
          .insert(notifications);

        if (notifyError) throw notifyError;
      }

      await supabaseAdmin.from("admin_logs").insert({
        admin_id: null,
        action: "auto_publish_due_announcement",
        target_type: "announcement",
        target_id: String(announcement.id),
        details: `进入后台时自动发布到期预约公告：${announcement.title}`,
      });

      published += 1;
    }

    return NextResponse.json({
      ok: true,
      published,
    });
  } catch (error) {
    console.error("publish due announcements error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to publish due announcements",
      },
      { status: 500 }
    );
  }
}
