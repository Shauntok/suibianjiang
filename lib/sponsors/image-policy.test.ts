// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { deflateSync } from "node:zlib";

import * as uploadRoute from "@/app/api/admin/sponsors/upload/route";
import * as imagePolicy from "@/lib/sponsors/image-policy";

const { POST } = uploadRoute;
const DELETE = (
  uploadRoute as unknown as {
    DELETE?: (request: Request) => Promise<Response>;
  }
).DELETE;
const {
  createSponsorImagePath,
  readBoundedMultipart,
  SPONSOR_IMAGE_MAX_BYTES,
  SPONSOR_UPLOAD_REQUEST_LIMIT,
  validateSponsorImage,
  validateSponsorUploadFields,
} = imagePolicy;
const validateSponsorImagePath = (
  imagePolicy as unknown as {
    validateSponsorImagePath?: (value: unknown) => string;
  }
).validateSponsorImagePath;

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
const pngBytes = createPng();
const jpegBytes = createJpeg();
const webpBytes = createWebP(
  "VP8L",
  Uint8Array.from([0x2f, 0x00, 0x00, 0x00, 0x00, 0x00])
);
const generatedImageId = "90000000-0000-4000-8000-000000000002";
const validSponsorPath =
  `sponsors/${campaignId}/article_inline/${generatedImageId}.png`;

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
      const file = fileFromBytes(bytes, name, mediaType);

      await expect(validateSponsorImage(file)).resolves.toEqual({
        extension,
        file,
        mediaType,
        size: bytes.byteLength,
      });
    }
  );

  it.each([
    [
      "a PNG signature without chunks",
      fileFromBytes(
        pngBytes.slice(0, 8),
        "signature-only.png",
        "image/png"
      ),
    ],
    [
      "a PNG without its IEND chunk",
      fileFromBytes(pngBytes.slice(0, -12), "missing-iend.png", "image/png"),
    ],
    [
      "a PNG chunk whose declared length overruns the file",
      fileFromBytes(pngWithOverrunningFirstChunk(), "overrun.png", "image/png"),
    ],
    [
      "a JPEG signature without SOF dimensions or EOI",
      fileFromBytes(
        Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]),
        "signature-only.jpg",
        "image/jpeg"
      ),
    ],
    [
      "a JPEG with a truncated marker segment",
      fileFromBytes(
        Uint8Array.from([
          0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00, 0xff, 0xd9,
        ]),
        "truncated.jpg",
        "image/jpeg"
      ),
    ],
    [
      "a JPEG without EOI termination",
      fileFromBytes(jpegBytes.slice(0, -2), "missing-eoi.jpg", "image/jpeg"),
    ],
    [
      "a JPEG whose scan precedes its frame dimensions",
      fileFromBytes(jpegWithScanBeforeFrame(), "out-of-order.jpg", "image/jpeg"),
    ],
    [
      "a WebP whose RIFF size does not match the file",
      fileFromBytes(webPWithMismatchedRiffSize(), "bad-riff.webp", "image/webp"),
    ],
    [
      "a WebP without a recognized image chunk",
      fileFromBytes(
        createWebP("JUNK", new Uint8Array(4)),
        "unknown.webp",
        "image/webp"
      ),
    ],
    [
      "a WebP chunk whose declared length overruns the RIFF payload",
      fileFromBytes(webPWithOverrunningChunk(), "overrun.webp", "image/webp"),
    ],
    [
      "a WebP with only a VP8X extended header",
      fileFromBytes(
        createWebP("VP8X", new Uint8Array(10)),
        "header-only-extended.webp",
        "image/webp"
      ),
    ],
    [
      "an unsupported extended WebP even when it has image content",
      fileFromBytes(
        createWebPFromChunks([
          ["VP8X", new Uint8Array(10)],
          ["VP8L", webpBytes.slice(20, 26)],
        ]),
        "extended.webp",
        "image/webp"
      ),
    ],
    [
      "a VP8 WebP with a frame header but no compressed payload",
      fileFromBytes(
        createWebP(
          "VP8 ",
          Uint8Array.from([
            0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00,
          ])
        ),
        "header-only-vp8.webp",
        "image/webp"
      ),
    ],
    [
      "a VP8L WebP with a frame header but no compressed payload",
      fileFromBytes(
        createWebP(
          "VP8L",
          Uint8Array.from([0x2f, 0x00, 0x00, 0x00, 0x00])
        ),
        "header-only-vp8l.webp",
        "image/webp"
      ),
    ],
  ])("rejects structurally malformed %s", async (_label, file) => {
    await expect(validateSponsorImage(file)).rejects.toMatchObject({
      name: "SponsorImagePolicyError",
      status: 400,
    });
  });

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
      fileFromBytes(pngBytes, "photo.bin", "application/octet-stream"),
      400,
    ],
    [
      "MIME and signature mismatches",
      fileFromBytes(jpegBytes, "photo.png", "image/png"),
      400,
    ],
    [
      "filename extension and media mismatches",
      fileFromBytes(pngBytes, "photo.jpg", "image/png"),
      400,
    ],
    [
      "truncated PNG signatures",
      fileFromBytes(pngBytes.slice(0, 7), "photo.png", "image/png"),
      400,
    ],
    [
      "truncated WebP signatures",
      fileFromBytes(webpBytes.slice(0, 11), "photo.webp", "image/webp"),
      400,
    ],
  ])("rejects %s", async (_label, file, status) => {
    await expect(validateSponsorImage(file)).rejects.toMatchObject({
      name: "SponsorImagePolicyError",
      status,
    });
  });

  it("accepts a structurally valid PNG of exactly 5 MiB", async () => {
    const exactLimitPng = createExactSizePng(SPONSOR_IMAGE_MAX_BYTES);
    const file = fileFromBytes(
      exactLimitPng,
      "exact-limit.png",
      "image/png"
    );

    await expect(validateSponsorImage(file)).resolves.toMatchObject({
      extension: "png",
      mediaType: "image/png",
      size: SPONSOR_IMAGE_MAX_BYTES,
    });
  });

  it("rejects a structurally valid file one byte over 5 MiB", async () => {
    const file = fileFromBytes(
      createExactSizePng(SPONSOR_IMAGE_MAX_BYTES + 1),
      "too-large.png",
      "image/png"
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

  it("accepts only the exact server-generated sponsor object shape", () => {
    expect(validateCleanupPath(validSponsorPath)).toBe(validSponsorPath);

    for (const invalidPath of [
      `avatars/${campaignId}/article_inline/${generatedImageId}.png`,
      `sponsors/${campaignId}/unknown/${generatedImageId}.png`,
      `sponsors/${campaignId}/article_inline/resident-image.png`,
      `sponsors/${campaignId}/article_inline/${generatedImageId}.gif`,
      `sponsors/${campaignId}/article_inline/${generatedImageId}.PNG`,
      `sponsors/${campaignId}/article_inline/${generatedImageId}.png/extra`,
      `sponsors/${campaignId}/article_inline/${generatedImageId}.png?x=1`,
      `sponsors/not-a-uuid/article_inline/${generatedImageId}.png`,
    ]) {
      expect(() => validateCleanupPath(invalidPath)).toThrowError(
        expect.objectContaining({ status: 400 })
      );
    }
  });
});

describe("readBoundedMultipart", () => {
  it("accepts an exact 5 MiB file with bounded multipart overhead", async () => {
    const exactLimitPng = createExactSizePng(SPONSOR_IMAGE_MAX_BYTES);
    const request = streamingUploadRequest(exactLimitPng);

    const formData = await readBoundedMultipart(request);
    const file = formData.get("file");

    expect(file).toBeInstanceOf(File);
    expect((file as File).size).toBe(SPONSOR_IMAGE_MAX_BYTES);
  });

  it("accepts a multipart request at the total limit", async () => {
    const { request, paddingLength } = paddingMultipartRequest(
      SPONSOR_UPLOAD_REQUEST_LIMIT
    );

    const formData = await readBoundedMultipart(request);

    expect(formData.get("padding")).toBe("x".repeat(paddingLength));
  });

  it("rejects and cancels a multipart request one byte over the total limit", async () => {
    const cancel = vi.fn();
    const { request } = paddingMultipartRequest(
      SPONSOR_UPLOAD_REQUEST_LIMIT + 1,
      cancel
    );

    await expect(readBoundedMultipart(request)).rejects.toMatchObject({
      name: "SponsorImagePolicyError",
      status: 413,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

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

describe("DELETE /api/admin/sponsors/upload", () => {
  it("rejects cross-origin cleanup before authentication or body reads", async () => {
    const request = cleanupRequest(validSponsorPath, {
      origin: "https://attacker.test",
    });

    const response = await callDelete(request);

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(authMocks.getAdminActor).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it("authenticates and authorizes before reading the cleanup body", async () => {
    authMocks.getAdminActor.mockResolvedValue({
      id: "moderator-1",
      role: "moderator",
    });
    const request = cleanupRequest(validSponsorPath);

    const response = await callDelete(request);

    expect(response.status).toBe(403);
    expect(request.bodyUsed).toBe(false);
    expect(storageMocks.remove).not.toHaveBeenCalled();
  });

  it("removes exactly one validated sponsor object", async () => {
    const response = await callDelete(cleanupRequest(validSponsorPath));

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(storageMocks.from).toHaveBeenCalledWith("images");
    expect(storageMocks.remove).toHaveBeenCalledOnce();
    expect(storageMocks.remove).toHaveBeenCalledWith([validSponsorPath]);
  });

  it("rejects resident and arbitrary paths without touching Storage", async () => {
    const response = await callDelete(
      cleanupRequest(`resident/${campaignId}/avatar.png`)
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(storageMocks.remove).not.toHaveBeenCalled();
  });

  it("sanitizes Storage cleanup failures", async () => {
    storageMocks.remove.mockResolvedValueOnce({
      data: null,
      error: { message: "private bucket internals" },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await callDelete(cleanupRequest(validSponsorPath));

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Unable to delete sponsor image.",
    });
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

function cleanupRequest(
  path: string,
  options: { origin?: string } = {}
): Request {
  return new Request("https://ourlittleage.test/api/admin/sponsors/upload", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      origin: options.origin ?? "https://ourlittleage.test",
    },
    body: JSON.stringify({ path }),
  });
}

function fileFromBytes(
  bytes: Uint8Array,
  name: string,
  mediaType: string
): File {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], name, { type: mediaType });
}

async function callDelete(request: Request): Promise<Response> {
  if (!DELETE) {
    throw new Error("DELETE sponsor image handler is missing");
  }

  return DELETE(request);
}

function validateCleanupPath(value: unknown): string {
  if (!validateSponsorImagePath) {
    throw new Error("validateSponsorImagePath is missing");
  }

  return validateSponsorImagePath(value);
}

function paddingMultipartRequest(
  totalBytes: number,
  cancel?: (reason?: unknown) => void
): { request: Request; paddingLength: number } {
  const boundary = "sponsor-overhead-boundary";
  const encoder = new TextEncoder();
  const prefix = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="padding"\r\n\r\n`
  );
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
  const paddingLength = totalBytes - prefix.byteLength - suffix.byteLength;

  if (paddingLength < 0) {
    throw new Error("Multipart fixture total is too small");
  }

  const request = new Request(
    "https://ourlittleage.test/api/admin/sponsors/upload",
    {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: streamBody(
        [prefix, encoder.encode("x".repeat(paddingLength)), suffix],
        cancel
      ),
      duplex: "half",
    } as RequestInit & { duplex: "half" }
  );

  return { request, paddingLength };
}

function createPng(ancillaryDataLength?: number): Uint8Array {
  const signature = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = pngChunk(
    "IHDR",
    Uint8Array.from([
      0x00, 0x00, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00,
    ])
  );
  const idat = pngChunk(
    "IDAT",
    new Uint8Array(deflateSync(Uint8Array.from([0, 0, 0, 0, 0])))
  );
  const iend = pngChunk("IEND", new Uint8Array());
  const chunks = [signature, ihdr];

  if (ancillaryDataLength !== undefined) {
    chunks.push(pngChunk("ruSt", new Uint8Array(ancillaryDataLength)));
  }

  chunks.push(idat, iend);
  return concatenate(chunks);
}

function createExactSizePng(targetBytes: number): Uint8Array {
  const base = createPng();
  const ancillaryDataLength = targetBytes - base.byteLength - 12;

  if (ancillaryDataLength < 0) {
    throw new Error("PNG fixture target is too small");
  }

  return createPng(ancillaryDataLength);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.byteLength);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.byteLength);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(concatenate([typeBytes, data])));
  return chunk;
}

function pngWithOverrunningFirstChunk(): Uint8Array {
  const malformed = pngBytes.slice();
  new DataView(malformed.buffer).setUint32(8, 0x7fffffff);
  return malformed;
}

function createJpeg(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x00,
    0xff, 0xd9,
  ]);
}

function jpegWithScanBeforeFrame(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function createWebP(chunkType: string, chunkData: Uint8Array): Uint8Array {
  return createWebPFromChunks([[chunkType, chunkData]]);
}

function createWebPFromChunks(
  chunks: ReadonlyArray<readonly [string, Uint8Array]>
): Uint8Array {
  const chunkBytes = chunks.map(([chunkType, chunkData]) => {
    const paddedLength = chunkData.byteLength + (chunkData.byteLength % 2);
    const bytes = new Uint8Array(8 + paddedLength);
    const view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode(chunkType), 0);
    view.setUint32(4, chunkData.byteLength, true);
    bytes.set(chunkData, 8);
    return bytes;
  });
  const bytes = new Uint8Array(
    12 + chunkBytes.reduce((total, chunk) => total + chunk.byteLength, 0)
  );
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, bytes.byteLength - 8, true);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(concatenate(chunkBytes), 12);
  return bytes;
}

function webPWithMismatchedRiffSize(): Uint8Array {
  const malformed = webpBytes.slice();
  const view = new DataView(malformed.buffer);
  view.setUint32(4, view.getUint32(4, true) + 2, true);
  return malformed;
}

function webPWithOverrunningChunk(): Uint8Array {
  const malformed = webpBytes.slice();
  new DataView(malformed.buffer).setUint32(16, malformed.byteLength, true);
  return malformed;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0)
  );
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }

  return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
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
