"use client";

import { pinyin } from "pinyin-pro";
import { supabase } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import TranslatedMarkdown from "@/components/TranslatedMarkdown";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type ConfirmConfig = {
  title: string;
  description: string;
  confirmText: string;
  danger?: boolean;
  action: (() => Promise<void>) | null;
};

export default function EditPage() {
  const params = useParams();
  const id = String(params.id);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");

  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [editCount, setEditCount] = useState(0);
  const [visibility, setVisibility] = useState("public");

  const [loading, setLoading] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [savedContent, setSavedContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({
    title: "",
    description: "",
    confirmText: "确认",
    danger: false,
    action: null,
  });

  function showMessage(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 3500);
  }

  function openConfirm(config: ConfirmConfig) {
    setConfirmConfig(config);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!confirmConfig.action) return;

    setConfirmLoading(true);
    await confirmConfig.action();
    setConfirmLoading(false);
    setConfirmOpen(false);
  }

  function generateSlug(value: string) {
    return pinyin(value, {
      toneType: "none",
      nonZh: "consecutive",
    })
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "")
      .replace(/--+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function makeSnapshot() {
    return JSON.stringify({
      title,
      slug,
      content,
      tags,
      notes,
    });
  }

  function normalizeTags(value: any) {
    if (Array.isArray(value)) return value.join(", ");

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.join(", ");
      } catch {}

      return value;
    }

    return "";
  }

  function insertTextAtCursor(beforeText: string, afterText = "") {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.slice(start, end);

    const insertText = beforeText + selectedText + afterText;

    textarea.setRangeText(insertText, start, end, "end");
    setContent(textarea.value);

    const newPosition = start + insertText.length;

    textarea.focus();
    textarea.setSelectionRange(newPosition, newPosition);
    setCursorPosition(newPosition);
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      showMessage("请选择不超过 10MB 的图片文件。");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showMessage("请先登录后再上传图片。");
      return;
    }

    const cleanName = file.name.replace(/\s+/g, "-");
    const fileName = `${user.id}/${Date.now()}-${cleanName}`;

    const { error } = await supabase.storage
      .from("images")
      .upload(fileName, file);

    if (error) {
      showMessage(error.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("images").getPublicUrl(fileName);

    const imageMarkdown = "\n\n![](" + publicUrl + ")\n\n";

    insertTextAtCursor(imageMarkdown);

    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const newPosition = cursorPosition + imageMarkdown.length;

      textarea.focus();
      textarea.setSelectionRange(newPosition, newPosition);
      setCursorPosition(newPosition);
    }, 0);

    showMessage("图片上传成功 🔥");
  }

  async function updatePost() {
    if (!title || !slug || !content) {
      showMessage("请填写完整。");
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from("posts")
      .update({
        title,
        slug,
        content,
        tags,
        notes,
        visibility,
        status,
        edit_count: editCount + 1,
        edited_at: new Date().toISOString(),
      })
      .eq("id", id);

    setLoading(false);

    if (error) {
      showMessage(error.message);
      return;
    }

    const newSnapshot = makeSnapshot();

    setSavedContent(newSnapshot);
    setIsDirty(false);

    (window as any).adminHasUnsavedChanges = false;

    showMessage("修改已保存 🔥");

    window.setTimeout(() => {
      window.history.back();
    }, 700);
  }

  async function autoSavePost() {
    if (!isDirty) return;
    if (!title || !slug || !content) return;

    setAutoSaving(true);

    const { error } = await supabase
      .from("posts")
      .update({
        title,
        slug,
        content,
        tags,
        notes,
        visibility,
        status,
        edited_at: new Date().toISOString(),
      })
      .eq("id", id);

    setAutoSaving(false);

    if (error) {
      console.log(error.message);
      return;
    }

    setSavedContent(makeSnapshot());
    setIsDirty(false);
  }

  function publishEditedPost() {
    if (!title || !slug || !content) {
      showMessage("请填写完整。");
      return;
    }

    openConfirm({
      title: "发布文章？",
      description: "确定发布这篇文章吗？发布后会根据可见性出现在前台。",
      confirmText: "发布文章",
      action: async () => {
        setLoading(true);

        const { error } = await supabase
          .from("posts")
          .update({
            title,
            slug,
            content,
            tags,
            notes,
            status: "published",
            published_at: publishedAt || new Date().toISOString(),
            visibility,
            edited_at: new Date().toISOString(),
          })
          .eq("id", id);

        setLoading(false);

        if (error) {
          showMessage(error.message);
          return;
        }

        (window as any).adminHasUnsavedChanges = false;

        showMessage("文章已发布 🔥");

        window.setTimeout(() => {
          window.location.href = "/admin/published";
        }, 700);
      },
    });
  }

  function deletePost() {
    openConfirm({
      title: "永久删除文章？",
      description: "这会直接从数据库删除这篇文章，无法从回收站恢复。",
      confirmText: "永久删除",
      danger: true,
      action: async () => {
        const { error } = await supabase.from("posts").delete().eq("id", id);

        if (error) {
          showMessage(error.message);
          return;
        }

        (window as any).adminHasUnsavedChanges = false;

        showMessage("文章已删除。");

        window.setTimeout(() => {
          window.history.back();
        }, 700);
      },
    });
  }

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return;

      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  useEffect(() => {
    (window as any).adminHasUnsavedChanges = isDirty;

    return () => {
      (window as any).adminHasUnsavedChanges = false;
    };
  }, [isDirty]);

  useEffect(() => {
    async function fetchPost() {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("id", id)
        .single();

      if (!data) return;

      const normalizedTags = normalizeTags(data.tags);

      const initialSnapshot = JSON.stringify({
        title: data.title || "",
        slug: data.slug || "",
        content: data.content || "",
        tags: normalizedTags,
        notes: data.notes || "",
      });

      setTitle(data.title || "");
      setSlug(data.slug || "");
      setContent(data.content || "");
      setTags(normalizedTags);
      setNotes(data.notes || "");
      setStatus(data.status || "");
      setPublishedAt(data.published_at || null);
      setEditCount(data.edit_count || 0);
      setVisibility(data.visibility || "public");

      setSavedContent(initialSnapshot);
      setLoaded(true);
    }

    if (id) fetchPost();
  }, [id]);

  useEffect(() => {
    if (!loaded) return;

    setIsDirty(savedContent !== "" && makeSnapshot() !== savedContent);
  }, [title, slug, content, tags, notes, savedContent, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (!isDirty) return;
    if (status === "published") return;

    const timer = window.setTimeout(() => {
      autoSavePost();
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [title, slug, content, tags, notes, isDirty, loaded, status]);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(680px,1.5fr)_minmax(420px,0.9fr)]">
      <section className="space-y-6">
        <h1 className="text-4xl font-bold">编辑文章 ✍️</h1>

        <div className="text-sm">
          {autoSaving ? (
            <p className="text-blue-400">☁️ 自动保存中...</p>
          ) : isDirty ? (
            <p className="text-yellow-400">⚠️ 你有未保存修改</p>
          ) : (
            <p className="text-green-400">✅ 已保存</p>
          )}
        </div>

        <input
          value={title}
          onChange={(e) => {
            const value = e.target.value;
            setTitle(value);
            setSlug(generateSlug(value));
          }}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-4"
        />

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-zinc-300">
            {status === "published" ? "✅ 已发布" : "📝 草稿"}
          </span>

          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-zinc-300">
            {visibility === "public" && "🌍 Public"}
            {visibility === "hidden" && "🙈 Hidden"}
            {visibility === "unlisted" && "🔗 Unlisted"}
            {visibility === "private" && "🔒 Private"}
          </span>
        </div>

        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-4"
        />

        <label className="inline-flex cursor-pointer items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 px-5 py-3 transition hover:border-white">
          <span>📸 上传图片</span>

          <input
            type="file"
            accept="image/*"
            onChange={uploadImage}
            className="hidden"
          />
        </label>

        <div className="sticky top-4 z-20 flex flex-wrap gap-3 rounded-2xl border border-zinc-800 bg-black/80 p-4 backdrop-blur-xl">
          {[
            ["H1", "\n# 标题\n"],
            ["H2", "\n## 小标题\n"],
            ["粗体", "**粗体文字**"],
            ["引用", "\n> 引用内容\n"],
            ["分割线", "\n---\n"],
            ["Code", "\n```js\n// 在这里写代码\n```\n"],
            ["链接", "[链接文字](https://example.com)"],
            ["清单", "\n- 项目一\n- 项目二\n- 项目三\n"],
            ["提示", "\n> 💡 提示：这里写重点内容\n"],
          ].map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => insertTextAtCursor(value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 transition hover:border-white"
            >
              {label}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onClick={(e) => setCursorPosition(e.currentTarget.selectionStart)}
          onKeyUp={(e) => setCursorPosition(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key.toLowerCase() === "b") {
              e.preventDefault();
              insertTextAtCursor("**", "**");
            }

            if (e.ctrlKey && e.key.toLowerCase() === "s") {
              e.preventDefault();
              updatePost();
            }
          }}
          rows={22}
          className="preview-scrollbar min-h-[500px] w-full overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4 outline-none focus:border-white"
        />

        <div className="flex flex-wrap gap-4 pt-4">
          <button
            type="button"
            onClick={updatePost}
            disabled={loading}
            className="admin-btn admin-btn-primary"
          >
            {loading ? "保存中..." : "保存修改"}
          </button>

          <button
            type="button"
            onClick={publishEditedPost}
            disabled={loading}
            className="admin-btn admin-btn-success"
          >
            发布文章
          </button>

          <button
            type="button"
            onClick={deletePost}
            className="admin-btn admin-btn-danger"
          >
            删除文章
          </button>
        </div>
      </section>

      <aside className="sticky top-8 space-y-6 self-start lg:pt-20">
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div>
            <p className="mb-2 text-sm text-zinc-500">可见性 ⓘ</p>

            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-4 outline-none focus:border-white"
            >
              <option value="public">🌍 Public（公开）</option>
              <option value="hidden">🙈 Hidden（隐藏）</option>
              <option value="unlisted">🔗 Unlisted（仅链接可见）</option>
              <option value="private">🔒 Private（私密）</option>
            </select>
          </div>

          <div>
            <p className="mb-2 text-sm text-zinc-500">发布状态 ⓘ</p>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-4 outline-none focus:border-white"
            >
              <option value="draft">📝 草稿</option>
              <option value="published">✅ 已发布</option>
            </select>
          </div>
        </div>

        <input
          type="text"
          placeholder="标签（用逗号隔开）"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-4 outline-none focus:border-white"
        />

        <textarea
          placeholder="想法 / 大纲（只有自己看得到）"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-yellow-200 outline-none focus:border-white"
        />

        <div className="preview-scrollbar h-[900px] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5 pr-3">
          <p className="mb-4 text-sm text-zinc-500">Markdown 预览</p>

          {content ? (
            <article className="prose prose-invert max-w-none">
              <TranslatedMarkdown content={content} />
            </article>
          ) : (
            <p className="text-zinc-500">这里会显示文章预览。</p>
          )}
        </div>
      </aside>

      {message && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
          {message}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        confirmText={confirmConfig.confirmText}
        cancelText="取消"
        danger={confirmConfig.danger}
        loading={confirmLoading}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
