"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import UserRoomClient from "@/components/UserRoomClient";

function getResidentTitle(level: number) {
  if (level >= 50) return "小时代长老";
  if (level >= 20) return "资深居民";
  if (level >= 10) return "深夜居民";
  if (level >= 5) return "常驻居民";
  return "新住民";
}

function getJoinedDays(joinedAt: string) {
  const joinedTime = new Date(joinedAt).getTime();
  const diffDays = Math.floor(
    (Date.now() - joinedTime) / (1000 * 60 * 60 * 24)
  );

  return Math.max(diffDays, 0);
}

function getLevelProgress(exp: number) {
  const total = Number(exp || 0);

  if (total >= 10) {
    return {
      level: 5,
      current: 0,
      percent: 100,
      text: "Lv5 已满阶",
    };
  }

  if (total >= 6) {
    return {
      level: 4,
      current: Number((total - 6).toFixed(2)),
      percent: ((total - 6) / 4) * 100,
      text: `Lv4 · ${Number(total - 6).toFixed(2)} / 4.00 光`,
    };
  }

  if (total >= 3) {
    return {
      level: 3,
      current: Number((total - 3).toFixed(2)),
      percent: ((total - 3) / 3) * 100,
      text: `Lv3 · ${Number(total - 3).toFixed(2)} / 3.00 光`,
    };
  }

  if (total >= 1) {
    return {
      level: 2,
      current: Number((total - 1).toFixed(2)),
      percent: ((total - 1) / 2) * 100,
      text: `Lv2 · ${Number(total - 1).toFixed(2)} / 2.00 光`,
    };
  }

  return {
    level: 1,
    current: Number(total.toFixed(2)),
    percent: total * 100,
    text: `Lv1 · ${total.toFixed(2)} / 1.00 光`,
  };
}

function getRoomTheme(theme: string | null) {
  return theme === "ocean"
    ? "from-blue-950 via-slate-950 to-black"
    : theme === "forest"
      ? "from-emerald-950 via-green-950 to-black"
      : theme === "sunset"
        ? "from-orange-950 via-amber-950 to-black"
        : theme === "mist"
          ? "from-zinc-700 via-zinc-800 to-black"
          : "from-black via-zinc-950 to-black";
}

export default function UserRoomLoader({
  username,
  activeTab,
}: {
  username: string;
  activeTab: "all" | "diary" | "article";
}) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [payload, setPayload] = useState<any>(null);

  useEffect(() => {
    fetchRoom();
  }, [username]);

  async function fetchRoom() {
    setLoading(true);
    setNotFound(false);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id,username,avatar_url,created_at,bio,role,banner_url,level,exp,trust_score,show_level,show_exp,show_trust_score,joined_at,show_joined_days,status,status_message,mood_emoji,status_expires_at,last_seen_at,banner_position,theme,show_badges"
      )
      .eq("username", username)
      .maybeSingle();

    if (profileError) {
      console.error("fetch profile error:", profileError);
      setNotFound(true);
      setLoading(false);
      return;
    }

    if (!profile) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const residentTitle = getResidentTitle(profile.level || 1);
    const levelProgress = getLevelProgress(Number(profile.exp || 0));
    const joinedDays = getJoinedDays(profile.joined_at || profile.created_at);

    const isStatusExpired =
      !profile.status_expires_at ||
      new Date(profile.status_expires_at).getTime() < Date.now();

    const [badgesResult, postsResult] = await Promise.all([
      supabase
        .from("user_badges")
        .select(
          `
          id,
          created_at,
          badges (
            id,
            name,
            color,
            description
          )
        `
        )
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("posts")
        .select(
            "id,title,slug,content,type,published_at,created_at,author_id,status,visibility"
        )
        .eq("author_id", profile.id)
        .eq("status", "published")
        .eq("visibility", "public")
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(12),
    ]);

    const userBadges = badgesResult.data || [];
    const publicPosts = postsResult.data || [];

    const visibleBadges = profile.show_badges === false ? [] : userBadges;
    const publicDiaries = publicPosts.filter((post: any) => post.type === "diary");
    const publicArticles = publicPosts.filter(
      (post: any) => post.type === "article"
    );

    const postIds = publicPosts.map((post: any) => post.id);

    const [likesResult, commentsResult] = await Promise.all([
      postIds.length > 0
        ? supabase
            .from("post_likes")
            .select("post_id")
            .in("post_id", postIds)
            .eq("is_active", true)
        : Promise.resolve({ data: [] as any[] }),

      postIds.length > 0
        ? supabase
            .from("comments")
            .select("post_id")
            .in("post_id", postIds)
            .eq("is_deleted", false)
            .eq("is_hidden", false)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const likesData = likesResult.data || [];
    const commentsData = commentsResult.data || [];

    const likeCountMap = new Map<number, number>();
    const commentCountMap = new Map<number, number>();

    likesData.forEach((like: any) => {
      likeCountMap.set(
        like.post_id,
        (likeCountMap.get(like.post_id) || 0) + 1
      );
    });

    commentsData.forEach((comment: any) => {
      commentCountMap.set(
        comment.post_id,
        (commentCountMap.get(comment.post_id) || 0) + 1
      );
    });

    setPayload({
      profile,
      activeTab,
      residentTitle,
      levelProgress,
      joinedDays,
      isStatusExpired,
      visibleBadges,
      publicPosts,
      publicDiaries,
      publicArticles,
      likeCountMapData: Array.from(likeCountMap.entries()),
      commentCountMapData: Array.from(commentCountMap.entries()),
      roomTheme: getRoomTheme(profile.theme),
    });

    setLoading(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black px-5 pt-16 text-white md:px-6 md:py-24">
        <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black via-zinc-950 to-black" />
        <div className="mx-auto max-w-6xl space-y-6">
          <Link
            href="/space"
            className="inline-flex text-sm text-white/35 transition hover:text-white/70"
          >
            ← 回到深夜广场
          </Link>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 backdrop-blur-2xl md:rounded-[2.8rem] md:p-12">
            <div className="h-24 w-24 animate-pulse rounded-full bg-white/10" />
            <div className="mt-8 h-8 w-48 animate-pulse rounded-full bg-white/10" />
            <div className="mt-4 h-4 w-72 max-w-full animate-pulse rounded-full bg-white/10" />
            <p className="mt-8 text-sm text-white/35">正在走进这个房间...</p>
          </section>
        </div>
      </main>
    );
  }

  if (notFound || !payload) {
    return (
      <main className="min-h-screen bg-black px-5 pt-16 text-white md:px-6 md:py-24">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link
            href="/space"
            className="inline-flex text-sm text-white/35 transition hover:text-white/70"
          >
            ← 回到深夜广场
          </Link>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-8">
            <h1 className="text-2xl font-light">找不到这个房间</h1>
            <p className="mt-3 text-sm text-white/40">
              这个居民可能还没有创建资料，或者房间地址已经改变。
            </p>
          </section>
        </div>
      </main>
    );
  }

  return <UserRoomClient {...payload} />;
}
