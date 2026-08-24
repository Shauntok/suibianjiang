import {
  sponsorPlacements,
  type SponsorPlacement,
} from "@/lib/sponsors/types";

export const SPONSOR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SPONSOR_UPLOAD_REQUEST_LIMIT =
  SPONSOR_IMAGE_MAX_BYTES + 64 * 1024;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const imageFormats = {
  "image/jpeg": {
    extensions: ["jpg", "jpeg"],
    outputExtension: "jpg",
    signature: isJpeg,
  },
  "image/png": {
    extensions: ["png"],
    outputExtension: "png",
    signature: isPng,
  },
  "image/webp": {
    extensions: ["webp"],
    outputExtension: "webp",
    signature: isWebP,
  },
} as const;

export type SponsorImageExtension = "jpg" | "png" | "webp";

export type ValidatedSponsorImage = {
  extension: SponsorImageExtension;
  file: File;
  mediaType: keyof typeof imageFormats;
  size: number;
};

export class SponsorImagePolicyError extends Error {
  constructor(
    public readonly status: 400 | 413,
    message: string
  ) {
    super(message);
    this.name = "SponsorImagePolicyError";
  }
}

export async function validateSponsorImage(
  file: File
): Promise<ValidatedSponsorImage> {
  if (file.size === 0) {
    throw invalidUpload();
  }

  if (file.size > SPONSOR_IMAGE_MAX_BYTES) {
    throw requestTooLarge("Sponsor image must be 5 MiB or smaller.");
  }

  if (!isSupportedMediaType(file.type)) {
    throw invalidUpload();
  }

  const format = imageFormats[file.type];
  const extension = getFileExtension(file.name);

  if (!extension || !format.extensions.includes(extension as never)) {
    throw invalidUpload();
  }

  const signatureBytes = new Uint8Array(
    await file.slice(0, 12).arrayBuffer()
  );

  if (!format.signature(signatureBytes)) {
    throw invalidUpload();
  }

  return {
    extension: format.outputExtension,
    file,
    mediaType: file.type,
    size: file.size,
  };
}

export function validateSponsorUploadFields(
  campaignId: unknown,
  placement: unknown
): { campaignId: string; placement: SponsorPlacement } {
  if (typeof campaignId !== "string" || !uuidPattern.test(campaignId)) {
    throw invalidUpload();
  }

  if (
    typeof placement !== "string" ||
    !sponsorPlacements.includes(placement as SponsorPlacement)
  ) {
    throw invalidUpload();
  }

  return { campaignId, placement: placement as SponsorPlacement };
}

export function createSponsorImagePath(
  campaignId: string,
  placement: SponsorPlacement,
  extension: SponsorImageExtension
): string {
  const fields = validateSponsorUploadFields(campaignId, placement);

  if (extension !== "jpg" && extension !== "png" && extension !== "webp") {
    throw invalidUpload();
  }

  return `sponsors/${fields.campaignId}/${fields.placement}/${crypto.randomUUID()}.${extension}`;
}

export async function readBoundedMultipart(
  request: Request,
  maximumBytes = SPONSOR_UPLOAD_REQUEST_LIMIT
): Promise<FormData> {
  const contentType = request.headers.get("content-type");

  if (!isMultipartContentType(contentType)) {
    throw invalidUpload();
  }

  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    if (!/^\d+$/.test(contentLength)) {
      throw invalidUpload();
    }

    if (Number(contentLength) > maximumBytes) {
      throw requestTooLarge();
    }
  }

  const reader = request.body?.getReader();

  if (!reader) {
    throw invalidUpload();
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      receivedBytes += value.byteLength;

      if (receivedBytes > maximumBytes) {
        await cancelBodyReader(reader);
        throw requestTooLarge();
      }

      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof SponsorImagePolicyError) {
      throw error;
    }

    await cancelBodyReader(reader);
    throw invalidUpload();
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Response(body.buffer, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw invalidUpload();
  }
}

export function isSponsorUploadFile(value: FormDataEntryValue): value is File {
  return (
    typeof value !== "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.size === "number" &&
    typeof value.arrayBuffer === "function"
  );
}

function isSupportedMediaType(
  mediaType: string
): mediaType is keyof typeof imageFormats {
  return Object.hasOwn(imageFormats, mediaType);
}

function getFileExtension(fileName: string): string | null {
  const separator = fileName.lastIndexOf(".");

  if (separator <= 0 || separator === fileName.length - 1) {
    return null;
  }

  return fileName.slice(separator + 1).toLowerCase();
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  return signature.every((byte, index) => bytes[index] === byte);
}

function isWebP(bytes: Uint8Array): boolean {
  if (
    bytes.length < 12 ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return false;
  }

  const declaredSize =
    bytes[4] |
    (bytes[5] << 8) |
    (bytes[6] << 16) |
    (bytes[7] << 24);

  return declaredSize >= 4;
}

function isMultipartContentType(value: string | null): value is string {
  return (
    typeof value === "string" &&
    /^multipart\/form-data\s*;.*\bboundary=(?:"[^"]+"|[^;\s]+)(?:\s*;.*)?$/i.test(
      value
    )
  );
}

async function cancelBodyReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The caller still receives only the sanitized request error.
  }
}

function invalidUpload(): SponsorImagePolicyError {
  return new SponsorImagePolicyError(400, "Invalid sponsor image upload.");
}

function requestTooLarge(
  message = "Sponsor upload is too large."
): SponsorImagePolicyError {
  return new SponsorImagePolicyError(413, message);
}
