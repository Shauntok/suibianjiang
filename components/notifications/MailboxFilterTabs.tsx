"use client";

import type { MailboxFilter } from "@/lib/notifications/model";

type MailboxFilterTabsProps = {
  activeFilter: MailboxFilter;
  counts: Record<MailboxFilter, number>;
  onChange: (filter: MailboxFilter) => void;
};

type FilterItem = {
  key: MailboxFilter;
  label: string;
};

const filters: FilterItem[] = [
  { key: "unread", label: "未读" },
  { key: "read", label: "已读" },
  { key: "important", label: "重要" },
  { key: "starred", label: "星标" },
  { key: "trash", label: "垃圾桶" },
];

export default function MailboxFilterTabs({
  activeFilter,
  counts,
  onChange,
}: MailboxFilterTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="信箱筛选"
      className="mb-7 flex flex-wrap gap-1 border-b border-white/[0.07] pb-3 md:mb-10"
    >
      {filters.map((item) => {
        const selected = activeFilter === item.key;
        const count = counts[item.key];

        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-label={item.label}
            aria-selected={selected}
            onClick={() => onChange(item.key)}
            className={
              selected
                ? "rounded-full bg-white/[0.09] px-4 py-2 text-sm text-white/85 outline-none transition focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/40"
                : "rounded-full px-4 py-2 text-sm text-white/35 outline-none transition hover:bg-white/[0.04] hover:text-white/65 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/35"
            }
          >
            <span data-filter-label>{item.label}</span>
            <span data-filter-count className="ml-2 text-xs opacity-55">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
