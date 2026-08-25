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
    single: vi.fn().mockResolvedValue({ data: { role: "admin" } }),
    then: (resolve: (value: { count: number }) => unknown) =>
      Promise.resolve({ count: 0 }).then(resolve),
  };

  query.select.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.eq.mockReturnValue(query);

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } } }),
      },
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

  it("shows a separate sponsorship inquiry destination for admins", async () => {
    render(<AdminSidebar />);

    expect(await screen.findAllByText("业配中心")).not.toHaveLength(0);
    const links = await screen.findAllByRole("link", { name: /合作申请/ });
    expect(links[0]).toHaveAttribute("href", "/admin/sponsors/inquiries");
  });
});
