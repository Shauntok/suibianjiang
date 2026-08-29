import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const VIEWER_COOKIE_NAME = "ola_viewer";

export type ViewerIdentity = {
  viewerHash: string;
  cookieValue?: string;
};

type ViewerIdentityInput = {
  userId: string | null;
  cookieValue: string | undefined;
  secret: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function digest(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function signCookie(secret: string, anonymousId: string) {
  return createHmac("sha256", secret)
    .update(`cookie:${anonymousId}`)
    .digest("base64url");
}

function readAnonymousId(cookieValue: string | undefined, secret: string) {
  if (cookieValue === undefined) return null;

  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;

  const [anonymousId, signature] = parts;
  if (
    !UUID_PATTERN.test(anonymousId) ||
    !SIGNATURE_PATTERN.test(signature)
  ) {
    return null;
  }

  const expectedSignature = signCookie(secret, anonymousId);
  const received = Buffer.from(signature, "ascii");
  const expected = Buffer.from(expectedSignature, "ascii");

  return timingSafeEqual(received, expected) ? anonymousId : null;
}

export function createViewerIdentity(
  input: ViewerIdentityInput
): ViewerIdentity {
  if (input.secret.length < 32) {
    throw new Error("Viewer identity secret must be at least 32 characters");
  }

  if (input.userId !== null) {
    return {
      viewerHash: digest(input.secret, `resident:${input.userId}`),
    };
  }

  const existingAnonymousId = readAnonymousId(
    input.cookieValue,
    input.secret
  );
  if (existingAnonymousId !== null) {
    return {
      viewerHash: digest(
        input.secret,
        `visitor:${existingAnonymousId}`
      ),
    };
  }

  const anonymousId = randomUUID();
  return {
    viewerHash: digest(input.secret, `visitor:${anonymousId}`),
    cookieValue: `${anonymousId}.${signCookie(input.secret, anonymousId)}`,
  };
}
