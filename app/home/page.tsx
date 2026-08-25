"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getHomeAtmosphere } from "@/lib/getHomeAtmosphere";
import { getNightBroadcast } from "@/lib/getNightBroadcast";
import FloatingParticles from "@/components/FloatingParticles";
import PageTransition from "@/components/PageTransition";
import MouseGlow from "@/components/MouseGlow";
import RoomStatusButton from "@/components/RoomStatusButton";

export default function HomePage() {
  const router = useRouter();
  const atmosphere = getHomeAtmosphere();

  const [onlineCount, setOnlineCount] = useState(0);
  const [onlineResidents, setOnlineResidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentUserId, setCurrentUserId] = useState("");
  const [displayName, setDisplayName] = useState("居民");

  const [latestDiary, setLatestDiary] = useState("今晚还没有新的痕迹。");
  const [latestArticle, setLatestArticle] = useState("还没有新的故事。");

  const [latestDiaryId, setLatestDiaryId] = useState<number | null>(null);
  const [latestArticleSlug, setLatestArticleSlug] = useState<string | null>(
    null
  );

  const [nightBroadcast, setNightBroadcast] = useState(
    "今晚似乎有很多人睡不着。"
  );
  const [announcement, setAnnouncement] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const [moodEmoji, setMoodEmoji] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    async function checkUser() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/");
        return;
      }

      setCurrentUserId(data.user.id);

      const fiveMinutesAgo = new Date(
        Date.now() - 5 * 60 * 1000
      ).toISOString();

      const { count: onlineResidentsCount } = await supabase
        .from("profiles")
        .select("id", {
          count: "exact",
          head: true,
        })
        .gte("last_seen_at", fiveMinutesAgo);

      setOnlineCount(onlineResidentsCount || 0);

      const { data: onlineProfiles } = await supabase
        .from("profiles")
        .select(
          "id, username, avatar_url, mood_emoji, status_message, last_seen_at"
        )
        .gte("last_seen_at", fiveMinutesAgo)
        .order("last_seen_at", { ascending: false })
        .limit(6);

      setOnlineResidents(onlineProfiles || []);

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, mood_emoji, status_message")
        .eq("id", data.user.id)
        .single();

      const finalDisplayName =
        profile?.username || data.user.email?.split("@")[0] || "居民";

      setDisplayName(finalDisplayName);
      setMoodEmoji(profile?.mood_emoji || "");
      setStatusMessage(profile?.status_message || "");

      const { count: unreadTotal } = await supabase
        .from("notifications")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("user_id", data.user.id)
        .eq("is_read", false)
        .is("deleted_at", null);

      setUnreadCount(unreadTotal || 0);

      const { data: activeAnnouncement } = await supabase
        .from("announcements")
        .select("*")
        .eq("is_active", true)
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setAnnouncement(activeAnnouncement || null);

      const { data: latestDiaryPost } = await supabase
        .from("posts")
        .select("id, content")
        .eq("type", "diary")
        .eq("visibility", "public")
        .eq("status", "published")
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestDiaryPost?.content) {
        setLatestDiary(latestDiaryPost.content.slice(0, 28));
        setLatestDiaryId(latestDiaryPost.id);
      }

      const { data: latestArticlePost } = await supabase
        .from("posts")
        .select("id, slug, title")
        .eq("type", "article")
        .eq("visibility", "public")
        .eq("status", "published")
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestArticlePost?.title) {
        setLatestArticle(latestArticlePost.title);
        setLatestArticleSlug(latestArticlePost.slug);
      }

      const broadcasts: string[] = [];

      if (latestArticlePost?.title) {
        broadcasts.push(`有人刚刚写下了《${latestArticlePost.title}》。`);
      }

      if (latestDiaryPost?.content) {
        broadcasts.push("有人刚刚留下了一篇新的日记。");
      }

      setNightBroadcast(
        broadcasts.length > 0
          ? broadcasts[Math.floor(Math.random() * broadcasts.length)]
          : getNightBroadcast(onlineResidentsCount || 0)
      );

      setLoading(false);
    }

    checkUser();
  }, [router]);

  if (loading) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black text-white">
        <FloatingParticles />
        <p className="relative z-10 text-sm tracking-[0.3em] text-white/35">
          正在回到你的房间...
        </p>
      </main>
    );
  }

  const profileHref =
    displayName && displayName !== "居民"
      ? `/u/${encodeURIComponent(displayName)}`
      : "/settings/profile";

  const quickCards = [
    {
      icon: "📬",
      title: "信箱与互动",
      desc:
        unreadCount > 0
          ? `你有 ${unreadCount} 条未读回声。`
          : "今晚暂无新的回声。",
      href: "/notifications",
    },
    {
      icon: "🌙",
      title: "深夜广场",
      desc: "看看别人留下的光。",
      href: "/space",
    },
    {
      icon: "🏠",
      title: "我的房间",
      desc: "回到自己的角落。",
      href: profileHref,
    },
  ];

  const lifeCards = [
    {
      label: "深夜灯火",
      title: `🌙 ${onlineCount} 位居民还醒着`,
      desc: "有人正在房间里，慢慢留下今天。",
      href: "/space",
    },
    {
      label: "最新故事",
      title: "📝 " + latestArticle,
      desc: "有人刚刚留下了一篇新的故事。",
      href: latestArticleSlug
        ? `/articles/${latestArticleSlug}`
        : "/space/articles",
    },
    {
      label: "今晚动态",
      title: "🌙 " + latestDiary,
      desc: "有人刚刚留下了新的日记。",
      href: latestDiaryId ? `/diary/${latestDiaryId}` : "/space/diaries",
    },
  ];

  return (
    <PageTransition>
      <main className="relative min-h-screen overflow-x-hidden bg-black text-white">
        <div className="hidden md:block">
          <MouseGlow />
        </div>
        <FloatingParticles />

        <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black via-zinc-950 to-black" />

        <div
          className={`
            fixed left-1/2 top-1/3 -z-10
            h-[420px] w-[420px]
            -translate-x-1/2 rounded-full
            ${atmosphere.glow}
            blur-3xl
            md:h-[520px] md:w-[520px]
          `}
        />

        <section className="relative z-10 flex min-h-[560px] items-start justify-center px-5 pb-8 pt-20 md:min-h-screen md:px-6 md:pb-20 md:pt-32">
          <div className="mx-auto max-w-5xl min-w-0 text-center">
            <div className="safe-pre mx-auto mb-4 inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-xs text-violet-100 backdrop-blur-xl md:mb-8 md:gap-3 md:px-5 md:py-3 md:text-sm">
              <span className="shrink-0 animate-pulse">🌙</span>
              <span className="safe-pre line-clamp-1">{nightBroadcast}</span>
            </div>

            <p className="mb-3 text-xs tracking-[0.45em] text-white/25 md:mb-5">
              RESIDENT HOME
            </p>

            <h1 className="safe-text text-4xl font-light leading-tight tracking-tight md:text-7xl">
              欢迎回来，{displayName}.
            </h1>

            <h2 className="safe-text mt-4 text-xl font-light text-white/75 md:mt-6 md:text-2xl">
              {atmosphere.heroTitle}
            </h2>

            <p className="safe-pre mx-auto mt-3 max-w-xl line-clamp-2 text-sm leading-7 text-white/45 md:mt-8 md:line-clamp-none">
              {atmosphere.heroText}
            </p>

            <p className="safe-pre mt-6 hidden text-sm italic text-white/25 md:block">
              “{atmosphere.quote}”
            </p>

            {announcement && (
              <div className="mx-auto mt-6 max-w-2xl min-w-0 overflow-hidden rounded-[1.5rem] border border-fuchsia-400/20 bg-fuchsia-500/[0.07] p-4 text-left shadow-[0_0_70px_rgba(217,70,239,0.09)] backdrop-blur-2xl md:mt-10 md:rounded-[2rem] md:p-6">
                <p className="text-xs tracking-[0.25em] text-fuchsia-100/45 md:tracking-[0.35em]">
                  WORLD ANNOUNCEMENT
                </p>

                <h3 className="safe-text mt-3 text-xl font-light text-white md:mt-4 md:text-2xl">
                  📢 {announcement.title}
                </h3>

                <p className="safe-pre mt-2 line-clamp-2 text-sm leading-7 text-white/55 md:mt-4 md:line-clamp-none md:leading-8">
                  {announcement.content}
                </p>

                <Link
                  href="/announcements"
                  className="mt-4 inline-flex text-sm text-fuchsia-100/60 transition hover:text-fuchsia-100"
                >
                  查看全部公告 →
                </Link>
              </div>
            )}

            <div className="mt-6 flex flex-col items-stretch justify-center gap-3 md:mt-12 md:flex-row md:items-center md:gap-4">
              <button
                onClick={() => router.push("/diary/new")}
                className="w-full rounded-full bg-white px-8 py-4 text-sm font-semibold text-black transition hover:bg-white/90 md:w-auto"
              >
                ✍️ 写日记
              </button>

              <button
                onClick={() => router.push("/articles/new")}
                className="w-full rounded-full border border-white/10 bg-white/[0.035] px-6 py-3 text-sm text-white/55 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white/80 md:w-auto md:px-8 md:py-4 md:text-white/70"
              >
                📖 写文章
              </button>
            </div>
          </div>
        </section>

        <section className="relative z-10 px-5 pb-12 pt-0 md:px-6 md:pb-16 md:pt-4">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
            {quickCards.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="min-w-0 overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-2xl shadow-[0_0_50px_rgba(255,255,255,0.04)] transition-all duration-700 ease-out hover:-translate-y-2 hover:scale-[1.015] hover:border-white/20 hover:bg-white/[0.055] hover:shadow-[0_0_80px_rgba(255,255,255,0.06)] md:rounded-[2rem] md:p-6"
              >
                <div className="mb-6 text-2xl md:mb-8 md:text-3xl">
                  {item.icon}
                </div>

                <h2 className="safe-text text-base font-light text-white/85 md:text-lg">
                  {item.title}
                </h2>

                <p className="safe-pre mt-3 text-xs leading-6 text-white/35 md:mt-4 md:text-sm">
                  {item.desc}
                </p>
              </Link>
            ))}

            <RoomStatusButton
              ownerId={currentUserId}
              initialMoodEmoji={moodEmoji}
              initialStatusMessage={statusMessage}
              variant="card"
              onStatusChange={(nextEmoji, nextMessage) => {
                setMoodEmoji(nextEmoji);
                setStatusMessage(nextMessage);
              }}
            />
          </div>
        </section>

        <section className="relative z-10 px-5 pb-12 md:px-6 md:pb-16">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
            {lifeCards.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="min-w-0 overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-2xl shadow-[0_0_50px_rgba(255,255,255,0.04)] transition-all duration-700 ease-out hover:-translate-y-2 hover:scale-[1.015] hover:border-white/20 hover:bg-white/[0.055] hover:shadow-[0_0_80px_rgba(255,255,255,0.06)] md:rounded-[2rem] md:p-6"
              >
                <p className="safe-text text-xs tracking-[0.3em] text-white/30">
                  {item.label}
                </p>

                <h3 className="safe-text mt-4 line-clamp-2 break-all text-xl font-light md:text-2xl">
                  {item.title}
                </h3>

                <p className="safe-pre mt-3 text-sm leading-7 text-white/45 md:mt-4">
                  {item.desc}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {onlineResidents.length > 0 && (
          <section className="relative z-10 px-5 pb-24 md:px-6 md:pb-32">
            <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl shadow-[0_0_70px_rgba(255,255,255,0.035)] md:rounded-[2.5rem] md:p-8">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center md:gap-6">
                <div className="min-w-0">
                  <p className="text-xs tracking-[0.35em] text-white/25">
                    AWAKE RESIDENTS
                  </p>

                  <h2 className="safe-text mt-4 text-2xl font-light md:text-3xl">
                    深夜还亮着灯的房间
                  </h2>

                  <p className="safe-pre mt-3 max-w-xl text-sm leading-7 text-white/35 md:mt-4">
                    有些居民还没有睡，正在这个世界里慢慢经过。
                  </p>
                </div>

                <Link
                  href="/space"
                  className="shrink-0 text-sm text-white/35 transition hover:text-white/70"
                >
                  去广场看看 →
                </Link>
              </div>

              <div className="mt-7 flex flex-wrap gap-3 md:mt-8 md:gap-4">
                {onlineResidents.map((resident) => {
                  const href = resident.username
                    ? `/u/${encodeURIComponent(resident.username)}`
                    : "/space";

                  return (
                    <Link
                      key={resident.id}
                      href={href}
                      className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 transition-all duration-500 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.055] md:gap-4 md:px-5 md:py-4"
                    >
                      <div className="relative shrink-0">
                        <div className="h-11 w-11 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] md:h-12 md:w-12">
                          {resident.avatar_url ? (
                            <img
                              src={resident.avatar_url}
                              alt={resident.username || "居民"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-lg">
                              🌙
                            </div>
                          )}
                        </div>

                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border border-black bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
                      </div>

                      <div className="min-w-0">
                        <p className="safe-text truncate text-sm text-white/75">
                          {resident.username || "无名居民"}
                        </p>

                        <p className="safe-text mt-1 truncate text-xs text-white/35">
                          {resident.mood_emoji
                            ? `${resident.mood_emoji} ${
                                resident.status_message || "还醒着"
                              }`
                            : "还醒着"}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>
    </PageTransition>
  );
}
