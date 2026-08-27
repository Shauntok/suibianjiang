import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LandingClient from "./LandingClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

function resize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  fireEvent(window, new Event("resize"));
}

function layoutHeight() {
  return screen.getByRole("main").style.getPropertyValue("--landing-height");
}

function loginInput(placeholder: string) {
  return screen.getAllByPlaceholderText(placeholder)[0];
}

describe("mobile login viewport", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    resize(400, 858);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the document layout stable when a keyboard reduces the viewport height", () => {
    render(<LandingClient />);
    expect(layoutHeight()).toBe("858px");

    fireEvent.focus(loginInput("邮箱"));
    resize(400, 420);
    expect(layoutHeight()).toBe("858px");

    fireEvent.blur(loginInput("邮箱"));
    fireEvent.focus(loginInput("密码"));
    resize(400, 380);
    expect(layoutHeight()).toBe("858px");

    fireEvent.blur(loginInput("密码"));
    resize(400, 858);
    expect(layoutHeight()).toBe("858px");
  });

  it("preserves typed credentials without forcing scrolling on focus or resize", () => {
    render(<LandingClient />);
    vi.mocked(window.scrollTo).mockClear();
    fireEvent.change(loginInput("邮箱"), { target: { value: "test@example.com" } });
    resize(400, 420);
    fireEvent.focus(loginInput("密码"));
    fireEvent.change(loginInput("密码"), { target: { value: "example-only" } });
    resize(400, 858);

    expect(loginInput("邮箱")).toHaveValue("test@example.com");
    expect(loginInput("密码")).toHaveValue("example-only");
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("recalculates after a width change instead of keeping a portrait height in landscape", () => {
    render(<LandingClient />);
    resize(740, 360);
    expect(layoutHeight()).toBe("360px");
    resize(400, 858);
    expect(layoutHeight()).toBe("858px");
  });

  it("does not apply a fixed viewport height on desktop", () => {
    resize(1440, 900);
    render(<LandingClient />);
    expect(layoutHeight()).toBe("");
    resize(1440, 700);
    expect(layoutHeight()).toBe("");
  });

  it("clears the mobile override when switching to a desktop width", () => {
    render(<LandingClient />);
    expect(layoutHeight()).toBe("858px");
    resize(1024, 768);
    expect(layoutHeight()).toBe("");
    resize(400, 858);
    expect(layoutHeight()).toBe("858px");
  });

  it("removes its resize listener on unmount", () => {
    const { unmount } = render(<LandingClient />);
    const main = screen.getByRole("main");
    expect(layoutHeight()).toBe("858px");
    unmount();
    resize(740, 360);
    expect(main.style.getPropertyValue("--landing-height")).toBe("858px");
  });
});
