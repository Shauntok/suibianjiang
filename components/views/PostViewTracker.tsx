"use client";

import { useEffect, useRef } from "react";

const REQUIRED_VISIBLE_MS = 10_000;
const CHECKPOINT_MS = 1_000;

type PostViewTrackerProps = {
  postId: number;
  eligible: boolean;
};

export default function PostViewTracker({
  postId,
  eligible,
}: PostViewTrackerProps) {
  const accumulatedMsRef = useRef(0);
  const visibleSinceRef = useRef<number | null>(null);
  const submittedRef = useRef(false);
  const timerIdRef = useRef<number | null>(null);

  useEffect(() => {
    accumulatedMsRef.current = 0;
    visibleSinceRef.current = null;
    submittedRef.current = false;
    timerIdRef.current = null;

    if (!eligible) return;

    const clearTimer = () => {
      if (timerIdRef.current === null) return;
      window.clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    };

    const commitVisibleTime = () => {
      if (visibleSinceRef.current === null) return;
      accumulatedMsRef.current += Math.max(
        0,
        performance.now() - visibleSinceRef.current
      );
      visibleSinceRef.current = null;
    };

    const submit = () => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      clearTimer();

      void fetch("/api/post-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({ postId }),
      }).catch(() => undefined);
    };

    const schedule = () => {
      if (
        submittedRef.current ||
        timerIdRef.current !== null ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      if (visibleSinceRef.current === null) {
        visibleSinceRef.current = performance.now();
      }

      const remainingMs = Math.max(
        0,
        REQUIRED_VISIBLE_MS - accumulatedMsRef.current
      );
      timerIdRef.current = window.setTimeout(() => {
        timerIdRef.current = null;
        if (document.visibilityState !== "visible") {
          visibleSinceRef.current = null;
          return;
        }

        commitVisibleTime();
        if (accumulatedMsRef.current >= REQUIRED_VISIBLE_MS) submit();
        else schedule();
      }, Math.min(remainingMs, CHECKPOINT_MS));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        schedule();
        return;
      }

      visibleSinceRef.current = null;
      clearTimer();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();

    return () => {
      clearTimer();
      visibleSinceRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [eligible, postId]);

  return null;
}
