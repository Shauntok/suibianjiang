import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RoomAvatarEditor from "@/components/RoomAvatarEditor";

const {
  getUser,
  upload,
  getPublicUrl,
  update,
  eq,
  toastSuccess,
  toastError,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser },
    storage: {
      from: vi.fn(() => ({ upload, getPublicUrl })),
    },
    from: vi.fn(() => ({ update })),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

describe("RoomAvatarEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://cdn.test/new-avatar.jpg" },
    });
    eq.mockResolvedValue({ error: null });
    update.mockReturnValue({ eq });
  });

  it("keeps another resident's avatar non-interactive", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "visitor-id" } },
      error: null,
    });

    render(
      <RoomAvatarEditor
        profileId="owner-id"
        username="小卓"
        initialAvatarUrl="https://cdn.test/old-avatar.jpg"
      />
    );

    await waitFor(() => {
      expect(getUser).toHaveBeenCalled();
    });

    expect(
      screen.queryByRole("button", { name: "更换头像" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "小卓的头像" })).toBeVisible();
  });

  it("lets the room owner upload a new avatar from the room", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "owner-id" } },
      error: null,
    });

    render(
      <RoomAvatarEditor
        profileId="owner-id"
        username="小卓"
        initialAvatarUrl="https://cdn.test/old-avatar.jpg"
      />
    );

    const button = await screen.findByRole("button", { name: "更换头像" });
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    fireEvent.click(button);

    const input = screen.getByLabelText("选择新的头像照片");
    const file = new File(["avatar"], "new avatar.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(upload).toHaveBeenCalledWith(
        expect.stringMatching(/^owner-id\/\d+-new-avatar\.jpg$/),
        file,
        { upsert: true }
      );
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar_url: "https://cdn.test/new-avatar.jpg",
      })
    );
    expect(eq).toHaveBeenCalledWith("id", "owner-id");
    expect(
      await screen.findByRole("img", { name: "小卓的头像" })
    ).toHaveAttribute("src", "https://cdn.test/new-avatar.jpg");
    expect(toastSuccess).toHaveBeenCalledWith("头像已更新。");
  });

  it("keeps the old avatar when uploading fails", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "owner-id" } },
      error: null,
    });
    upload.mockResolvedValue({ error: new Error("upload failed") });

    render(
      <RoomAvatarEditor
        profileId="owner-id"
        username="小卓"
        initialAvatarUrl="https://cdn.test/old-avatar.jpg"
      />
    );

    await screen.findByRole("button", { name: "更换头像" });
    const input = screen.getByLabelText("选择新的头像照片");
    fireEvent.change(input, {
      target: {
        files: [new File(["avatar"], "avatar.jpg", { type: "image/jpeg" })],
      },
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("暂时无法更新头像，请稍后再试。");
    });

    expect(screen.getByRole("img", { name: "小卓的头像" })).toHaveAttribute(
      "src",
      "https://cdn.test/old-avatar.jpg"
    );
  });
});
