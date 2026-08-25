"use client";

import {
  Check,
  RotateCcw,
  Siren,
  Star,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

type MailboxNotificationActionsProps = {
  notificationId: string;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  isDeleted: boolean;
  onStar: () => void;
  onImportant: () => void;
  onRead: () => void;
  onDelete: () => void;
  onRestore: () => void;
};

type ActionButtonProps = {
  id: string;
  label: string;
  mobileLabel?: string;
  icon: ReactNode;
  className: string;
  onClick: () => void;
};

const baseButtonClass =
  "group relative inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-full border px-3 text-sm outline-none transition md:h-9 md:w-9 md:min-w-9 md:px-0 focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

function ActionButton({
  id,
  label,
  mobileLabel = label,
  icon,
  className,
  onClick,
}: ActionButtonProps) {
  const tooltipId = `${id}-tooltip`;

  return (
    <button
      type="button"
      aria-label={label}
      aria-describedby={tooltipId}
      onClick={onClick}
      className={`${baseButtonClass} ${className}`}
    >
      {icon}
      <span data-mobile-label className="md:hidden">
        {mobileLabel}
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        aria-label={label}
        className="pointer-events-none absolute -top-10 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-xs font-normal text-white/75 opacity-0 shadow-xl transition md:block md:group-hover:opacity-100 md:group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}

export default function MailboxNotificationActions({
  notificationId,
  isRead,
  isStarred,
  isImportant,
  isDeleted,
  onStar,
  onImportant,
  onRead,
  onDelete,
  onRestore,
}: MailboxNotificationActionsProps) {
  if (isDeleted) {
    return (
      <ActionButton
        id={`${notificationId}-restore`}
        label="恢复"
        icon={<RotateCcw aria-hidden="true" size={16} strokeWidth={1.8} />}
        className="border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100/65 hover:bg-emerald-400/[0.12] hover:text-emerald-100"
        onClick={onRestore}
      />
    );
  }

  return (
    <>
      <ActionButton
        id={`${notificationId}-star`}
        label="星标"
        mobileLabel={isStarred ? "已星标" : "星标"}
        icon={
          <Star
            aria-hidden="true"
            size={16}
            strokeWidth={1.8}
            fill={isStarred ? "currentColor" : "none"}
          />
        }
        className={
          isStarred
            ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100/75 hover:bg-amber-300/[0.13]"
            : "border-white/10 bg-black/30 text-white/35 hover:border-white/20 hover:text-white/75"
        }
        onClick={onStar}
      />
      <ActionButton
        id={`${notificationId}-important`}
        label="重要"
        icon={
          <Siren
            aria-hidden="true"
            size={16}
            strokeWidth={1.8}
            fill={isImportant ? "currentColor" : "none"}
          />
        }
        className={
          isImportant
            ? "border-rose-300/25 bg-rose-300/[0.08] text-rose-100/75 hover:bg-rose-300/[0.13]"
            : "border-white/10 bg-black/30 text-white/35 hover:border-white/20 hover:text-white/75"
        }
        onClick={onImportant}
      />
      {!isRead && (
        <ActionButton
          id={`${notificationId}-read`}
          label="标记为已读"
          mobileLabel="已读"
          icon={<Check aria-hidden="true" size={17} strokeWidth={1.8} />}
          className="border-white/10 bg-black/30 text-white/35 hover:border-white/20 hover:text-white/75"
          onClick={onRead}
        />
      )}
      <ActionButton
        id={`${notificationId}-delete`}
        label="删除"
        icon={<Trash2 aria-hidden="true" size={16} strokeWidth={1.8} />}
        className="border-red-400/15 bg-red-400/[0.045] text-red-200/55 hover:border-red-300/25 hover:bg-red-400/[0.1] hover:text-red-100/80"
        onClick={onDelete}
      />
    </>
  );
}
