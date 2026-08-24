"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  generateArticleSlug,
  checkArticleSlugExists,
} from "@/components/editor/articleSlugUtils";
import MarkdownPreview from "@/components/editor/MarkdownPreview";
import VisibilitySelector from "@/components/editor/VisibilitySelector";
import MarkdownToolbar from "@/components/editor/MarkdownToolbar";
import ArticleMetaFields from "@/components/editor/ArticleMetaFields";
import EditorPageHeader from "@/components/editor/EditorPageHeader";
import ArticleEditorActions from "@/components/editor/ArticleEditorActions";
import ArticleTitleFields from "@/components/editor/ArticleTitleFields";
import EditorTextarea from "@/components/editor/EditorTextarea";
import ArticleSideCards from "@/components/editor/ArticleSideCards";
import MobileVisibilityDialog from "@/components/editor/MobileVisibilityDialog";
import { uploadEditorImage } from "@/components/editor/editorImageUpload";
import { insertEditorText } from "@/components/editor/editorTextUtils";
import {
  isBlockedFromWriting,
  getWritingBlockMessage,
} from "@/lib/editor/writingGuard";

const DAILY_ARTICLE_LIMIT = 2;
const MIN_ARTICLE_TITLE_LENGTH = 2;
const MIN_ARTICLE_CONTENT_LENGTH = 500;

type ArticleVisibility = "public" | "hidden" | "unlisted" | "private";

const visibilityOptions = [
  {
    key: "public",
    icon: "🌍",
    title: "公开发布",
    desc: "所有居民都可以看到。",
  },
  {
    key: "hidden",
    icon: "🙈",
    title: "隐藏文章",
    desc: "不会主动出现在公开列表。",
  },
  {
    key: "unlisted",
    icon: "🔗",
    title: "仅链接可见",
    desc: "有链接的人才能进入。",
  },
  {
    key: "private",
    icon: "🔒",
    title: "只给自己看",
    desc: "只有你自己能看到。",
  },
];

function getTodayRange() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  return { todayStart, todayEnd };
}

async function getTodayArticleCount(userId: string) {
  const { todayStart, todayEnd } = getTodayRange();

  const { data, error } = await supabase
    .from("posts")
    .select("id")
    .eq("author_id", userId)
    .eq("type", "article")
    .eq("status", "published")
    .is("deleted_at", null)
    .gte("published_at", todayStart.toISOString())
    .lt("published_at", todayEnd.toISOString());

  if (error) throw error;

  return data?.length || 0;
}

export default function NewArticlePage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentProfile, setCurrentProfile] = useState<any>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<ArticleVisibility>("public");

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editorMessage, setEditorMessage] = useState("");
  const [showVisibilityDialog, setShowVisibilityDialog] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);

  const [remainingArticleCount, setRemainingArticleCount] =
    useState<number | null>(null);

  const cleanTitle = title.trim();
  const cleanContent = content.trim();

  const titleCount = cleanTitle.length;
  const contentCount = cleanContent.length;

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/");
        return;
      }

      setCurrentUser(user);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", user.id)
        .maybeSingle();

      setCurrentProfile(profileData);

      if (isBlockedFromWriting(profileData?.status)) {
        router.push("/home");
        return;
      }

      try {
        const todayArticleCount = await getTodayArticleCount(user.id);

        setRemainingArticleCount(
          Math.max(DAILY_ARTICLE_LIMIT - todayArticleCount, 0)
        );
      } catch (error: any) {
        setEditorMessage(error.message);
      }
    }

    getUser();
  }, [router]);

  function guardWriting(action: "publish" | "draft") {
    const message = getWritingBlockMessage(currentProfile?.status, action);

    if (message) {
      router.push("/home");
      return true;
    }

    return false;
  }

  function resetForm() {
    setTitle("");
    setSlug("");
    setContent("");
    setTags("");
    setNotes("");
    setVisibility("public");
  }

  function insertTextAtCursor(beforeText: string, afterText = "") {
    insertEditorText({
      textareaRef,
      beforeText,
      afterText,
      setContent,
    });
  }

  function validateArticleForPublish() {
    setEditorMessage("");

    if (cleanTitle.length < MIN_ARTICLE_TITLE_LENGTH) {
      setEditorMessage("给这篇故事起个名字吧，哪怕只是短短几个字。");
      return false;
    }

    if (cleanContent.length < MIN_ARTICLE_CONTENT_LENGTH) {
      setEditorMessage(
        `这篇故事还可以再慢慢展开一点，至少留下 ${MIN_ARTICLE_CONTENT_LENGTH} 个字吧。`
      );
      return false;
    }

    return true;
  }

  function validateArticleForDraft() {
    setEditorMessage("");

    if (cleanTitle.length < MIN_ARTICLE_TITLE_LENGTH) {
      setEditorMessage("先给草稿起个名字吧，之后回来才找得到它。");
      return false;
    }

    if (!cleanContent) {
      setEditorMessage("写一点点就好，我帮你先收进草稿箱。");
      return false;
    }

    return true;
  }

  async function uploadImage(e: ChangeEvent<HTMLInputElement>) {
    if (guardWriting("publish")) return;

    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const publicUrl = await uploadEditorImage(file);
      insertTextAtCursor(`\n\n![](${publicUrl})\n\n`);
    } catch (error: any) {
      setEditorMessage(error.message);
    } finally {
      setUploading(false);
    }
  }

  async function publishArticle() {
    if (guardWriting("publish")) return;
    if (!currentUser) return;

    if (!validateArticleForPublish()) return;

    const finalSlug =
      generateArticleSlug(slug.trim()) || generateArticleSlug(cleanTitle);

    if (!finalSlug) {
      setEditorMessage("这个标题暂时生成不了链接，换个标题或手动填一下 slug 吧。");
      return;
    }

    setLoading(true);

    try {
      const todayArticleCount = await getTodayArticleCount(currentUser.id);

      if (todayArticleCount >= DAILY_ARTICLE_LIMIT) {
        setEditorMessage(
          "今天已经写下很多故事了，先让它们沉淀一下吧，明天也会等你。"
        );
        setRemainingArticleCount(0);
        setLoading(false);
        return;
      }

      const exists = await checkArticleSlugExists(finalSlug);

      if (exists) {
        setEditorMessage("这个链接已经有人用过了，换一个 slug 吧。");
        setLoading(false);
        return;
      }

      const { error } = await supabase.from("posts").insert([
        {
          type: "article",
          title: cleanTitle,
          slug: finalSlug,
          content: cleanContent,
          status: "published",
          visibility,
          author_id: currentUser.id,
          tags,
          notes,
          published_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        setEditorMessage(error.message);
        setLoading(false);
        return;
      }

      router.push(`/articles/${finalSlug}`);
    } catch (error: any) {
      setEditorMessage(error.message);
      setLoading(false);
    }
  }

  async function saveDraft() {
    if (guardWriting("draft")) return;
    if (!currentUser) return;

    if (!validateArticleForDraft()) return;

    setLoading(true);

    const finalSlug =
      generateArticleSlug(slug.trim()) ||
      generateArticleSlug(cleanTitle) ||
      `${Date.now()}`;

    const exists = await checkArticleSlugExists(finalSlug);

    if (exists) {
      setEditorMessage("这个链接已经有人用过了，换一个 slug 吧。");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("posts").insert([
      {
        type: "article",
        title: cleanTitle,
        slug: finalSlug,
        content: cleanContent,
        status: "draft",
        visibility,
        author_id: currentUser.id,
        tags,
        notes,
      },
    ]);

    setLoading(false);

    if (error) {
      setEditorMessage(error.message);
      return;
    }

    resetForm();
    router.push("/drafts");
  }

  function discardArticle() {
    resetForm();
    router.push("/articles");
  }

  function handlePublishClick() {
    if (!validateArticleForPublish()) return;

    if (window.innerWidth < 1024) {
      setShowVisibilityDialog(true);
      return;
    }

    publishArticle();
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-black px-5 pb-24 pt-14 text-white md:px-6 md:pt-36">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-[minmax(680px,1.5fr)_minmax(420px,0.9fr)]">
        <section className="space-y-6">
          <div className="relative">
            <EditorPageHeader
              eyebrow="NEW ARTICLE"
              title="写一篇故事"
              subtitle="文章适合长一点的想法、故事、作品和那些你想认真留下来的东西。"
            />

            <button
              type="button"
              onClick={() => setShowPromptDialog(true)}
              className="absolute right-5 top-5 inline-flex animate-pulse items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 shadow-[0_0_26px_rgba(34,211,238,0.18)] transition hover:bg-cyan-400/15 lg:hidden"
            >
              ✨ 提示
            </button>
          </div>

          <ArticleTitleFields
            title={title}
            setTitle={setTitle}
            slug={slug}
            setSlug={setSlug}
            titleCount={titleCount}
            generateSlug={generateArticleSlug}
          />

          <MarkdownToolbar
            uploading={uploading}
            uploadImage={uploadImage}
            insertTextAtCursor={insertTextAtCursor}
            variant="article"
          />

          <EditorTextarea
            textareaRef={textareaRef}
            content={content}
            setContent={setContent}
            placeholder="写下你的文章内容..."
            onSaveShortcut={saveDraft}
            insertTextAtCursor={insertTextAtCursor}
            variant="article"
          />

          {editorMessage && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {editorMessage}
            </div>
          )}

          <ArticleEditorActions
            contentCount={contentCount}
            loading={loading}
            publishArticle={handlePublishClick}
            saveDraft={saveDraft}
            discardArticle={discardArticle}
          />
        </section>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="hidden lg:block">
            <VisibilitySelector
              visibility={visibility}
              setVisibility={(value) =>
                setVisibility(value as ArticleVisibility)
              }
              options={visibilityOptions}
            />
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl lg:hidden">
            <p className="text-xs tracking-[0.3em] text-white/25">今日份额</p>

            <p className="mt-5 text-sm leading-7 text-white/50">
              {remainingArticleCount === null
                ? "正在计算今天还能留下多少篇文章..."
                : `今天还能留下 ${remainingArticleCount} 篇文章。`}
            </p>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white/60"
                style={{
                  width:
                    remainingArticleCount === null
                      ? "0%"
                      : `${Math.max(
                          (remainingArticleCount / DAILY_ARTICLE_LIMIT) * 100,
                          0
                        )}%`,
                }}
              />
            </div>

            <p className="mt-5 text-sm leading-7 text-white/30">
              长一点的故事，也可以慢慢写。
            </p>
          </div>

          <div className="hidden lg:block">
            <ArticleSideCards remainingCount={remainingArticleCount} />
          </div>

          <ArticleMetaFields
            tags={tags}
            setTags={setTags}
            notes={notes}
            setNotes={setNotes}
          />

          <div className="hidden lg:block">
            <MarkdownPreview
              content={content}
              emptyTitle="这里会显示文章预览。"
              emptyText="写下一个会被未来某个人读见的故事。"
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
              STORY HINTS
            </p>

            <h2 className="mt-4 text-2xl font-light">写作提示</h2>

            <ul className="mt-5 space-y-4 text-sm leading-7 text-white/55">
              <li>• 先写下来，不急着漂亮</li>
              <li>• 让故事慢慢长出来</li>
              <li>• 有些段落，晚一点整理也没关系</li>
              <li>• 你正在留下一个会被未来读见的东西</li>
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
        setVisibility={(value) => setVisibility(value as ArticleVisibility)}
        options={visibilityOptions}
        title="这篇文章要放在哪里？"
        subtitle="选择可见性后，就可以把这个故事发布出去。"
        confirmText="确定，发布文章"
        cancelText="再看看"
        onClose={() => setShowVisibilityDialog(false)}
        onConfirm={() => {
          setShowVisibilityDialog(false);
          publishArticle();
        }}
      />
    </main>
  );
}
