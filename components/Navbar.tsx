"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Navbar() {
  const [profile, setProfile] = useState<any>(null);
  const [currentRole, setCurrentRole] = useState("user");
  const [menuOpen, setMenuOpen] = useState(false);
  const [worldMenuOpen, setWorldMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const navRef = useRef<HTMLDivElement>(null);

  async function fetchUnreadCount() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .is("deleted_at", null);

    setUnreadCount(count || 0);
  }

  useEffect(() => {
    async function getProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (
        data?.status_expires_at &&
        new Date(data.status_expires_at).getTime() < Date.now()
      ) {
        await supabase
          .from("profiles")
          .update({
            mood_emoji: null,
            status_message: null,
            status_expires_at: null,
          })
          .eq("id", data.id);

        data.mood_emoji = null;
        data.status_message = null;
        data.status_expires_at = null;
      }

      setProfile(data);
      setCurrentRole(data?.role || "user");
    }

    getProfile();
    fetchUnreadCount();

    const channel = supabase
      .channel("navbar-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => fetchUnreadCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setWorldMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleNotificationsUpdated() {
      fetchUnreadCount();
    }

    window.addEventListener("notifications-updated", handleNotificationsUpdated);

    return () => {
      window.removeEventListener(
        "notifications-updated",
        handleNotificationsUpdated
      );
    };
  }, []);

  const profileHref = profile?.username
    ? `/u/${encodeURIComponent(profile.username)}`
    : "/settings/profile";

  function closeMenus() {
    setMenuOpen(false);
    setWorldMenuOpen(false);
  }

  return (
    
    <header className="sticky top-0 z-50 overflow-visible bg-transparent px-4 py-3 md:px-6 md:py-4">
      <div
        ref={navRef}
        className="
          relative mx-auto flex max-w-6xl items-center justify-between
          overflow-visible
          rounded-full border border-white/10 bg-white/[0.045]
          px-4 py-2.5 shadow-[0_0_60px_rgba(255,255,255,0.035)]
          backdrop-blur-2xl md:px-6 md:py-3
        "
      >
        <div className="relative">
          {/* Mobile：小时代 ▼ */}
          <button
            type="button"
            onClick={() => {
              setWorldMenuOpen(!worldMenuOpen);
              setMenuOpen(false);
            }}
            className="
              flex items-center gap-2 rounded-full
              border border-white/10 bg-white/[0.035]
              px-4 py-2 text-sm font-semibold
              tracking-wide text-white/85
              transition hover:border-white/20 hover:bg-white/[0.06]
              md:hidden
            "
          >
            小时代
            <span
              className={`text-xs text-white/45 transition ${
                worldMenuOpen ? "rotate-180" : ""
              }`}
            >
              ▼
            </span>
          </button>

          {/* Desktop：原本 Logo */}
          <Link
            href="/home"
            className="
              hidden text-sm font-semibold tracking-wide
              text-white/85 transition hover:text-white
              md:inline-flex
            "
          >
            小时代
          </Link>

          {worldMenuOpen && (
              <div className="fixed left-4 top-[76px] z-[100] w-64 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/50 backdrop-blur-2xl md:hidden">              <div className="border-b border-white/10 px-5 py-4">
                <p className="text-xs tracking-[0.3em] text-white/25">
                  OUR LITTLE AGE
                </p>
                <p className="mt-2 text-sm text-white/55">
                  去你想去的地方。
                </p>
              </div>

              <div className="py-2">
                <Link href="/home" onClick={closeMenus} className="flex items-center gap-3 px-5 py-4 text-sm text-white/70 transition hover:bg-white/[0.05] hover:text-white">
                  <span>🏠</span>
                  <span>首页</span>
                </Link>

                <Link href="/space" onClick={closeMenus} className="flex items-center gap-3 px-5 py-4 text-sm text-white/70 transition hover:bg-white/[0.05] hover:text-white">
                  <span>🌙</span>
                  <span>深夜广场</span>
                </Link>

                <div className="my-1 border-t border-white/10" />

                <Link href="/diary" onClick={closeMenus} className="flex items-center gap-3 px-5 py-4 text-sm text-white/70 transition hover:bg-white/[0.05] hover:text-white">
                  <span>📔</span>
                  <span>我的日记</span>
                </Link>

                <Link href="/articles" onClick={closeMenus} className="flex items-center gap-3 px-5 py-4 text-sm text-white/70 transition hover:bg-white/[0.05] hover:text-white">
                  <span>📝</span>
                  <span>我的文章</span>
                </Link>

                <Link href="/drafts" onClick={closeMenus} className="flex items-center gap-3 px-5 py-4 text-sm text-white/70 transition hover:bg-white/[0.05] hover:text-white">
                  <span>📦</span>
                  <span>草稿箱</span>
                </Link>

                <div className="my-1 border-t border-white/10" />

                <Link href="/diary/new" onClick={closeMenus} className="flex items-center gap-3 px-5 py-4 text-sm text-white/70 transition hover:bg-white/[0.05] hover:text-white">
                  <span>✍️</span>
                  <span>写日记</span>
                </Link>

                <Link href="/articles/new" onClick={closeMenus} className="flex items-center gap-3 px-5 py-4 text-sm text-white/70 transition hover:bg-white/[0.05] hover:text-white">
                  <span>📖</span>
                  <span>写文章</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        <nav className="hidden items-center gap-7 text-sm text-white/45 md:flex">
          <Link href="/home" className="transition hover:text-white">
            首页
          </Link>

          <Link href="/space" className="transition hover:text-white">
            广场
          </Link>

          <Link href="/diary" className="transition hover:text-white">
            日记
          </Link>

          <Link href="/articles" className="transition hover:text-white">
            文章
          </Link>

          {profile && (
            <Link href={profileHref} className="transition hover:text-white">
              我的房间
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {profile ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(!menuOpen);
                  setWorldMenuOpen(false);
                }}
                className="relative flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] p-1 transition hover:border-white/25 hover:bg-white/[0.08] md:pr-3"
              >
                <div className="h-9 w-9 overflow-hidden rounded-full border border-white/10 bg-white/[0.05] shadow-[0_0_24px_rgba(255,255,255,0.08)] md:h-10 md:w-10">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.username || "居民"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm">
                      🌙
                    </div>
                  )}
                </div>

                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-[0_0_14px_rgba(239,68,68,0.75)]">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}

                <span className="hidden max-w-[120px] truncate text-xs text-white/45 lg:inline">
                  {profile.username || "居民"}
                </span>
              </button>

              {menuOpen && (
                <div className="fixed right-4 top-[76px] z-[100] max-h-[calc(100vh-112px)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden rounded-3xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/50 backdrop-blur-2xl md:right-8 md:top-[96px]">
                  <div className="border-b border-white/10 px-5 py-5">
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/[0.05]">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.username || "居民"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl">
                            🌙
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold text-white">
                          {profile.username || "居民"}
                        </p>

                        {(profile.status_message || profile.mood_emoji) && (
                          <div className="mt-1 flex items-center gap-2 text-sm text-white/40">
                            <span>{profile.mood_emoji || "🌙"}</span>
                            <span className="truncate">
                              {profile.status_message || "还在小时代"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="py-2">
                    <Link
                      href={profileHref}
                      onClick={closeMenus}
                      className="flex items-center gap-3 px-5 py-4 text-white/70 transition hover:bg-white/[0.05] hover:text-white"
                    >
                      <span>🏠</span>
                      <span>我的房间</span>
                    </Link>

                    <Link
                      href="/notifications"
                      onClick={closeMenus}
                      className="flex items-center gap-3 px-5 py-4 text-white/70 transition hover:bg-white/[0.05] hover:text-white"
                    >
                      <span>📬</span>
                      <span className="flex-1">信箱与互动</span>

                      {unreadCount > 0 && (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </Link>

                    <Link
                      href="/drafts"
                      onClick={closeMenus}
                      className="hidden items-center gap-3 px-5 py-4 text-white/70 transition hover:bg-white/[0.05] hover:text-white md:flex"
                    >
                      <span>📦</span>
                      <span>草稿箱</span>
                    </Link>

                    <Link
                      href="/settings/profile"
                      onClick={closeMenus}
                      className="flex items-center gap-3 px-5 py-4 text-white/70 transition hover:bg-white/[0.05] hover:text-white"
                    >
                      <span>⚙️</span>
                      <span>房间设置</span>
                    </Link>

                    <Link
                      href="/feedback"
                      onClick={closeMenus}
                      className="flex items-center gap-3 px-5 py-4 text-white/70 transition hover:bg-white/[0.05] hover:text-white"
                    >
                      <span>💌</span>
                      <span>意见反馈</span>
                    </Link>
                  </div>

                  {["owner", "admin", "moderator"].includes(currentRole) && (
                    <div className="border-t border-white/10 py-2">
                      <Link
                        href="/admin"
                        onClick={closeMenus}
                        className="flex items-center gap-3 px-5 py-4 text-violet-300 transition hover:bg-white/[0.05]"
                      >
                        <span>🛠</span>
                        <span>后台管理</span>
                      </Link>
                    </div>
                  )}

                  <div className="border-t border-white/10 py-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await supabase.auth.signOut();
                        window.location.href = "/";
                      }}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left text-red-300 transition hover:bg-white/[0.05]"
                    >
                      <span>🚪</span>
                      <span>登出</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/"
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-white/25 hover:text-white"
            >
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
