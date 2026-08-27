import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { query, refresh } = vi.hoisted(() => ({
  query: { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), in: vi.fn(), then: vi.fn() },
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(() => query) } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import PublicDiaryPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [query.select, query.eq, query.is, query.in]) method.mockReturnValue(query);
  query.then.mockImplementation((resolve) => resolve({ data: [], error: null }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows a retryable loading error instead of claiming diaries are empty", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  query.order.mockResolvedValue({ data: null, error: { message: "fetch failed", details: "EACCES" } });
  render(await PublicDiaryPage());
  expect(screen.getByRole("alert")).toHaveTextContent("日记暂时加载失败");
  expect(screen.queryByText("今晚还没有人留下日记。")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  expect(refresh).toHaveBeenCalledOnce();
});

it("keeps the original empty state only for a successful empty query", async () => {
  query.order.mockResolvedValue({ data: [], error: null });
  render(await PublicDiaryPage());
  expect(screen.getByText("今晚还没有人留下日记。")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("still shows published public diaries using their ID routes", async () => {
  query.order.mockResolvedValue({ data: [{ id: 131, content: "这一页还在。", author_id: "resident", published_at: "2026-07-03T03:09:12Z" }], error: null });
  render(await PublicDiaryPage());
  expect(screen.getByText("这一页还在。")).toBeVisible();
  expect(screen.getByRole("link", { name: /翻开这一天/ })).toHaveAttribute("href", "/diary/131");
  expect(query.eq).toHaveBeenCalledWith("visibility", "public");
  expect(query.eq).toHaveBeenCalledWith("status", "published");
  expect(query.is).toHaveBeenCalledWith("deleted_at", null);
});
