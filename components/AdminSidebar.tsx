
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Handshake } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type AdminLink = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
};

type AdminWindow = Window & { adminHasUnsavedChanges?: boolean };

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState("");

  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const [counts, setCounts] = useState({
    reports: 0,
    feedbacks: 0,
    comments: 0,
  });

  useEffect(() => {
    async function fetchAdminData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        setCurrentRole(profile?.role || "user");
      }

      const { count: reportsCount } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .neq("status", "resolved")
        .neq("status", "rejected");

      const { count: feedbacksCount } = await supabase
        .from("feedbacks")
        .select("id", { count: "exact", head: true })
        .neq("status", "resolved")
        .neq("status", "closed");

      const { count: commentsCount } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("is_hidden", false)
        .eq("is_deleted", false);

      setCounts({
        reports: reportsCount || 0,
        feedbacks: feedbacksCount || 0,
        comments: commentsCount || 0,
      });
    }

    fetchAdminData();
  }, []);

  const overviewLinks: AdminLink[] = [
    { href: "/admin/homepage", label: "控制中心", icon: "📊" },
  ];

  const communityLinks: AdminLink[] = [
    { href: "/admin/users", label: "居民管理", icon: "👥" },
    {
      href: "/admin/comments",
      label: "评论管理",
      icon: "💬",
      badge: counts.comments,
    },
    {
      href: "/admin/reports",
      label: "举报中心",
      icon: "🚩",
      badge: counts.reports,
    },
    {
      href: "/admin/feedback",
      label: "反馈中心",
      icon: "💌",
      badge: counts.feedbacks,
    },
  ];

  const contentLinks: AdminLink[] = [
    { href: "/admin/content", label: "内容管理", icon: "📚" },
    { href: "/admin/announcements", label: "世界公告", icon: "📢" },
    { href: "/admin/broadcast", label: "全站信件", icon: "📬" },
  ];

  const sponsorLinks: AdminLink[] = [
    {
      href: "/admin/sponsors",
      label: "业配中心",
      icon: <Handshake aria-hidden="true" className="h-4 w-4" />,
    },
  ];

  const growthLinks: AdminLink[] = [
    { href: "/admin/badges", label: "徽章管理", icon: "🎖️" },
    { href: "/admin/growth", label: "成长记录", icon: "✨" },
  ];

  const ownerLinks: AdminLink[] = [
    { href: "/admin/logs", label: "操作日志", icon: "📜" },
  ];

  const systemLinks: AdminLink[] = [
    { href: "/home", label: "回首页", icon: "🏠" },
  ];

  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "owner" || currentRole === "admin";
  const isModerator =
    currentRole === "owner" ||
    currentRole === "admin" ||
    currentRole === "moderator";

  function handleNavigate(
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) {
    if (!(window as AdminWindow).adminHasUnsavedChanges) {
      setMobileOpen(false);
      return;
    }

    e.preventDefault();
    setPendingHref(href);
    setShowLeaveDialog(true);
  }

  function confirmLeave() {
    if (!pendingHref) {
      setShowLeaveDialog(false);
      return;
    }

    (window as AdminWindow).adminHasUnsavedChanges = false;

    setShowLeaveDialog(false);
    setMobileOpen(false);

    router.push(pendingHref);
  }

  function isActiveLink(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  function renderBadge(badge?: number) {
    if (badge === undefined || badge <= 0) return null;

    return (
      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
        {badge > 99 ? "99+" : badge}
      </span>
    );
  }

  function renderSection(title: string, links: AdminLink[]) {
    return (
      <div className="space-y-1.5">
        <p className="px-3 pt-3 text-[10px] uppercase tracking-[0.25em] text-zinc-600">
          {title}
        </p>

        <div className="space-y-1">
          {links.map((item) => {
            const active = isActiveLink(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavigate(e, item.href)}
                className={
                  active
                    ? "group flex items-center gap-3 rounded-2xl bg-white px-2.5 py-2 font-bold text-black transition"
                    : "group flex items-center gap-3 rounded-2xl px-2.5 py-2 text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
                }
              >
                <span
                  className={
                    active
                      ? "flex h-7 w-7 items-center justify-center rounded-xl border border-black bg-black text-white"
                      : "flex h-7 w-7 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 group-hover:border-zinc-500"
                  }
                >
                  {item.icon}
                </span>

                <span className="text-[13px] font-medium">{item.label}</span>
                {renderBadge(item.badge)}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-4 z-[90] flex h-11 w-9 items-center justify-center rounded-r-2xl border border-l-0 border-zinc-800 bg-zinc-950/95 text-lg text-white shadow-xl shadow-black/40 lg:hidden"
      >
        ☰
      </button>

      {mobileOpen && (
        <button
          type="button"
          aria-label="关闭后台菜单"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[100] h-screen w-72 overflow-y-auto border-r border-zinc-800 bg-black p-4 shadow-2xl shadow-black transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between px-2">
          <p className="text-xs tracking-[0.3em] text-zinc-500">ADMIN</p>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-full border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400"
          >
            ✕
          </button>
        </div>

        <nav className="space-y-3">
          {renderSection("总览", overviewLinks)}
          {isModerator && renderSection("社区", communityLinks)}
          {isModerator && renderSection("内容", contentLinks)}
          {isAdmin && renderSection("商业合作", sponsorLinks)}
          {isAdmin && renderSection("成长", growthLinks)}
          {isOwner && renderSection("Owner", ownerLinks)}
          {renderSection("系统", systemLinks)}
        </nav>
      </aside>

      <aside className="hidden self-start lg:sticky lg:top-8 lg:block">
        <div className="w-56 rounded-3xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-2xl shadow-black/40">
          <p className="px-3 pb-3 text-xs tracking-[0.25em] text-zinc-500">
            ADMIN
          </p>

          <nav className="space-y-3">
            {renderSection("总览", overviewLinks)}
            {isModerator && renderSection("社区", communityLinks)}
            {isModerator && renderSection("内容", contentLinks)}
            {isAdmin && renderSection("商业合作", sponsorLinks)}
            {isAdmin && renderSection("成长", growthLinks)}
            {isOwner && renderSection("Owner", ownerLinks)}
            {renderSection("系统", systemLinks)}
          </nav>
        </div>
      </aside>

      <ConfirmDialog
        open={showLeaveDialog}
        title="离开这个页面？"
        description="你还有未保存的修改。离开后，这些修改可能不会被保存。"
        confirmText="离开"
        cancelText="继续编辑"
        danger
        onClose={() => setShowLeaveDialog(false)}
        onConfirm={confirmLeave}
      />
    </>
  );
}
