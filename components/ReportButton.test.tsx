import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ReportButton from "@/components/ReportButton";

vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

describe("ReportButton mobile width", () => {
  it("fills half of the mobile action grid without changing desktop width", () => {
    render(
      <ReportButton
        targetType="post"
        targetId={10}
        compact
        mobileFullWidth
      />
    );

    const reportButton = screen.getByRole("button", { name: "举报" });
    expect(reportButton).toHaveClass("w-full", "md:w-auto");
    expect(reportButton.parentElement).toHaveClass("w-full", "md:w-auto");
  });
});
