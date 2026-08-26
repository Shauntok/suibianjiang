"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  targetType: "post" | "comment" | "user";
  targetId: string | number;
  authorId?: string;
  compact?: boolean;
  quiet?: boolean;
  mobileFullWidth?: boolean;
};

const reasonOptions = [
  "辱骂 / 攻击他人",
  "骚扰 / 引战",
  "色情 / 露骨内容",
  "暴力 / 血腥内容",
  "垃圾内容 / 广告",
  "侵犯隐私",
  "其他原因",
];

function getTargetLabel(targetType: Props["targetType"]) {
  if (targetType === "post") return "内容";
  if (targetType === "comment") return "留言";
  return "居民";
}

export default function ReportButton({
  targetType,
  targetId,
  authorId,
  compact = false,
  quiet = false,
  mobileFullWidth = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function showMessage(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 3500);
  }

  async function openReportModal() {
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showMessage("先登录一下，再提交举报。");
      return;
    }

    if (authorId && user.id === authorId) {
      showMessage("这是你自己的内容。如果想调整，可以回去编辑。");
      return;
    }

    setOpen(true);
  }

  async function submitReport() {
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showMessage("先登录一下，再提交举报。");
      return;
    }

    if (authorId && user.id === authorId) {
      showMessage("这是你自己的内容。如果想调整，可以回去编辑。");
      return;
    }

    if (!reason.trim()) {
      showMessage("请选择一个举报原因。");
      return;
    }

    setLoading(true);

    const { data: existingReports, error: existingError } = await supabase
      .from("reports")
      .select("id, status")
      .eq("reporter_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", String(targetId))
      .limit(1);

    if (existingError) {
      setLoading(false);
      showMessage(existingError.message);
      return;
    }

    if (existingReports && existingReports.length > 0) {
      setLoading(false);
      showMessage("你已经举报过这个内容了，管理员会查看。请不要重复举报。");
      setOpen(false);
      return;
    }

    const { error } = await supabase.from("reports").insert([
      {
        reporter_id: user.id,
        target_type: targetType,
        target_id: String(targetId),
        reason: reason.trim(),
        details: details.trim() || null,
        status: "pending",
      },
    ]);

    setLoading(false);

    if (error) {
      showMessage(error.message);
      return;
    }

    setReason("");
    setDetails("");
    setOpen(false);
    showMessage("举报已提交，管理员会查看。谢谢你帮忙守护小时代。");
  }

  return (
    <div
      className={`inline-flex flex-col items-start gap-2 ${
        mobileFullWidth ? "w-full md:w-auto" : ""
      }`}
    >
      <button
        type="button"
        onClick={openReportModal}
        disabled={loading}
        className={`${mobileFullWidth ? "w-full md:w-auto" : ""} ${
          quiet
            ? "min-h-11 border-0 bg-transparent px-0 text-xs text-red-200/40 transition hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
            : compact
            ? "rounded-full border border-red-500/20 bg-red-500/[0.05] px-6 py-3 text-center text-sm text-red-200/60 transition hover:border-red-400/30 hover:bg-red-500/[0.1] hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            : "rounded-full border border-red-500/25 bg-red-500/[0.06] px-6 py-3 text-center text-sm text-red-200/70 transition hover:border-red-400/30 hover:bg-red-500/[0.12] hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
        }`}
      >
        {loading ? "提交中..." : "举报"}
      </button>

      {message && (
        <p className="max-w-[260px] text-xs leading-5 text-amber-200/75">
          {message}
        </p>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/75 px-6 py-28 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl shadow-black">
            <div className="border-b border-white/10 p-6">
              <p className="text-xs tracking-[0.35em] text-red-200/35">
                REPORT
              </p>

              <h2 className="mt-4 text-2xl font-light text-white">
                举报这个{getTargetLabel(targetType)}
              </h2>

              <p className="mt-3 text-sm leading-7 text-white/35">
                举报会进入管理员后台。请尽量选择准确原因，不要恶意举报。
              </p>
            </div>

            <div className="space-y-5 p-6">
              {message && (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  {message}
                </div>
              )}

              <div className="grid gap-2">
                {reasonOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setReason(item)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      reason === item
                        ? "border-red-300/35 bg-red-500/10 text-red-100"
                        : "border-white/10 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white/75"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
                maxLength={300}
                placeholder="补充说明，可选。"
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-white/20 focus:border-white/25"
              />

              <p className="text-xs text-white/25">
                补充说明 {details.length} / 300
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 p-6">
              <button
                type="button"
                onClick={() => {
                  if (loading) return;
                  setOpen(false);
                }}
                className="rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm text-white/55 transition hover:border-white/20 hover:text-white"
              >
                取消
              </button>

              <button
                type="button"
                onClick={submitReport}
                disabled={loading}
                className="rounded-full border border-red-400/25 bg-red-500/15 px-6 py-3 text-sm text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "提交中..." : "提交举报"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
