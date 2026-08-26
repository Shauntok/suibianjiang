"use client";

import {
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Keyword = {
  id: number;
  keyword: string;
  is_active: boolean;
  created_at: string;
};

type Props = {
  open: boolean;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
};

export default function KeywordManager({
  open,
  canManage,
  onClose,
  onChanged,
}: Props) {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const fetchKeywords = useCallback(async () => {
    const { data, error } = await supabase
      .from("comment_moderation_keywords")
      .select("id,keyword,is_active,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setKeywords(data || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void fetchKeywords();
  }, [fetchKeywords, open]);

  if (!open) return null;

  async function addKeyword() {
    const keyword = value.trim();

    if (!keyword) {
      setMessage("请输入要检测的字眼。");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setLoading(true);
    const { error } = await supabase
      .from("comment_moderation_keywords")
      .insert({ keyword, created_by: user.id });
    setLoading(false);

    if (error) {
      setMessage(
        error.code === "23505" ? "这个检测字眼已经存在。" : error.message
      );
      return;
    }

    setValue("");
    setMessage("已加入词库。新评论会立即检测，旧评论可按下重新检测。");
    await fetchKeywords();
  }

  async function toggleKeyword(item: Keyword) {
    const { error } = await supabase
      .from("comment_moderation_keywords")
      .update({
        is_active: !item.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("词库已更新。需要时请重新检测现有评论。");
    await fetchKeywords();
  }

  async function deleteKeyword(id: number) {
    const { error } = await supabase
      .from("comment_moderation_keywords")
      .delete()
      .eq("id", id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("字眼已移除。需要时请重新检测现有评论。");
    await fetchKeywords();
  }

  async function rescanComments() {
    setLoading(true);
    const { data, error } = await supabase.rpc("rescan_comment_moderation");
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(`检测完成，目前有 ${data || 0} 条评论等待人工检查。`);
    await onChanged();
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/10 text-amber-200">
            <ShieldAlert aria-hidden="true" className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-semibold text-zinc-100">评论检测词库</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              命中后只进入人工检查，不会自动隐藏、删除或限制居民。
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="关闭检测词库"
          aria-label="关闭检测词库"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-900 hover:text-white"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {canManage ? (
        <>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              value={value}
              maxLength={64}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addKeyword();
              }}
              placeholder="输入一个需要人工留意的字眼"
              className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm outline-none transition placeholder:text-zinc-700 focus:border-zinc-500"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void addKeyword()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              加入词库
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {keywords.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${
                  item.is_active
                    ? "border-zinc-700 bg-zinc-900 text-zinc-200"
                    : "border-zinc-900 bg-black text-zinc-600"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void toggleKeyword(item)}
                  title={item.is_active ? "停用这个字眼" : "启用这个字眼"}
                  className="transition hover:text-white"
                >
                  {item.keyword}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteKeyword(item.id)}
                  title={`删除“${item.keyword}”`}
                  aria-label={`删除“${item.keyword}”`}
                  className="text-zinc-600 transition hover:text-red-300"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {keywords.length === 0 && (
              <p className="py-2 text-sm text-zinc-600">词库目前是空的。</p>
            )}
          </div>

          <div className="mt-5 flex flex-col items-start justify-between gap-3 border-t border-zinc-900 pt-4 sm:flex-row sm:items-center">
            <p className="text-xs leading-5 text-zinc-600">
              修改词库不会悄悄改动旧评论；重新检测时才会更新现有待检查清单。
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={() => void rescanComments()}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-zinc-800 px-4 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              重新检测现有评论
            </button>
          </div>
        </>
      ) : (
        <p className="mt-5 text-sm text-zinc-500">
          你可以处理异常评论；只有 Owner 与 Admin 可以修改检测词库。
        </p>
      )}

      {message && <p className="mt-4 text-sm text-amber-200/80">{message}</p>}
    </section>
  );
}
