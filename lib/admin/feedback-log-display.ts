type FeedbackLogPresentation = {
  label: string;
  color: string;
  icon: string;
  details: string;
};

const feedbackStatusPresentation = {
  in_progress: {
    label: "反馈处理中",
    color: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    icon: "⏳",
    statusLabel: "处理中",
  },
  resolved: {
    label: "反馈已完成",
    color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: "✓",
    statusLabel: "已完成",
  },
  closed: {
    label: "反馈已关闭",
    color: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    icon: "✕",
    statusLabel: "已关闭",
  },
} as const;

export function getFeedbackLogPresentation(
  action: string,
  rawDetails: string | null | undefined
): FeedbackLogPresentation | null {
  if (action !== "update_feedback_status_and_notify") return null;

  const details = rawDetails?.trim() || "已更新反馈状态，并向居民发送通知。";
  const status = details.match(/\b(in_progress|resolved|closed)\b/)?.[1] as
    | keyof typeof feedbackStatusPresentation
    | undefined;

  if (!status) {
    return {
      label: "更新反馈状态",
      color: "bg-violet-500/15 text-violet-300 border-violet-500/30",
      icon: "💌",
      details,
    };
  }

  const presentation = feedbackStatusPresentation[status];

  return {
    label: presentation.label,
    color: presentation.color,
    icon: presentation.icon,
    details: `已将反馈设为「${presentation.statusLabel}」，并向居民发送通知。`,
  };
}
