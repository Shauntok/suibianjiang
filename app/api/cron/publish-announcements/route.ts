import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET is not configured");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const received = Buffer.from(authHeader || "");
    const authorized =
      expected.length === received.length && timingSafeEqual(expected, received);

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();

    const announcementsPublished = await publishScheduledAnnouncements(now);

    let broadcastsSent = 0;
    let trashedNotificationsDeleted = 0;

    try {
      broadcastsSent = await publishScheduledBroadcasts(now);
    } catch (error) {
      console.error("scheduled broadcasts skipped:", error);
    }

    try {
      trashedNotificationsDeleted = await cleanupOldTrashedNotifications();
    } catch (error) {
      console.error("cleanup trashed notifications skipped:", error);
    }

    return NextResponse.json(
      {
        ok: true,
        announcementsPublished,
        broadcastsSent,
        trashedNotificationsDeleted,
        now,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("cron publish error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Scheduled publishing failed",
      },
      { status: 500 }
    );
  }
}

async function publishScheduledAnnouncements(now: string) {
  const { data: announcements, error: fetchError } = await supabaseAdmin
    .from("announcements")
    .select("*")
    .eq("publish_mode", "scheduled")
    .lte("scheduled_for", now)
    .is("sent_at", null);

  if (fetchError) throw fetchError;

  if (!announcements || announcements.length === 0) {
    return 0;
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("status", "active");

  if (profilesError) throw profilesError;

  let publishedCount = 0;

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
      action: "auto_publish_scheduled_announcement",
      target_type: "announcement",
      target_id: String(announcement.id),
      details: `自动发布预约公告：${announcement.title}`,
    });

    publishedCount += 1;
  }

  return publishedCount;
}

async function publishScheduledBroadcasts(now: string) {
  const { data: broadcasts, error: fetchError } = await supabaseAdmin
    .from("scheduled_broadcasts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .is("sent_at", null);

  if (fetchError) throw fetchError;

  if (!broadcasts || broadcasts.length === 0) {
    return 0;
  }

  let sentCount = 0;

  for (const broadcast of broadcasts) {
    let targetUsers: { id: string }[] = [];

    if (broadcast.target_mode === "self") {
      targetUsers = [{ id: broadcast.created_by }];
    }

    if (broadcast.target_mode === "single" && broadcast.target_user_id) {
      targetUsers = [{ id: broadcast.target_user_id }];
    }

    if (broadcast.target_mode === "all") {
      const { data: users, error: usersError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("status", "active");

      if (usersError) throw usersError;

      targetUsers = users || [];
    }

    if (targetUsers.length === 0) {
      await supabaseAdmin
        .from("scheduled_broadcasts")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
          sent_count: 0,
        })
        .eq("id", broadcast.id);

      continue;
    }

    const notifications = targetUsers.map((user) => ({
      user_id: user.id,
      title: broadcast.title,
      content: broadcast.content,
      type: broadcast.message_type,
      is_read: false,
      is_important: broadcast.is_important,
      is_starred: false,
    }));

    const { error: notifyError } = await supabaseAdmin
      .from("notifications")
      .insert(notifications);

    if (notifyError) throw notifyError;

    const sentAt = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("scheduled_broadcasts")
      .update({
        status: "sent",
        sent_at: sentAt,
        sent_count: targetUsers.length,
      })
      .eq("id", broadcast.id)
      .eq("status", "scheduled");

    if (updateError) throw updateError;

    await supabaseAdmin.from("admin_logs").insert({
      admin_id: broadcast.created_by,
      action: "auto_send_scheduled_broadcast",
      target_type: "scheduled_broadcast",
      target_id: String(broadcast.id),
      detail: `自动发送预约信件：${broadcast.title} (${targetUsers.length} users)`,
    });

    sentCount += 1;
  }

  return sentCount;
}

async function cleanupOldTrashedNotifications() {
  const cutoff = new Date(
    Date.now() - 15 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { count, error } = await supabaseAdmin
    .from("notifications")
    .delete({ count: "exact" })
    .not("deleted_at", "is", null)
    .lte("deleted_at", cutoff);

  if (error) throw error;

  return count || 0;
}
