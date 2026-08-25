import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AdminSidebar from "./AdminSidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/feedback",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => {
  const query = {
    select: vi.fn(),
    neq: vi.fn(),
    eq: vi.fn(),
    then: (resolve: (value: { count: number }) => unknown) =>
      Promise.resolve({ count: 0 }).then(resolve),
  };

  query.select.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.eq.mockReturnValue(query);

  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: vi.fn().mockReturnValue(query),
    },
  };
});

afterEach(cleanup);

describe("AdminSidebar desktop layout", () => {
  it("stays compact and scrollable inside the viewport", () => {
    render(<AdminSidebar />);

    const sidebar = screen.getByTestId("admin-sidebar-desktop");
    const panel = screen.getByTestId("admin-sidebar-desktop-panel");

    expect(sidebar).toHaveClass("lg:top-4");
    expect(panel).toHaveClass("max-h-[calc(100vh-2rem)]", "overflow-y-auto", "w-52");
    expect(screen.getAllByText("回首页").length).toBeGreaterThan(0);
  });
});
