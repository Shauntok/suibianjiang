import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
  },
}));

import UserTotalViewsValue from "./UserTotalViewsValue";

const fetchMock = vi.fn();
const userId = "973ca71a-0b4b-4756-82b7-75062e22df9a";

describe("UserTotalViewsValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "admin-access-token" } },
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ totalEffectiveViews: 12_438 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a loading state before the exact total arrives", () => {
    mocks.getSession.mockReturnValue(new Promise(() => {}));

    render(<UserTotalViewsValue userId={userId} />);

    expect(screen.getByText("读取中...")).toBeInTheDocument();
  });

  it("loads and formats the resident's exact effective view total", async () => {
    render(<UserTotalViewsValue userId={userId} />);

    expect(await screen.findByText("12,438 次")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/users/${userId}/view-count`,
      expect.objectContaining({
        headers: { Authorization: "Bearer admin-access-token" },
        cache: "no-store",
      })
    );
  });

  it.each([
    ["missing session", { session: null }, null],
    ["failed response", { session: { access_token: "token" } }, new Response(null, { status: 500 })],
    [
      "malformed total",
      { session: { access_token: "token" } },
      new Response(JSON.stringify({ totalEffectiveViews: -1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ],
  ])("shows unavailable for a %s", async (_name, sessionData, response) => {
    mocks.getSession.mockResolvedValue({ data: sessionData });
    if (response) fetchMock.mockResolvedValue(response);

    render(<UserTotalViewsValue userId={userId} />);

    await waitFor(() => {
      expect(screen.getByText("阅读数据暂不可用")).toBeInTheDocument();
    });
    expect(screen.queryByText("0 次")).not.toBeInTheDocument();
  });
});
