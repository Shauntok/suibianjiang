"use client";

import type { NotificationSection } from "@/lib/notifications/model";

type NotificationSectionTabsProps = {
  section: NotificationSection;
  mailboxUnread: number;
  interactionUnread: number;
  onChange: (section: NotificationSection) => void;
};

const sections = [
  { key: "mailbox", label: "信箱" },
  { key: "interactions", label: "互动" },
] as const;

export default function NotificationSectionTabs({
  section,
  mailboxUnread,
  interactionUnread,
  onChange,
}: NotificationSectionTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="通知区域"
      className="mb-8 flex min-h-13 items-end gap-2 border-b border-white/[0.08] md:mb-10"
    >
      {sections.map((item) => {
        const selected = section === item.key;
        const unread = item.key === "mailbox" ? mailboxUnread : interactionUnread;

        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.key)}
            className={
              selected
                ? "relative mb-[-1px] inline-flex h-12 min-w-24 items-center justify-center gap-2 rounded-md border border-white/70 bg-white/[0.025] px-3 text-base font-semibold text-white outline-none transition focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/35"
                : "relative mb-[-1px] inline-flex h-12 min-w-24 items-center justify-center gap-2 rounded-md border border-transparent bg-transparent px-3 text-base font-semibold text-white/32 outline-none transition hover:bg-white/[0.025] hover:text-white/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/35"
            }
          >
            <span>{item.label}</span>
            {unread > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.09] px-1.5 text-[11px] font-medium text-white/58">
                {unread}
              </span>
            )}
            {selected && (
              <span className="absolute bottom-[-1px] left-3 right-3 h-px bg-white/85" />
            )}
          </button>
        );
      })}
    </div>
  );
}
