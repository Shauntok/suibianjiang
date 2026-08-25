"use client";

import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import {
  sponsorPhoneCountries,
  type SponsorPhoneCountry,
} from "@/lib/sponsors/inquiry";

export default function FeedbackPage() {
  const [type, setType] = useState("suggestion");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<SponsorPhoneCountry>("MY");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const isSponsorship = type === "sponsorship";
  const selectedCountry = sponsorPhoneCountries.find(
    (country) => country.code === phoneCountry
  )!;

  async function submitFeedback() {
    if (sending) return;

    if (!title.trim() || !content.trim()) {
      toast.error(isSponsorship ? "请填写合作主题与合作方案。" : "请填写反馈标题与内容。");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("请先登录。");
      return;
    }

    setSending(true);
    setSubmitted(false);

    let errorMessage = "";

    if (isSponsorship) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setSending(false);
        toast.error("登录状态已过期，请重新登录。");
        return;
      }

      const response = await fetch("/api/sponsor-inquiries", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          partnerName,
          contactName,
          email,
          phoneCountry,
          phoneNumber,
          subject: title,
          proposal: content,
        }),
      });
      const result = await response.json().catch(() => null);
      errorMessage = response.ok ? "" : result?.error || "合作申请暂时无法送出。";
    } else {
      const { error } = await supabase.from("feedbacks").insert([
        {
          user_id: user.id,
          type,
          title: title.trim(),
          content: content.trim(),
          status: "pending",
        },
      ]);
      errorMessage = error?.message || "";
    }

    setSending(false);

    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    setTitle("");
    setContent("");
    setPartnerName("");
    setContactName("");
    setEmail("");
    setPhoneCountry("MY");
    setPhoneNumber("");
    setSubmitted(true);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-black px-5 pb-24 pt-24 text-white md:px-6 md:pt-28">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-black via-zinc-950 to-black" />
      <div className="pointer-events-none fixed left-1/2 top-1/3 -z-10 hidden h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl md:block" />

      <div className="mx-auto max-w-3xl space-y-8">
        <section>
          <p className="text-xs tracking-[0.35em] text-white/25 md:tracking-[0.4em]">
            {isSponsorship ? "BUSINESS COLLABORATION" : "FEEDBACK"}
          </p>

          <h1 className="mt-3 text-4xl font-light tracking-tight md:mt-5 md:text-6xl">
            {isSponsorship ? "业配合作" : "意见反馈"}
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-7 text-white/40 md:mt-6 md:leading-8">
            {isSponsorship
              ? "把品牌、联系方式与合作想法写下来。我们会安静地读完，再与你联系。"
              : "如果你遇到 Bug、觉得哪里不好用，或者有想要的功能，都可以写在这里。"}
          </p>
        </section>

        {submitted && (
          <section className="rounded-[2rem] border border-emerald-500/20 bg-emerald-500/[0.08] p-5 text-sm leading-7 text-emerald-100/75 backdrop-blur-2xl md:rounded-[2.4rem] md:p-6">
            <p className="font-medium text-emerald-100">
              {isSponsorship ? "🤝 合作申请已送达" : "💌 反馈已送出"}
            </p>

            <p className="mt-2 text-emerald-100/65">
              {isSponsorship
                ? "资料只会由小时代的 Admin 与 Owner 查看。"
                : "谢谢你帮我们把小时代变得更好。"}
            </p>
          </section>
        )}

        <section className="space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-2xl md:rounded-[2.4rem] md:p-7">
          <div>
            <label htmlFor="submission-type" className="mb-2 block text-sm text-white/45">
              提交类型
            </label>

            <select
              id="submission-type"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setSubmitted(false);
              }}
              className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-4 text-sm text-white outline-none transition focus:border-white/30"
            >
              <option value="bug">🐛 Bug 反馈</option>
              <option value="suggestion">💡 功能建议</option>
              <option value="experience">🌙 使用体验</option>
              <option value="report">🚨 投诉举报</option>
              <option value="other">📦 其他</option>
              <option value="sponsorship">🤝 业配合作</option>
            </select>
          </div>

          {isSponsorship && (
            <>
              <TextField
                id="partner-name"
                label="合作方或品牌名称"
                value={partnerName}
                onChange={setPartnerName}
                placeholder="例如：月光咖啡社"
                required
              />
              <div className="grid gap-5 md:grid-cols-2">
                <TextField
                  id="contact-name"
                  label="联系人姓名"
                  value={contactName}
                  onChange={setContactName}
                  placeholder="例如：林小姐"
                  required
                />
                <TextField
                  id="contact-email"
                  label="联系 Email"
                  value={email}
                  onChange={setEmail}
                  placeholder="name@company.com"
                  type="email"
                  required
                />
              </div>
              <div className="grid gap-5 md:grid-cols-[0.8fr_1.2fr]">
                <div>
                  <label htmlFor="phone-country" className="mb-2 block text-sm text-white/45">
                    国家或地区
                  </label>
                  <select
                    id="phone-country"
                    value={phoneCountry}
                    onChange={(event) => {
                      setPhoneCountry(event.target.value as SponsorPhoneCountry);
                      setSubmitted(false);
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-4 text-sm text-white outline-none transition focus:border-white/30"
                  >
                    {sponsorPhoneCountries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.label} {country.dialCode}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="phone-number" className="mb-2 block text-sm text-white/45">
                    手机号码
                  </label>
                  <input
                    id="phone-number"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    value={phoneNumber}
                    onChange={(event) => {
                      setPhoneNumber(event.target.value);
                      setSubmitted(false);
                    }}
                    placeholder={`例如：${selectedCountry.example}`}
                    className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
                  />
                  <p className="mt-2 text-xs leading-5 text-white/30">
                    {selectedCountry.label}格式：{selectedCountry.example}，系统会保存为国际号码。
                  </p>
                </div>
              </div>
            </>
          )}

          <div>
            <label htmlFor="submission-title" className="mb-2 block text-sm text-white/45">
              {isSponsorship ? "合作主题" : "反馈标题"}
            </label>

            <input
              id="submission-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSubmitted(false);
              }}
              placeholder={isSponsorship ? "例如：深夜咖啡品牌合作" : "例如：手机版信箱按钮有点挤"}
              className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
            />
          </div>

          <div>
            <label htmlFor="submission-content" className="mb-2 block text-sm text-white/45">
              {isSponsorship ? "合作方案" : "详细内容"}
            </label>

            <textarea
              id="submission-content"
              rows={8}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setSubmitted(false);
              }}
              placeholder={isSponsorship ? "介绍合作内容、希望投放的位置、预计时间与其他需要我们了解的事项……" : "把你看到的问题、建议或想法写下来……"}
              className="safe-pre w-full resize-none rounded-2xl border border-white/10 bg-black/50 px-4 py-4 text-sm leading-8 text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
            />
          </div>

          <button
            type="button"
            onClick={submitFeedback}
            disabled={sending}
            className="w-full rounded-full bg-white px-6 py-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "提交中..." : isSponsorship ? "提交合作申请" : "提交反馈"}
          </button>
        </section>
      </div>
    </main>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm text-white/45">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
      />
    </div>
  );
}
