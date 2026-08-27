"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PasswordInput from "@/components/ui/PasswordInput";
import styles from "./LandingClient.module.css";

const memoryCards = [
  {
    text: "你还在吗？",
    className: "left-[7%] top-[24%] md:left-[9%] md:top-[24%]",
    rotate: "-6deg",
    duration: "8s",
  },
  {
    text: "我只是突然想起以前。",
    className: "right-[6%] top-[31%] md:right-[10%] md:top-[30%]",
    rotate: "5deg",
    duration: "10s",
  },
  {
    text: "如果那时候，我们都慢一点就好了。",
    className: "left-[8%] bottom-[24%] md:left-[17%] md:bottom-[20%]",
    rotate: "3deg",
    duration: "12s",
  },
  {
    text: "有些话，好像只能留在凌晨。",
    className: "right-[7%] top-[9%] md:left-[34%] md:top-[16%]",
    rotate: "4deg",
    duration: "13s",
  },
  {
    text: "晚安。可是我还没睡。",
    className: "right-[4%] bottom-[16%] md:left-[70%] md:bottom-[14%]",
    rotate: "-5deg",
    duration: "14s",
  },
];

const stars = [
  "left-[18%] top-[22%] h-1 w-1 bg-white/35",
  "left-[72%] top-[28%] h-1 w-1 bg-white/30",
  "left-[64%] top-[68%] h-1 w-1 bg-white/25",
  "left-[30%] top-[74%] h-1 w-1 bg-white/20",
  "left-[48%] top-[18%] h-[3px] w-[3px] bg-white/25",
  "left-[82%] top-[61%] h-[3px] w-[3px] bg-white/20",
  "left-[12%] top-[58%] h-[3px] w-[3px] bg-white/25",
  "left-[38%] top-[42%] h-[2px] w-[2px] bg-white/30",
  "left-[57%] top-[76%] h-[2px] w-[2px] bg-white/25",
  "left-[88%] top-[22%] h-[2px] w-[2px] bg-white/20",
  "left-[24%] top-[36%] h-[2px] w-[2px] bg-white/30",
  "left-[70%] top-[82%] h-[2px] w-[2px] bg-white/25",
  "left-[44%] top-[63%] h-[2px] w-[2px] bg-white/20",
  "left-[7%] top-[78%] h-[2px] w-[2px] bg-white/25",
];

export default function LandingClient() {
  const router = useRouter();
  const landingRef = useRef<HTMLElement>(null);

  const [scrollY, setScrollY] = useState(0);
  const [showLoginDock, setShowLoginDock] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [musicOpen, setMusicOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [username, setUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");

  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [message, setMessage] = useState("");

  function showToast(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 4200);
  }

  async function handleEnter() {
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanEmail || !password.trim()) {
      showToast("请输入邮箱和密码。");
      return;
    }

    if (!emailRegex.test(cleanEmail)) {
      showToast("请输入正确的邮箱格式。");
      return;
    }

    setLoginLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    setLoginLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        showToast(
          "这个邮箱还没有完成验证。请先到邮箱点击验证链接，也可以检查垃圾邮件 / Spam。"
        );
        return;
      }

      showToast("登录失败，请检查邮箱或密码。");
      return;
    }

    router.push("/home");
  }

  async function handleRegister() {
    const cleanUsername = username.trim();
    const cleanEmail = registerEmail.trim().toLowerCase();
    const birthDate =
      birthYear && birthMonth && birthDay
        ? `${birthYear}-${birthMonth.padStart(2, "0")}-${birthDay.padStart(
            2,
            "0"
          )}`
        : "";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const usernameRegex = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/;

    if (
      !cleanUsername ||
      !cleanEmail ||
      !birthDate ||
      !registerPassword.trim() ||
      !confirmPassword.trim()
    ) {
      showToast("请填写居民名字、生日、邮箱和密码。");
      return;
    }

    if (cleanUsername.length < 3) {
      showToast("居民名字至少需要 3 个字符。");
      return;
    }

    if (cleanUsername.length > 20) {
      showToast("居民名字不能超过 20 个字符。");
      return;
    }

    if (!usernameRegex.test(cleanUsername)) {
      showToast("居民名字只能使用中文、英文、数字和底线。");
      return;
    }

    if (!emailRegex.test(cleanEmail)) {
      showToast("请输入正确的邮箱格式。");
      return;
    }

    if (registerPassword.length < 8) {
      showToast("密码至少需要 8 位。");
      return;
    }

    if (registerPassword !== confirmPassword) {
      showToast("两次输入的密码不一样。");
      return;
    }

    setRegisterLoading(true);

    const { data: existingProfile, error: usernameCheckError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", cleanUsername)
      .maybeSingle();

    if (usernameCheckError) {
      setRegisterLoading(false);
      showToast(usernameCheckError.message);
      return;
    }

    if (existingProfile) {
      setRegisterLoading(false);
      showToast("这个居民名字已经有人住下了，请换一个名字。");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: registerPassword,
      options: {
        emailRedirectTo: "https://www.ourlittleage.com",
        data: {
          username: cleanUsername,
          birth_date: birthDate,
          theme: "midnight",
        },
      },
    });

    setRegisterLoading(false);

    if (error) {
      showToast(error.message);
      return;
    }

    showToast("验证邮件已经发送到你的邮箱。请先点击验证链接，完成后再回来登录。");

    setAuthMode("login");
    setEmail(cleanEmail);
    setPassword("");
    setUsername("");
    setRegisterEmail("");
    setRegisterPassword("");
    setConfirmPassword("");
    setBirthDay("");
    setBirthMonth("");
    setBirthYear("");
  }

  function scrollToPortal() {
    const portalCard = document.getElementById("portal-card");
    if (!portalCard) return;

    const rect = portalCard.getBoundingClientRect();

    const targetTop =
      window.scrollY +
      rect.top -
      Math.max((window.innerHeight - rect.height) / 2, 24);

    window.scrollTo({
      top: targetTop,
      behavior: "smooth",
    });
  }

  useEffect(() => {
    const landing = landingRef.current;
    if (!landing) return;
    let layoutWidth = 0;

    const updateLayoutHeight = () => {
      const width = window.innerWidth;
      if (width === layoutWidth) return;
      layoutWidth = width;

      // Keyboard/address-bar height changes must not collapse the sections before the form.
      if (width < 768) {
        landing.style.setProperty("--landing-height", `${window.innerHeight}px`);
      } else {
        landing.style.removeProperty("--landing-height");
      }
    };

    updateLayoutHeight();
    window.addEventListener("resize", updateLayoutHeight);
    return () => window.removeEventListener("resize", updateLayoutHeight);
  }, []);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    window.scrollTo(0, 0);
    setShowLoginDock(true);
  }, []);

  useEffect(() => {
    function handleScroll() {
      const y = window.scrollY;
      const h = window.innerHeight;

      setScrollY(y);

      const portalCard = document.getElementById("portal-card");
      const portalCardRect = portalCard?.getBoundingClientRect();

      const isPortalCardTooClose =
        portalCardRect &&
        portalCardRect.top < h * 0.78 &&
        portalCardRect.bottom > h * 0.18;

      setShowLoginDock(!isPortalCardTooClose);
    }

    window.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main ref={landingRef} className="w-full overflow-x-clip bg-black text-white">
      <section
        className={`${styles.screen} relative flex h-screen items-center justify-center overflow-hidden transition-all duration-300`}
        style={{
          opacity: Math.max(1 - scrollY / 900, 0),
          transform: `scale(${1 + scrollY * 0.00012})`,
          filter: `brightness(${1 - scrollY * 0.00025})`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-950 to-black" />

        <div
          className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-3xl"
          style={{
            transform: `translate(-50%, -50%) scale(${1 + scrollY * 0.00025})`,
            opacity: Math.max(0.45 - scrollY / 1800, 0.08),
          }}
        />

        <div
          className="absolute bottom-16 right-16 h-[280px] w-[280px] rounded-full bg-blue-500/10 blur-3xl"
          style={{
            transform: `translateY(${scrollY * 0.08}px)`,
            opacity: Math.max(0.35 - scrollY / 1600, 0),
          }}
        />

        <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
          {memoryCards.map((item) => (
            <div
              key={item.text}
              className={`
                absolute ${item.className}
                max-w-[180px]
                rounded-3xl
                border border-white/15
                bg-white/[0.055]
                px-4 py-3
                text-xs text-white/40
                shadow-[0_0_40px_rgba(255,255,255,0.035)]
                backdrop-blur-md
                md:max-w-[220px]
                md:px-5 md:py-4
                md:text-sm md:text-white/45
              `}
              style={
                {
                  "--rotate": item.rotate,
                  animation: `memoryFloat ${item.duration} ease-in-out infinite`,
                } as CSSProperties
              }
            >
              {item.text}
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-0 z-[3]">
          {stars.map((item, index) => (
            <div
              key={item}
              className={`absolute rounded-full ${item} animate-[starBreath_4s_ease-in-out_infinite]`}
              style={{ animationDelay: `${index * 0.35}s` }}
            />
          ))}
        </div>

        <div
          className="absolute left-7 top-14 z-[4] text-xl text-white/24 md:left-20 md:top-32 md:text-2xl md:text-white/30"
          style={{
            transform: `translateY(${scrollY * -0.08}px)`,
            opacity: Math.max(0.55 - scrollY / 1000, 0),
          }}
        >
          🌙 我想你了
        </div>

        <div
          className="absolute bottom-[17%] left-1/2 z-[4] -translate-x-1/2 md:bottom-40 md:left-auto md:right-32 md:translate-x-0"
          style={{
            opacity: Math.max(0.45 - scrollY / 900, 0),
          }}
        >
          <div
            className="text-sm text-zinc-700 md:text-lg"
            style={{
              transform: `translateY(${scrollY * 0.06}px)`,
            }}
          >
            ☕ 凌晨 3:44
          </div>
        </div>

        <div
          className="relative z-10 space-y-6 text-center"
          style={{ transform: `translateY(${scrollY * -0.12}px)` }}
        >
          <p className="text-xs tracking-[0.5em] text-white/25">WELCOME TO</p>

          <h1 className="animate-[titleBreath_7s_ease-in-out_infinite] text-7xl font-black tracking-tight md:text-8xl">
            小时代
          </h1>

          <p className="text-xl text-zinc-500">一个允许人慢慢生活的地方。</p>

          <p className="pt-5 text-xs uppercase tracking-[0.3em] text-zinc-700 md:pt-8 md:text-sm">
            Scroll To Enter
          </p>
        </div>
      </section>

      <section className={`${styles.memories} relative h-[160vh] bg-black`}>
        <div className={`${styles.screen} sticky top-0 flex h-screen items-center justify-center overflow-hidden`}>
          <div
            className="absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.035] blur-3xl"
            style={{
              opacity: Math.min(Math.max((scrollY - 600) / 600, 0), 0.45),
              transform: `translate(-50%, -50%) scale(${
                1 + Math.max(scrollY - 700, 0) * 0.00025
              })`,
            }}
          />

          <div
            className="space-y-8 text-center transition-all duration-700"
            style={{
              opacity: Math.min(Math.max((scrollY - 520) / 500, 0), 1),
              transform: `translateY(${Math.max(
                80 - (scrollY - 500) * 0.12,
                0
              )}px)`,
              filter: `blur(${Math.max(10 - (scrollY - 520) * 0.02, 0)}px)`,
            }}
          >
            <p className="text-xs tracking-[0.5em] text-white/25">STEP INTO</p>

            <h2 className="text-5xl font-black tracking-tight text-white md:text-7xl">
              进入世界
            </h2>

            <p className="mx-auto max-w-md text-sm leading-7 text-zinc-500">
              继续往下。这里不是普通首页，
              <br />
              而是一个慢慢靠近自己的地方。
            </p>
          </div>
        </div>
      </section>

      <section
        id="portal"
        className={`${styles.portal} relative flex min-h-screen items-start justify-center overflow-hidden px-6 py-24 md:items-center md:py-20`}
      >
        <div
          className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.035] blur-3xl"
          style={{
            opacity: Math.min(Math.max((scrollY - 1500) / 700, 0), 0.5),
            transform: `translate(-50%, -50%) scale(${
              1 + Math.max(scrollY - 1600, 0) * 0.00018
            })`,
          }}
        />

        <div
          id="portal-card"
          className={`${styles.portalCard} relative z-10 grid w-full max-w-5xl gap-6 transition-all duration-1000 md:grid-cols-2`}
          style={{
            opacity: Math.min(Math.max((scrollY - 1550) / 500, 0), 1),
            transform: `scale(${
              0.98 +
              Math.min(Math.max((scrollY - 1500) / 900, 0), 1) * 0.02
            })`,
            filter: `blur(${Math.max(6 - (scrollY - 1500) * 0.015, 0)}px)`,
          }}
        >
          <div
            className={`
              rounded-[2rem] border border-white/10 bg-white/[0.035]
              p-10 text-white shadow-[0_0_80px_rgba(255,255,255,0.06)]
              backdrop-blur-2xl transition-all duration-1000 ease-out
              ${
                authMode === "register"
                  ? "md:translate-x-0"
                  : "md:translate-x-[50%]"
              }
            `}
          >
            <p className="mb-3 text-xs tracking-[0.35em] text-white/35">
              小时代居民入口
            </p>

            <h2 className="text-3xl font-light tracking-tight">
              进入你的深夜小屋
            </h2>

            <p className="mt-5 text-sm leading-7 text-white/45 transition duration-700">
              游客可以短暂经过这里，但只有居民才能留下自己的故事、收藏、评论和生活痕迹。
            </p>

            <div className="mt-14 space-y-4">
              <input
                type="email"
                placeholder="邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-5 py-4 text-sm text-white outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-500 placeholder:text-white/25 focus:border-white/35 focus:bg-white/[0.12] focus:shadow-[0_0_30px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.12)]"
              />

              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder="密码"
              />

              <button
                type="button"
                onClick={handleEnter}
                disabled={loginLoading}
                className="w-full rounded-2xl bg-white py-4 text-sm font-semibold text-black shadow-[0_0_40px_rgba(255,255,255,0.12)] transition-all duration-500 hover:scale-[1.01] hover:bg-white/90 hover:shadow-[0_0_60px_rgba(255,255,255,0.18)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loginLoading ? "进入中..." : "进入小时代"}
              </button>

              <div className="space-y-2 pt-2 text-center text-xs">
                <button
                  type="button"
                  onClick={() => setAuthMode("register")}
                  className="w-full text-white/35 transition hover:text-white/60"
                >
                  还没有房间？创建居民账号
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="w-full text-white/25 transition hover:text-white/55"
                >
                  忘记密码？找回你的房间钥匙
                </button>
              </div>
            </div>
          </div>

          <div
            className={`
              overflow-hidden rounded-[2rem] border border-white/10
              bg-white/[0.035] text-white shadow-[0_0_80px_rgba(255,255,255,0.06)]
              backdrop-blur-2xl transition-all duration-1000 ease-out
              ${
                authMode === "register"
                  ? "max-h-[1200px] opacity-100 blur-0"
                  : "pointer-events-none max-h-0 opacity-0 blur-md md:max-h-[900px] md:translate-x-8"
              }
            `}
          >
            <div className="p-10">
              <p className="mb-3 text-xs tracking-[0.35em] text-white/35">
                创建居民账号
              </p>

              <h2 className="text-3xl font-light tracking-tight">
                留下你的第一盏灯
              </h2>

              <p className="mt-5 text-sm leading-7 text-white/45">
                留下一个名字后，这个世界会开始记得你。
              </p>

              <div className="mt-9 space-y-4">
                <input
                  type="text"
                  placeholder="你想在小时代叫什么名字？"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-5 py-4 text-sm text-white outline-none transition-all duration-500 placeholder:text-white/25 focus:border-white/35 focus:bg-white/[0.12]"
                />

                <div className="grid grid-cols-3 gap-3">
                  <select
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.07] px-5 py-4 text-sm text-white/70 outline-none transition-all duration-500 focus:border-white/35 focus:bg-white/[0.12]"
                  >
                    <option value="" className="bg-zinc-950 text-white">
                      日
                    </option>

                    {Array.from({ length: 31 }, (_, i) => String(i + 1)).map(
                      (day) => (
                        <option
                          key={day}
                          value={day}
                          className="bg-zinc-950 text-white"
                        >
                          {day}
                        </option>
                      )
                    )}
                  </select>

                  <select
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.07] px-5 py-4 text-sm text-white/70 outline-none transition-all duration-500 focus:border-white/35 focus:bg-white/[0.12]"
                  >
                    <option value="" className="bg-zinc-950 text-white">
                      月
                    </option>

                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(
                      (month) => (
                        <option
                          key={month}
                          value={month}
                          className="bg-zinc-950 text-white"
                        >
                          {month}
                        </option>
                      )
                    )}
                  </select>

                  <select
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.07] px-5 py-4 text-sm text-white/70 outline-none transition-all duration-500 focus:border-white/35 focus:bg-white/[0.12]"
                  >
                    <option value="" className="bg-zinc-950 text-white">
                      年
                    </option>

                    {Array.from(
                      { length: new Date().getFullYear() - 1900 + 1 },
                      (_, i) => String(new Date().getFullYear() - i)
                    ).map((year) => (
                      <option
                        key={year}
                        value={year}
                        className="bg-zinc-950 text-white"
                      >
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  type="email"
                  placeholder="邮箱"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-5 py-4 text-sm text-white outline-none transition-all duration-500 placeholder:text-white/25 focus:border-white/35 focus:bg-white/[0.12]"
                />

                <PasswordInput
                  value={registerPassword}
                  onChange={setRegisterPassword}
                  placeholder="密码"
                />

                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="确认密码"
                />

                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={registerLoading}
                  className="w-full rounded-2xl bg-white py-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {registerLoading ? "创建中..." : "创建并进入小时代"}
                </button>

                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className="w-full pt-2 text-xs text-white/35 transition hover:text-white/60"
                >
                  已经是居民？返回登录
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div
        className={`fixed left-1/2 z-40 -translate-x-1/2 transition-all duration-1000 ease-out ${
          showLoginDock
            ? "bottom-10 scale-100 opacity-100"
            : "-bottom-24 scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={scrollToPortal}
          className="rounded-full border border-white/10 bg-white/[0.055] px-5 py-2.5 text-xs font-medium tracking-wide text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_34px_rgba(255,255,255,0.08)] backdrop-blur-2xl transition-all duration-500 hover:border-white/20 hover:bg-white/[0.09] hover:text-white/90"
        >
          进入居民入口
        </button>
      </div>

      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setMusicOpen(!musicOpen)}
          className="group flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.055] px-4 py-3 text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_34px_rgba(255,255,255,0.08)] backdrop-blur-2xl transition-all duration-500 hover:bg-white/[0.09] hover:text-white/90"
        >
          <span
            className={`h-8 w-8 rounded-full border border-white/20 bg-[radial-gradient(circle,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0.08)_38%,rgba(255,255,255,0.02)_70%)] shadow-[0_0_24px_rgba(255,255,255,0.12)] ${
              musicOpen ? "animate-[spin_8s_linear_infinite]" : ""
            }`}
          />

          <span className="hidden text-xs md:block">玻璃 · 深夜播放</span>
        </button>

        {musicOpen && (
          <div className="animate-in fade-in slide-in-from-bottom-4 absolute bottom-16 right-0 w-[280px] overflow-hidden rounded-3xl border border-white/10 bg-black/80 p-3 shadow-[0_0_70px_rgba(255,255,255,0.08)] backdrop-blur-2xl duration-500">
            <p className="mb-3 px-2 text-xs tracking-[0.25em] text-white/35">
              NOW PLAYING
            </p>

            <div className="overflow-hidden rounded-2xl">
              <iframe
                className="h-[158px] w-full"
                src="https://www.youtube.com/embed/FB5-rPa5wBA?si=dcULcKAKg5wgMegl"
                title="玻璃"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}
      </div>

      {message && (
        <div className="fixed bottom-6 left-1/2 z-[120] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-3 text-center text-sm leading-6 text-white shadow-2xl backdrop-blur-xl">
          {message}
        </div>
      )}
    </main>
  );
}
