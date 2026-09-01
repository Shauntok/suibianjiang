import type { ReactNode } from "react";

import UserTotalViewsValue from "./UserTotalViewsValue";

type UserProfileInfo = {
  id: string;
  username?: string | null;
  email?: string | null;
  birth_date?: string | null;
  role?: string | null;
  status?: string | null;
  theme?: string | null;
  banner_position?: string | null;
  created_at?: string | null;
  joined_at?: string | null;
  last_seen_at?: string | null;
};

function formatDateOnly(value: string | null | undefined) {
  if (!value) return "未填写";

  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleString("zh-CN");
}

export default function UserProfileInfoCard({
  profile,
}: {
  profile: UserProfileInfo;
}) {
  const items: Array<[string, ReactNode]> = [
    ["用户 ID", profile.id],
    ["用户名", profile.username || "未填写"],
    ["邮箱", profile.email || "未记录"],
    ["生日", formatDateOnly(profile.birth_date)],
    ["身份", profile.role || "user"],
    ["状态", profile.status || "active"],
    ["房间主题", profile.theme || "midnight"],
    ["Banner 位置", profile.banner_position || "center"],
    ["注册时间", formatDateTime(profile.created_at)],
    ["加入时间", formatDateTime(profile.joined_at)],
    ["最后上线", formatDateTime(profile.last_seen_at)],
    [
      "作品累计有效阅读",
      <UserTotalViewsValue key={profile.id} userId={profile.id} />,
    ],
  ];

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-6">
      <h2 className="text-2xl font-bold">完整资料</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-zinc-800 bg-black/30 p-4"
          >
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="safe-text mt-2 break-words text-sm text-zinc-200">
              {value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
