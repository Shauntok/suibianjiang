"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type ViewTotalState =
  | { status: "loading" }
  | { status: "available"; total: number }
  | { status: "unavailable" };

export default function UserTotalViewsValue({ userId }: { userId: string }) {
  const [state, setState] = useState<ViewTotalState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadTotal() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error("Admin session unavailable");
        }

        const response = await fetch(
          `/api/admin/users/${encodeURIComponent(userId)}/view-count`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error("Unable to load resident view total");
        }

        const body: unknown = await response.json();
        const total = readTotal(body);

        if (active) {
          setState({ status: "available", total });
        }
      } catch {
        if (active && !controller.signal.aborted) {
          setState({ status: "unavailable" });
        }
      }
    }

    void loadTotal();

    return () => {
      active = false;
      controller.abort();
    };
  }, [userId]);

  if (state.status === "loading") return <>读取中...</>;
  if (state.status === "unavailable") return <>阅读数据暂不可用</>;

  return (
    <>
      {new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: 0,
      }).format(state.total)}{" "}
      次
    </>
  );
}

function readTotal(body: unknown): number {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid resident view total response");
  }

  const total = (body as { totalEffectiveViews?: unknown })
    .totalEffectiveViews;

  if (
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    throw new Error("Invalid resident view total response");
  }

  return total;
}
