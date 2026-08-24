"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import MarkdownPreview from "@/components/editor/MarkdownPreview";
import VisibilitySelector from "@/components/editor/VisibilitySelector";
import MarkdownToolbar from "@/components/editor/MarkdownToolbar";
import DiarySideCards from "@/components/editor/DiarySideCards";
import EditorPageHeader from "@/components/editor/EditorPageHeader";
import EditorTextarea from "@/components/editor/EditorTextarea";
import DiaryEditorActions from "@/components/editor/DiaryEditorActions";
import MobileVisibilityDialog from "@/components/editor/MobileVisibilityDialog";
import { uploadEditorImage } from "@/components/editor/editorImageUpload";
import { insertEditorText } from "@/components/editor/editorTextUtils";
import {
  isBlockedFromWriting,
  getWritingBlockMessage,
} from "@/lib/editor/writingGuard";
import { getCurrentWritingUser } from "@/lib/editor/getCurrentWritingUser";

const MIN_DIARY_LENGTH = 11;
const DAILY_DIARY_LIMIT = 3;

type DiaryVisibility = "private" | "public" | "hidden" | "unlisted";

const visibilityOptions = [
  {
    key: "private",
    icon: "🔒",
    title: "只给自己看",
    desc: "这一天只放在自己的房间里。",
  },
  {
    key: "public",
    icon: "🌍",
    title: "发布到日记广场",
    desc: "让其他居民也能读见这一刻。",
  },
  {
    key: "hidden",
    icon: "🙈",
    title: "隐藏日记",
    desc: "不会出现在公开列表。",
  },
  {
    key: "unlisted",
    icon: "🔗",
    title: "仅链接可见",
    desc: "知道链接的人才能进入。",
  },
];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(date);
}

function getMoodLabel(date: Date) {
  const hour = date.getHours();

  if (hour >= 0 && hour < 5) return "🌙 深夜";
  if (hour >= 5 && hour < 11) return "🌤 清晨";
  if (hour >= 11 && hour < 18) return "☀️ 午后";

  return "🌆 夜晚";
}

function getTimeWarning() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const minutesLeft = 24 * 60 - (hour * 60 + minute);

  if (minutesLeft <= 30) {
    return "今天快要翻篇了。12 点后发布，会归到新的一天。";
  }

  if (minutesLeft <= 120) {
    const hours = Math.ceil(minutesLeft / 60);
    return `距离今天翻篇还有不到 ${hours} 小时。想留在今天的话，记得慢慢写完。`;
  }

  return "";
}

function getTodayRange() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  return {
    todayStart,
    todayEnd,
  };
}

export default function NewDiaryPage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const today = new Date();
  const timeWarning = getTimeWarning();

  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<DiaryVisibility>("private");

  const [publishing, setPublishing] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showVisibilityDialog, setShowVisibilityDialog] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentProfile, setCurrentProfile] = useState<any>(null);
  const [remainingCount, setRemainingCount] = useState<number | null>(null);

  const [editorMessage, setEditorMessage] = useState("");

  const contentLength = content.trim().length;

  useEffect(() => {
    async function fetchUser() {
      const { user, profile } = await getCurrentWritingUser();

      if (!user) {
        router.push("/home");
        return;
      }

      setCurrentUser(user);
      setCurrentProfile(profile);

      if (isBlockedFromWriting(profile?.status)) {
        router.push("/home");
        return;
      }

      const { todayStart, todayEnd } = getTodayRange();

      const { count } = await supabase
        .from("posts")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("author_id", user.id)
        .eq("type", "diary")
        .eq("status", "published")
        .is("deleted_at", null)
        .gte("published_at", todayStart.toISOString())
        .lt("published_at", todayEnd.toISOString());

      setRemainingCount(Math.max(DAILY_DIARY_LIMIT - (count || 0), 0));
    }

    fetchUser();
  }, [router]);

  function guardWriting(action: "publish" | "draft") {
    const message = getWritingBlockMessage(currentProfile?.status, action);

    if (message) {
      setEditorMessage(message);
      router.push("/home");
      return true;
    }

    return false;
  }

  function insertTextAtCursor(beforeText: string, afterText = "") {
    insertEditorText({
      textareaRef,
      beforeText,
      afterText,
      setContent,
    });
  }

  async function uploadImage(e: ChangeEvent<HTMLInputElement>) {
    if (guardWriting("draft")) return;

    const file = e.target.files?.[0];
    if (!file) return;

    setEditorMessage("");
    setUploading(true);

    try {
      const publicUrl = await uploadEditorImage(file);
      insertTextAtCursor(`\n\n![](${publicUrl})\n\n`);
    } catch (error: any) {
      setEditorMessage(error.message || "图片上传失败，请稍后再试。");
    } finally {
      setUploading(false);
    }
  }

  async function saveDraft() {
    if (guardWriting("draft")) return;
    if (!currentUser) return;

    setEditorMessage("");

    if (!content.trim()) {
      setEditorMessage("先写几句话，我帮你放进草稿箱。");
      return;
    }

    setDraftSaving(true);

    const now = new Date();

    const { error } = await supabase.from("posts").insert([
      {
        type: "diary",
        title: `日记 · ${formatDate(now)}`,
        slug: `diary-${Date.now()}`,
        content: content.trim(),
        visibility,
        status: "draft",
        author_id: currentUser.id,
      },
    ]);

    setDraftSaving(false);

    if (error) {
      setEditorMessage(error.message);
      return;
    }

    setEditorMessage("已收进草稿箱，下次继续写。");
    router.push("/diary");
  }

  async function publishDiary() {
    if (guardWriting("publish")) return;

    setEditorMessage("");

    if (contentLength < MIN_DIARY_LENGTH) {
      setEditorMessage(
        `再写几句话吧，至少留下 ${MIN_DIARY_LENGTH} 个字，让今天更完整一些。`
      );
      return;
    }

    if (!currentUser) return;

    setPublishing(true);

    const { todayStart, todayEnd } = getTodayRange();

    const { count, error: countError } = await supabase
      .from("posts")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("author_id", currentUser.id)
      .eq("type", "diary")
      .eq("status", "published")
      .is("deleted_at", null)
      .gte("published_at", todayStart.toISOString())
      .lt("published_at", todayEnd.toISOString());

    if (countError) {
      setEditorMessage(countError.message);
      setPublishing(false);
      return;
    }

    if ((count || 0) >= DAILY_DIARY_LIMIT) {
      setEditorMessage("今天已经写了 3 篇日记。慢慢来，明天也会等你。");
      setPublishing(false);
      return;
    }

    const now = new Date();

    const { error } = await supabase.from("posts").insert([
      {
        type: "diary",
        title: `日记 · ${formatDate(now)}`,
        slug: `diary-${Date.now()}`,
        content: content.trim(),
        visibility,
        status: "published",
        author_id: currentUser.id,
        published_at: now.toISOString(),
      },
    ]);

    setPublishing(false);

    if (error) {
      setEditorMessage(error.message);
      return;
    }

    router.push("/diary");
  }

  function handlePublishClick() {
    setEditorMessage("");

    if (contentLength < MIN_DIARY_LENGTH) {
      setEditorMessage(
        `再写几句话吧，至少留下 ${MIN_DIARY_LENGTH} 个字，让今天更完整一些。`
      );
      return;
    }

    if (window.innerWidth < 1024) {
      setShowVisibilityDialog(true);
      return;
    }

    publishDiary();
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-black px-5 pb-24 pt-14 text-white md:px-6 md:pt-36">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black via-zinc-950 to-black" />
      <div className="fixed left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl md:h-[620px] md:w-[620px]" />

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-[minmax(680px,1.5fr)_minmax(360px,0.75fr)]">
        <section className="space-y-6">
          <button
            type="button"
            onClick={() => router.push("/diary")}
            className="text-sm text-white/35 transition hover:text-white/70"
          >
            ← 回到日记列表
          </button>

          <div className="relative">
            <EditorPageHeader
              eyebrow="WRITE TODAY"
              title={formatDate(today)}
              meta={`${formatWeekday(today)} · ${getMoodLabel(today)}`}
              subtitle="有些话，不需要急着说完。"
              warning={timeWarning}
            />

            <button
              type="button"
              onClick={() => setShowPromptDialog(true)}
              className="absolute right-5 top-5 inline-flex animate-pulse items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 shadow-[0_0_26px_rgba(34,211,238,0.18)] transition hover:bg-cyan-400/15 lg:hidden"
            >
              ✨ 提示
            </button>
          </div>

          <MarkdownToolbar
            uploading={uploading}
            uploadImage={uploadImage}
            insertTextAtCursor={insertTextAtCursor}
            variant="diary"
          />

          <EditorTextarea
            textareaRef={textareaRef}
            content={content}
            setContent={setContent}
            placeholder="我今天过得很好，别担心。"
            onSaveShortcut={saveDraft}
            insertTextAtCursor={insertTextAtCursor}
            variant="diary"
          />

          {editorMessage && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {editorMessage}
            </div>
          )}

          <DiaryEditorActions
            contentLength={contentLength}
            minLength={MIN_DIARY_LENGTH}
            publishing={publishing}
            draftSaving={draftSaving}
            publishDiary={handlePublishClick}
            saveDraft={saveDraft}
            goBack={() => router.push("/diary")}
          />
        </section>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="hidden lg:block">
            <VisibilitySelector
              visibility={visibility}
              setVisibility={(value) => setVisibility(value as DiaryVisibility)}
              options={visibilityOptions}
            />
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl lg:hidden">
            <p className="text-xs tracking-[0.3em] text-white/25">今日份额</p>

            <p className="mt-5 text-sm leading-7 text-white/50">
              {remainingCount === null
                ? "正在计算今天还能留下多少篇日记..."
                : `今天还能留下 ${remainingCount} 篇日记。`}
            </p>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white/60"
                style={{
                  width:
                    remainingCount === null
                      ? "0%"
                      : `${Math.max(
                          (remainingCount / DAILY_DIARY_LIMIT) * 100,
                          0
                        )}%`,
                }}
              />
            </div>

            <p className="mt-5 text-sm leading-7 text-white/30">
              每天慢慢留下，不需要一次说完。
            </p>
          </div>

          <div className="hidden lg:block">
            <DiarySideCards remainingCount={remainingCount} />
          </div>

          <div className="hidden lg:block">
            <MarkdownPreview
              content={content}
              emptyTitle="这里会预览今天留下的东西。"
              emptyText="写下这一刻，让未来的你感谢现在的自己。"
            />
          </div>
        </aside>
      </div>

      {showPromptDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-5 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-xl"
            onClick={() => setShowPromptDialog(false)}
            aria-label="关闭写作提示"
          />

          <section className="relative z-10 w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-950/95 p-6 text-white shadow-[0_0_80px_rgba(255,255,255,0.08)]">
            <p className="text-xs tracking-[0.35em] text-white/25">
              WRITING HINTS
            </p>

            <h2 className="mt-4 text-2xl font-light">写作提示</h2>

            <ul className="mt-5 space-y-4 text-sm leading-7 text-white/55">
              <li>• 不必完美</li>
              <li>• 真实就好</li>
              <li>• 你只需要面对自己</li>
              <li>• 今天的自己，也值得被记住</li>
            </ul>

            <button
              type="button"
              onClick={() => setShowPromptDialog(false)}
              className="mt-7 w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              知道了
            </button>
          </section>
        </div>
      )}

      <MobileVisibilityDialog
        open={showVisibilityDialog}
        visibility={visibility}
        setVisibility={(value) => setVisibility(value as DiaryVisibility)}
        options={visibilityOptions}
        title="这篇日记要放在哪里？"
        subtitle="选择可见性后，就可以把今天留下来了。"
        confirmText="确定，留下今天"
        cancelText="再看看"
        onClose={() => setShowVisibilityDialog(false)}
        onConfirm={() => {
          setShowVisibilityDialog(false);
          publishDiary();
        }}
      />
    </main>
  );
}
