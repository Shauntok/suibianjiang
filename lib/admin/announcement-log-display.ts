type AnnouncementLogPresentation = {
  label: string;
  color: string;
  icon: string;
};

const announcementActions: Record<string, { label: string; icon: string }> = {
  create_announcement_now: { label: "发布公告", icon: "📣" },
  create_announcement_scheduled: { label: "预约公告", icon: "◷" },
  show_announcement: { label: "显示公告", icon: "◉" },
  hide_announcement: { label: "关闭公告", icon: "◌" },
  delete_announcement: { label: "删除公告", icon: "🗑️" },
  auto_publish_scheduled_announcement: { label: "自动发布公告", icon: "✦" },
  auto_publish_due_announcement: { label: "自动发布公告", icon: "✦" },
};

export function getAnnouncementLogPresentation(
  action: string
): AnnouncementLogPresentation | null {
  const presentation = announcementActions[action];

  if (!presentation) return null;

  return {
    ...presentation,
    color: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  };
}
