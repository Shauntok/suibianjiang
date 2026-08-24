"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function PrivacySwitch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={`h-[52px] w-[150px] rounded-2xl border text-sm font-bold transition-all duration-300 ${
        disabled
          ? "cursor-not-allowed border-zinc-900 bg-black/20 text-zinc-700"
          : checked
            ? "border-violet-400 bg-violet-500 text-white shadow-lg shadow-violet-500/40"
            : "border-zinc-800 bg-black/40 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

export default function AdminProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [showLevel, setShowLevel] = useState(true);
  const [showExp, setShowExp] = useState(true);
  const [showTrustScore, setShowTrustScore] = useState(true);
  const [showJoinedDays, setShowJoinedDays] = useState(true);

  const [moodEmoji, setMoodEmoji] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  const [message, setMessage] = useState("");

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile(profile);

      setUsername(profile?.username || "");
      setBio(profile?.bio || "");
      setMoodEmoji(profile?.mood_emoji || "");
      setStatusMessage(profile?.status_message || "");

      setShowLevel(profile?.show_level ?? true);
      setShowExp(profile?.show_exp ?? true);
      setShowTrustScore(profile?.show_trust_score ?? true);
      setShowJoinedDays(profile?.show_joined_days ?? true);
    }

    getUser();
  }, []);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;

      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    (window as any).adminHasUnsavedChanges = hasUnsavedChanges;

    return () => {
      (window as any).adminHasUnsavedChanges = false;
    };
  }, [hasUnsavedChanges]);

  function showToast(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 3500);
  }

  function markChanged() {
    setHasUnsavedChanges(true);
  }

  async function saveProfile() {
    if (!user) return;

    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        username,
        bio,
        show_level: showLevel,
        show_exp: showExp,
        show_trust_score: showTrustScore,
        show_joined_days: showJoinedDays,
      })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      showToast(error.message);
      return;
    }

    setHasUnsavedChanges(false);
    showToast("资料已更新 🔥");
  }

  async function saveMoodStatus() {
    if (!user) return;

    if (!moodEmoji && !statusMessage.trim()) {
      showToast("请先选择心情或写一句状态。");
      return;
    }

    setStatusSaving(true);

    const expiresAt = new Date(
      Date.now() + 18 * 60 * 60 * 1000
    ).toISOString();

    const { error } = await supabase
      .from("profiles")
      .update({
        mood_emoji: moodEmoji || null,
        status_message: statusMessage.trim() || null,
        status_expires_at: expiresAt,
      })
      .eq("id", user.id);

    setStatusSaving(false);

    if (error) {
      showToast(error.message);
      return;
    }

    setProfile((current: any) => ({
      ...current,
      mood_emoji: moodEmoji || null,
      status_message: statusMessage.trim() || null,
      status_expires_at: expiresAt,
    }));

    showToast("今日状态已更新 🌙");
  }

  async function clearMoodStatus() {
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        mood_emoji: null,
        status_message: null,
        status_expires_at: null,
      })
      .eq("id", user.id);

    if (error) {
      showToast(error.message);
      return;
    }

    setMoodEmoji("");
    setStatusMessage("");

    setProfile((current: any) => ({
      ...current,
      mood_emoji: null,
      status_message: null,
      status_expires_at: null,
    }));

    showToast("今日状态已取消 🌙");
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file || !user) return;

    setUploading(true);

    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, file, {
        upsert: true,
      });

    if (uploadError) {
      showToast(uploadError.message);
      setUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(fileName);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        avatar_url: publicUrl,
      })
      .eq("id", user.id);

    setUploading(false);

    if (profileError) {
      showToast(profileError.message);
      return;
    }

    setProfile((current: any) => ({
      ...current,
      avatar: publicUrl,
    }));

    showToast("头像上传成功 🔥");
  }

  async function uploadBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file || !user) return;

    setBannerUploading(true);

    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/banner.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("banners")
      .upload(fileName, file, {
        upsert: true,
      });

    if (uploadError) {
      showToast(uploadError.message);
      setBannerUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("banners").getPublicUrl(fileName);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        banner_url: publicUrl,
      })
      .eq("id", user.id);

    setBannerUploading(false);

    if (profileError) {
      showToast(profileError.message);
      return;
    }

    setProfile((current: any) => ({
      ...current,
      banner_url: publicUrl,
    }));

    showToast("Banner 上传成功 🔥");
  }

  return (
    <main className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-4xl font-bold">我的资料 👤</h1>

        <p className="mt-2 text-zinc-500">
          上传头像、管理个人资料与今日状态。
        </p>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950/40">
        <div className="absolute inset-0 opacity-35">
          {profile?.banner_url ? (
            <img
              src={profile.banner_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-zinc-900 via-black to-zinc-950" />
          )}
        </div>

        <div className="absolute inset-0 bg-black/55" />

        <div
          className={`pointer-events-none absolute bottom-4 left-8 z-[1] select-none text-6xl font-black ${
            profile?.banner_url ? "text-white/20" : "text-white/5"
          }`}
        >
          背景图
        </div>

        <div className="relative z-10 grid grid-cols-1 gap-8 p-8 pb-20 lg:grid-cols-[220px_1fr]">
          <div className="space-y-5">
            <div className="h-32 w-32 overflow-hidden rounded-full border border-zinc-600 bg-black/60">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl">
                  👤
                </div>
              )}
            </div>

            <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-zinc-700 bg-black/60 px-5 py-3 transition hover:border-white">
              <span>{uploading ? "上传中..." : "上传头像"}</span>

              <input
                type="file"
                accept="image/*"
                onChange={uploadAvatar}
                className="hidden"
              />
            </label>

            <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-zinc-700 bg-black/60 px-5 py-3 transition hover:border-white">
              <span>{bannerUploading ? "上传中..." : "上传背景图"}</span>

              <input
                type="file"
                accept="image/*"
                onChange={uploadBanner}
                className="hidden"
              />
            </label>

            <p className="text-sm leading-6 text-zinc-400">
              背景图会成为你个人主页的房间背景。
            </p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm text-zinc-300">用户名称</p>

              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  markChanged();
                }}
                className="w-full rounded-2xl border border-zinc-600 bg-black/70 p-4 text-white outline-none focus:border-white"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-zinc-300">个人简介</p>

              <textarea
                rows={7}
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value);
                  markChanged();
                }}
                className="w-full rounded-2xl border border-zinc-600 bg-black/70 p-4 text-white outline-none focus:border-white"
                placeholder="介绍一下自己..."
              />
            </div>

            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="rounded-2xl bg-white px-6 py-3 font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存资料"}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-5 rounded-3xl border border-zinc-800 bg-zinc-950/50 p-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">公开资料设置</h2>

          <p className="text-sm text-zinc-500">
            控制哪些成长资料会显示在你的房间里。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <PrivacySwitch
            label="显示等级"
            checked={showLevel}
            onChange={() => {
              setShowLevel((current) => !current);
              markChanged();
            }}
          />

          <PrivacySwitch
            label="显示留下的光"
            checked={showExp}
            onChange={() => {
              setShowExp((current) => !current);
              markChanged();
            }}
          />

          <PrivacySwitch
            label="显示信任"
            checked={showTrustScore}
            onChange={() => {
              setShowTrustScore((current) => !current);
              markChanged();
            }}
          />

          <PrivacySwitch
            label="显示入住天数"
            checked={showJoinedDays}
            onChange={() => {
              setShowJoinedDays((current) => !current);
              markChanged();
            }}
          />
        </div>

        {hasUnsavedChanges && (
          <p className="text-sm text-yellow-300/80">
            你有还没保存的资料修改。
          </p>
        )}
      </div>

      <div className="space-y-5 rounded-3xl border border-zinc-800 bg-zinc-950/50 p-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">🌙 今日状态</h2>

          <p className="text-sm text-zinc-500">
            心情状态将在 18 小时后自动过期。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {["🌙", "☁️", "🌧️", "🎧", "☕", "✨", "💭", "📖", "🌫️", "🫧"].map(
            (emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setMoodEmoji(emoji)}
                className={
                  moodEmoji === emoji
                    ? "flex h-12 w-12 items-center justify-center rounded-2xl border border-white bg-white/10 text-2xl"
                    : "flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-black text-2xl hover:border-zinc-500"
                }
              >
                {emoji}
              </button>
            )
          )}

          <input
            value={moodEmoji}
            onChange={(e) => setMoodEmoji(e.target.value)}
            placeholder="自定义"
            maxLength={2}
            className="h-12 w-24 rounded-2xl border border-zinc-800 bg-black text-center text-xl outline-none focus:border-white"
          />
        </div>

        <textarea
          placeholder="写下今天的状态..."
          value={statusMessage}
          onChange={(e) => setStatusMessage(e.target.value)}
          rows={3}
          className="w-full rounded-2xl border border-zinc-800 bg-black px-5 py-4 outline-none focus:border-zinc-500"
        />

        {(moodEmoji || statusMessage) && (
          <div className="rounded-2xl border border-zinc-800 bg-black/50 px-5 py-4 text-zinc-300">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{moodEmoji || "🌙"}</span>

              {statusMessage && (
                <span className="text-sm text-zinc-200">{statusMessage}</span>
              )}
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              今日状态将在夜里安静下来
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveMoodStatus}
            disabled={statusSaving}
            className="rounded-2xl bg-white px-6 py-3 font-bold text-black disabled:opacity-50"
          >
            {statusSaving
              ? "保存中..."
              : profile?.status_expires_at &&
                  new Date(profile.status_expires_at).getTime() > Date.now()
                ? "更新今日状态"
                : "设置今日状态"}
          </button>

          {(moodEmoji || statusMessage) && (
            <button
              type="button"
              onClick={clearMoodStatus}
              className="rounded-2xl border border-zinc-700 px-6 py-3 font-bold text-zinc-300 hover:border-zinc-500"
            >
              取消状态
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
          {message}
        </div>
      )}
    </main>
  );
}
