"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/site";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  function showToast(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 4200);
  }

  async function sendResetEmail() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      showToast("请输入你的邮箱。");
      return;
    }

    setSending(true);

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${SITE_URL}/reset-password`,
    });

    setSending(false);

    if (error) {
      showToast(error.message);
      return;
    }

    setSent(true);
    showToast("重设密码邮件已经寄出。");
  }

  return (
    <main className="min-h-screen bg-black px-5 py-20 text-white">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black via-zinc-950 to-black" />

      <div className="fixed left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />

      <section className="mx-auto max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.035] p-7 backdrop-blur-2xl md:p-9">
        {message && (
          <div className="mb-6 rounded-2xl border border-violet-500/20 bg-violet-500/[0.08] px-5 py-4 text-sm leading-7 text-violet-100/80">
            {message}
          </div>
        )}

        <p className="text-xs tracking-[0.35em] text-white/30">
          PASSWORD RECOVERY
        </p>

        <h1 className="mt-4 text-4xl font-light">
          找回你的房间钥匙
        </h1>

        <p className="mt-4 text-sm leading-7 text-white/40">
          输入注册邮箱，我们会寄一封重设密码邮件给你。
        </p>

        {sent ? (
          <div className="mt-8 rounded-2xl border border-green-500/20 bg-green-500/[0.06] p-5 text-sm leading-7 text-green-100/70">
            邮件已经送出。请到邮箱里查看，如果没有看到，也记得检查垃圾邮件。
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="你的邮箱"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 outline-none transition placeholder:text-white/25 focus:border-white/30"
            />

            <button
              type="button"
              onClick={sendResetEmail}
              disabled={sending}
              className="w-full rounded-full bg-white px-6 py-4 text-sm font-bold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? "正在发送..." : "发送重设邮件"}
            </button>
          </div>
        )}

        <Link
          href="/"
          className="mt-6 inline-block text-sm text-white/35 transition hover:text-white/70"
        >
          ← 回到入口
        </Link>
      </section>
    </main>
  );
}
