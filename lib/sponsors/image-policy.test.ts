// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/admin/sponsors/upload/route";
import {
  createSponsorImagePath,
  readBoundedMultipart,
  SPONSOR_IMAGE_MAX_BYTES,
  SPONSOR_UPLOAD_REQUEST_LIMIT,
  validateSponsorImage,
  validateSponsorUploadFields,
} from "@/lib/sponsors/image-policy";

const authMocks = vi.hoisted(() => ({
  canManageSponsors: vi.fn((role: unknown) =>
    role === "owner" || role === "admin"
  ),
  getAdminActor: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/lib/admin/authorization", () => authMocks);
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    storage: {
      from: storageMocks.from,
    },
  },
}));

const campaignId = "c0000000-0000-4000-8000-000000000001";
const pngBytes = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const jpegBytes = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9,
]);
const webpBytes = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.getAdminActor.mockResolvedValue({ id: "actor-1", role: "owner" });
  storageMocks.upload.mockResolvedValue({ data: { path: "saved" }, error: null });
  storageMocks.remove.mockResolvedValue({ data: [], error: null });
  storageMocks.getPublicUrl.mockImplementation((path: string) => ({
    data: {
      publicUrl: `https://cdn.ourlittleage.test/storage/v1/object/public/images/${path}`,
    },
  }));
  storageMocks.from.mockReturnValue({
    getPublicUrl: storageMocks.getPublicUrl,
    remove: storageMocks.remove,
    upload: storageMocks.upload,
  });
});

describe("validateSponsorImage", () => {
  it.each([
    ["photo.jpg", "image/jpeg", jpegBytes, "jpg"],
    ["photo.jpeg", "image/jpeg", jpegBytes, "jpg"],
    ["photo.png", "image/png", pngBytes, "png"],
    ["photo.webp", "image/webp", webpBytes, "webp"],
  ] as const)(
    "accepts a byte-valid %s and derives the server extension",
    async (name, mediaType, bytes, extension) => {
      const file = new File([bytes], name, { type: mediaType });

      await expect(validateSponsorImage(file)).resolves.toEqual({
        extension,
        file,
        mediaType,
        size: bytes.byteLength,
      });
    }
  );

  it.each([
    ["empty files", new File([], "empty.png", { type: "image/png" }), 400],
    [
      "SVG files",
      new File(["<svg></svg>"], "art.svg", { type: "image/svg+xml" }),
      400,
    ],
    [
      "GIF files",
      new File(["GIF89a"], "motion.gif", { type: "image/gif" }),
      400,
    ],
    [
      "executable MIME types",
      new File(["MZ"], "program.exe", {
        type: "application/x-msdownload",
      }),
      400,
    ],
    [
      "unknown MIME types",
      new File([pngBytes], "photo.bin", {
        type: "application/octet-stream",
      }),
      400,
    ],
    [
      "MIME and signature mismatches",
      new File([jpegBytes], "photo.png", { type: "image/png" }),
      400,
    ],
    [
      "filename extension and media mismatches",
      new File([pngBytes], "photo.jpg", { type: "image/png" }),
      400,
    ],
    [
      "truncated PNG signatures",
      new File([pngBytes.slice(0, 7)], "photo.png", { type: "image/png" }),
      400,
    ],
    [
      "truncated WebP signatures",
      new File([webpBytes.slice(0, 11)], "photo.webp", {
        type: "image/webp",
      }),
      400,
    ],
  ])("rejects %s", async (_label, file, status) => {
    await expect(validateSponsorImage(file)).rejects.toMatchObject({
      name: "SponsorImagePolicyError",
      status,
    });
  });

  it("rejects a file one byte over 5 MiB", async () => {
    const file = new File(
      [pngBytes, new Uint8Array(SPONSOR_IMAGE_MAX_BYTES + 1 - pngBytes.length)],
      "too-large.png",
      { type: "image/png" }
    );

    await expect(validateSponsorImage(file)).rejects.toMatchObject({
      name: "SponsorImagePolicyError",
      status: 413,
    });
  });
});

describe("sponsor upload field and path policy", () => {
  it("accepts only UUID campaign ids and known placements", () => {
    expect(
      validateSponsorUploadFields(campaignId, "article_inline")
    ).toEqual({ campaignId, placement: "article_inline" });

    expect(() =>
      validateSponsorUploadFields("../../resident-image", "article_inline")
    ).toThrowError(expect.objectContaining({ status: 400 }));
    expect(() =>
      validateSponsorUploadFields(campaignId, "unknown_placement")
    ).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it("generates an unguessable server path with the validated extension", () => {
    const path = createSponsorImagePath(campaignId, "desktop_right", "webp");

    expect(path).toMatch(
      /^sponsors\/c0000000-0000-4000-8000-000000000001\/desktop_right\/[0-9a-f-]{36}\.webp$/
    );
    expect(path).not.toContain("resident-image");
  });
});

describe("readBoundedMultipart", () => {
  it("cancels the body as soon as the total request crosses the bound", async () => {
    const cancel = vi.fn();
    const chunks = [new Uint8Array(6), new Uint8Array(6), new Uint8Array(6)];
    const body = streamBody(chunks, cancel);
    const request = new Request(
      "https://ourlittleage.test/api/admin/sponsors/upload",
      {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=test" },
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" }
    );

    await expect(readBoundedMultipart(request, 10)).rejects.toMatchObject({
      name: "SponsorImagePolicyError",
      status: 413,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe("POST /api/admin/sponsors/upload", () => {
  it("rejects cross-origin requests before authentication or body reads", async () => {
    const request = streamingUploadRequest(pngBytes, {
      origin: "https://attacker.test",
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(authMocks.getAdminActor).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it("authenticates before reading multipart bytes", async () => {
    authMocks.getAdminActor.mockResolvedValue(null);
    const request = streamingUploadRequest(pngBytes);

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(request.bodyUsed).toBe(false);
    expect(storageMocks.upload).not.toHaveBeenCalled();
  });

  it("authorizes Owner/Admin before reading multipart bytes", async () => {
    authMocks.getAdminActor.mockResolvedValue({
      id: "moderator-1",
      role: "moderator",
    });
    const request = streamingUploadRequest(pngBytes);

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(request.bodyUsed).toBe(false);
    expect(storageMocks.upload).not.toHaveBeenCalled();
  });

  it("rejects a declared oversized request without consuming its body", async () => {
    const request = streamingUploadRequest(pngBytes, {
      contentLength: String(SPONSOR_UPLOAD_REQUEST_LIMIT + 1),
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
    expect(storageMocks.upload).not.toHaveBeenCalled();
  });

  it("uploads to the existing images bucket without overwrite", async () => {
    const response = await POST(streamingUploadRequest(pngBytes));
    const body = await response.json();
    const uploadedPath = storageMocks.upload.mock.calls[0]?.[0] as string;

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(storageMocks.from).toHaveBeenCalledWith("images");
    expect(uploadedPath).toMatch(
      /^sponsors\/c0000000-0000-4000-8000-000000000001\/article_inline\/[0-9a-f-]{36}\.png$/
    );
    expect(storageMocks.upload).toHaveBeenCalledWith(
      uploadedPath,
      expect.anything(),
      { contentType: "image/png", upsert: false }
    );
    expect(body).toEqual({
      path: uploadedPath,
      publicUrl: `https://cdn.ourlittleage.test/storage/v1/object/public/images/${uploadedPath}`,
    });
    expect(storageMocks.remove).not.toHaveBeenCalled();
  });

  it("removes exactly the new object when a post-upload operation fails", async () => {
    storageMocks.getPublicUrl.mockImplementationOnce(() => {
      throw new Error("service key and storage internals must stay private");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(streamingUploadRequest(pngBytes));
    const body = await response.json();
    const uploadedPath = storageMocks.upload.mock.calls[0]?.[0] as string;

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({ error: "Unable to upload sponsor image." });
    expect(storageMocks.remove).toHaveBeenCalledOnce();
    expect(storageMocks.remove).toHaveBeenCalledWith([uploadedPath]);
    expect(uploadedPath).toMatch(/^sponsors\//);
    consoleError.mockRestore();
  });
});

function streamingUploadRequest(
  fileBytes: Uint8Array,
  options: {
    contentLength?: string;
    origin?: string;
  } = {}
): Request {
  const boundary = "our-little-age-sponsor-boundary";
  const encoder = new TextEncoder();
  const prefix = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="campaignId"\r\n\r\n` +
      `${campaignId}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="placement"\r\n\r\n` +
      `article_inline\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="photo.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`
  );
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
  const headers = new Headers({
    "content-type": `multipart/form-data; boundary=${boundary}`,
    origin: options.origin ?? "https://ourlittleage.test",
  });

  if (options.contentLength) {
    headers.set("content-length", options.contentLength);
  }

  return new Request("https://ourlittleage.test/api/admin/sponsors/upload", {
    method: "POST",
    headers,
    body: streamBody([prefix, fileBytes, suffix]),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function streamBody(
  chunks: Uint8Array[],
  cancel?: (reason?: unknown) => void
): ReadableStream<Uint8Array> {
  const pendingChunks = [...chunks];

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = pendingChunks.shift();

      if (chunk) {
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
    cancel,
  });
}
