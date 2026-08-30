import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PostViewTracker from "./PostViewTracker";

const fetchMock = vi.fn();

describe("PostViewTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setDocumentVisibility("visible");
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("submits once at ten visible seconds and never loops", async () => {
    render(<PostViewTracker postId={140} eligible />);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/post-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({ postId: 140 }),
    });

    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pauses hidden time and resumes only the remaining visible time", async () => {
    render(<PostViewTracker postId={140} eligible />);

    await vi.advanceTimersByTimeAsync(6_000);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled();

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(3_999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits for ten visible seconds when mounted while hidden", async () => {
    setDocumentVisibility("hidden");
    render(<PostViewTracker postId={140} eligible />);

    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1_000);
    expect(fetchMock).not.toHaveBeenCalled();

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not register or submit when ineligible", async () => {
    const addEventListener = vi.spyOn(document, "addEventListener");

    render(<PostViewTracker postId={140} eligible={false} />);
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1_000);

    expect(addEventListener).not.toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cleans up before qualification without submitting", async () => {
    const removeEventListener = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<PostViewTracker postId={140} eligible />);

    await vi.advanceTimersByTimeAsync(9_999);
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    setVisibility("hidden");
    setVisibility("visible");

    expect(removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps accumulated time across a stable rerender", async () => {
    const { rerender } = render(<PostViewTracker postId={140} eligible />);

    await vi.advanceTimersByTimeAsync(6_000);
    rerender(<PostViewTracker postId={140} eligible />);
    await vi.advanceTimersByTimeAsync(4_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires a fresh ten visible seconds when the post changes before submission", async () => {
    const { rerender } = render(<PostViewTracker postId={140} eligible />);

    await vi.advanceTimersByTimeAsync(6_000);
    setVisibility("hidden");
    rerender(<PostViewTracker postId={141} eligible />);
    setVisibility("visible");

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ postId: 141 });
  });

  it("qualifies a new post independently after the prior post submitted", async () => {
    const { rerender } = render(<PostViewTracker postId={140} eligible />);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender(<PostViewTracker postId={141} eligible />);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ postId: 141 });
  });

  it("starts fresh after eligibility is disabled and restored", async () => {
    const { rerender } = render(<PostViewTracker postId={140} eligible />);

    await vi.advanceTimersByTimeAsync(6_000);
    setVisibility("hidden");
    rerender(<PostViewTracker postId={140} eligible={false} />);
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(<PostViewTracker postId={140} eligible />);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves checkpoints without counting a delayed hidden interval", async () => {
    render(<PostViewTracker postId={140} eligible />);

    await vi.advanceTimersByTimeAsync(6_000);
    setDocumentVisibility("hidden");
    await vi.advanceTimersByTimeAsync(4_000);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent(document, new Event("visibilitychange"));
    setVisibility("visible");

    await vi.advanceTimersByTimeAsync(3_999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a rejected request", () => Promise.reject(new Error("offline"))],
    ["a non-OK response", () => Promise.resolve(new Response(null, { status: 500 }))],
  ])("keeps %s silent without retrying", async (_name, response) => {
    fetchMock.mockImplementationOnce(response);
    const { container } = render(<PostViewTracker postId={140} eligible />);

    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });
});

function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

function setVisibility(state: DocumentVisibilityState) {
  setDocumentVisibility(state);
  fireEvent(document, new Event("visibilitychange"));
}
