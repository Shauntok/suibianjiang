import { readFile } from "node:fs/promises";

import { ImageResponse } from "next/og";

import type { ShareCardData } from "@/lib/server/share-card";

const notoSansSc = readFile(
  new URL("../../assets/fonts/NotoSansSC-VF.ttf", import.meta.url),
);

export async function renderShareCardImage(data: ShareCardData) {
  const path = new URL(data.canonicalUrl).pathname;
  const font = await notoSansSc;

  return new ImageResponse(
    <div
      style={{
        position: "relative",
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        background: "#030304",
        color: "#f7f4ff",
        padding: "104px 92px",
        fontFamily: "Noto Sans SC",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "radial-gradient(ellipse 78% 42% at 84% 10%, rgba(123, 85, 190, 0.16) 0%, rgba(75, 47, 125, 0.07) 46%, rgba(3, 3, 4, 0) 78%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "radial-gradient(ellipse 88% 46% at 12% 88%, rgba(104, 72, 160, 0.13) 0%, rgba(58, 38, 92, 0.06) 48%, rgba(3, 3, 4, 0) 80%)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 30,
            color: "rgba(255, 255, 255, 0.62)",
          }}
        >
          <span style={{ display: "flex" }}>▱</span>
          <span style={{ display: "flex" }}>小时代</span>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 190,
            fontSize: 24,
            letterSpacing: 8,
            color: "rgba(216, 201, 255, 0.55)",
          }}
        >
          {data.type === "article" ? "文章故事" : "深夜日记"}
        </div>

        <div
          style={{
            marginTop: 38,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
            overflow: "hidden",
            fontSize: 76,
            lineHeight: 1.28,
            fontWeight: 400,
          }}
        >
          {data.title}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 34,
            fontSize: 29,
            color: "rgba(255, 255, 255, 0.5)",
          }}
        >
          由 {data.authorName} 留下
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 96,
            width: 116,
            height: 2,
            background: "rgba(195, 166, 255, 0.45)",
          }}
        />

        <div
          style={{
            marginTop: 54,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 6,
            overflow: "hidden",
            fontSize: 38,
            lineHeight: 1.75,
            color: "rgba(255, 255, 255, 0.72)",
          }}
        >
          {data.excerpt || "这一页的故事，正安静地留在小时代。"}
        </div>
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          fontSize: 24,
          color: "rgba(255, 255, 255, 0.34)",
        }}
      >
        <span style={{ display: "flex" }}>ourlittleage.com</span>
        <span
          style={{
            display: "flex",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {path}
        </span>
      </div>
    </div>,
    {
      width: 1080,
      height: 1920,
      fonts: [
        {
          name: "Noto Sans SC",
          data: font,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );
}
