import { NextResponse } from "next/server";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  VIEWER_COOKIE_NAME,
  createViewerIdentity,
} from "@/lib/views/viewer-identity";
import { recordEffectivePostView } from "@/lib/views/service";

const MAX_BODY_BYTES = 1024;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };
const bodySchema = z
  .object({
    postId: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

class BodyTooLargeError extends Error {}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return jsonResponse({ error: "Invalid request" }, 403);
  }

  if (readMediaType(request) !== "application/json") {
    return jsonResponse({ error: "Invalid request" }, 415);
  }

  let body: unknown;
  try {
    const bodyText = await readBoundedBody(request, MAX_BODY_BYTES);
    body = JSON.parse(bodyText);
  } catch (error) {
    return jsonResponse(
      { error: "Invalid request" },
      error instanceof BodyTooLargeError ? 413 : 400
    );
  }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  try {
    const secret = process.env.VIEWER_ID_SECRET;
    if (!secret) throw new Error("Viewer identity secret is unavailable");

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError && !isAuthSessionMissingError(authError)) throw authError;
    const userId = user?.id ?? null;
    const identity = createViewerIdentity({
      userId,
      cookieValue: readCookie(request, VIEWER_COOKIE_NAME),
      secret,
    });

    await recordEffectivePostView({
      postId: parsedBody.data.postId,
      viewerHash: identity.viewerHash,
      userId,
    });

    const response = jsonResponse({ ok: true }, 200);
    if (identity.cookieValue !== undefined) {
      response.cookies.set(VIEWER_COOKIE_NAME, identity.cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch {
    return jsonResponse({ error: "Unable to record post view" }, 500);
  }
}

function jsonResponse(body: object, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function readMediaType(request: Request) {
  return request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
}

async function readBoundedBody(request: Request, maximumBytes: number) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength)) {
    if (Number(contentLength) > maximumBytes) throw new BodyTooLargeError();
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;

  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }

  return undefined;
}
