import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FeedbackPage from "@/app/feedback/page";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

describe("feedback and sponsorship form", () => {
  it("keeps the existing feedback fields by default", () => {
    render(<FeedbackPage />);

    expect(screen.getByRole("heading", { name: "意见反馈" })).toBeInTheDocument();
    expect(screen.getByLabelText("反馈标题")).toBeInTheDocument();
    expect(screen.queryByLabelText("联系 Email")).not.toBeInTheDocument();
  });

  it("shows cooperation-specific fields and copy when sponsorship is selected", () => {
    render(<FeedbackPage />);

    fireEvent.change(screen.getByLabelText("提交类型"), {
      target: { value: "sponsorship" },
    });

    expect(screen.getByRole("heading", { name: "业配合作" })).toBeInTheDocument();
    expect(screen.getByLabelText("合作方或品牌名称")).toBeInTheDocument();
    expect(screen.getByLabelText("联系人姓名")).toBeInTheDocument();
    expect(screen.getByLabelText("联系 Email")).toBeRequired();
    expect(screen.getByLabelText("国家或地区")).toHaveValue("MY");
    expect(screen.getByLabelText("手机号码")).toHaveAttribute(
      "placeholder",
      "例如：012-345 6789"
    );
    expect(screen.getByLabelText("合作主题")).toBeInTheDocument();
    expect(screen.getByLabelText("合作方案")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "提交合作申请" })
    ).toBeInTheDocument();
  });
});
