import type { CommentFilter } from "./types";

type Props = {
  filter: CommentFilter;
  setFilter: (filter: CommentFilter) => void;
};

export default function CommentFilters({ filter, setFilter }: Props) {
  const tabs = [
    {
      key: "today",
      label: "今日新增",
    },
    {
      key: "flagged",
      label: "待检查",
    },
    {
      key: "active",
      label: "正常评论",
    },
    {
      key: "hidden",
      label: "已隐藏",
    },
    {
      key: "deleted",
      label: "已删除",
    },
  ] as const;

  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((item) => (
        <button
          key={item.key}
          onClick={() => setFilter(item.key)}
          className={
            filter === item.key
              ? "rounded-full border border-white bg-white px-5 py-3 text-sm font-semibold text-black transition"
              : "rounded-full border border-zinc-800 bg-zinc-950 px-5 py-3 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-white"
          }
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
