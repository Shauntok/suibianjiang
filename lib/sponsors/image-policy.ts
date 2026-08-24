import {
  sponsorPlacements,
  type SponsorPlacement,
} from "@/lib/sponsors/types";

export const SPONSOR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SPONSOR_UPLOAD_REQUEST_LIMIT =
  SPONSOR_IMAGE_MAX_BYTES + 64 * 1024;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const generatedImagePattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/;
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

const imageFormats = {
  "image/jpeg": {
    extensions: ["jpg", "jpeg"],
    outputExtension: "jpg",
    structure: isJpeg,
  },
  "image/png": {
    extensions: ["png"],
    outputExtension: "png",
    structure: isPng,
  },
  "image/webp": {
    extensions: ["webp"],
    outputExtension: "webp",
    structure: isWebP,
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

  const fileBytes = new Uint8Array(await file.arrayBuffer());

  if (!format.structure(fileBytes)) {
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

export function validateSponsorImagePath(value: unknown): string {
  if (typeof value !== "string") {
    throw invalidUpload();
  }

  const segments = value.split("/");

  if (
    segments.length !== 4 ||
    segments[0] !== "sponsors" ||
    !uuidPattern.test(segments[1]) ||
    !sponsorPlacements.includes(segments[2] as SponsorPlacement) ||
    !generatedImagePattern.test(segments[3])
  ) {
    throw invalidUpload();
  }

  return value;
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
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }

  let offset = 2;
  let sawDimensions = false;
  let sawScan = false;

  while (offset < bytes.length) {
    const marker = readJpegMarker(bytes, offset);

    if (!marker) {
      return false;
    }

    offset = marker.nextOffset;

    if (marker.code === 0xd9) {
      return sawDimensions && sawScan && offset === bytes.length;
    }

    if (marker.code === 0xd8 || marker.code === 0x00) {
      return false;
    }

    if (marker.code === 0x01 || isJpegRestartMarker(marker.code)) {
      continue;
    }

    if (offset + 2 > bytes.length) {
      return false;
    }

    const segmentLength = readUint16BigEndian(bytes, offset);

    if (segmentLength < 2 || segmentLength > bytes.length - offset) {
      return false;
    }

    const dataOffset = offset + 2;
    const segmentEnd = offset + segmentLength;

    if (jpegStartOfFrameMarkers.has(marker.code)) {
      if (!hasValidJpegDimensions(bytes, dataOffset, segmentLength)) {
        return false;
      }

      sawDimensions = true;
    }

    if (marker.code === 0xda) {
      if (
        !sawDimensions ||
        !hasValidJpegScanHeader(bytes, dataOffset, segmentLength)
      ) {
        return false;
      }

      sawScan = true;
      const nextMarkerOffset = findJpegMarkerAfterScan(bytes, segmentEnd);

      if (nextMarkerOffset < 0) {
        return false;
      }

      offset = nextMarkerOffset;
    } else {
      offset = segmentEnd;
    }
  }

  return false;
}

function isPng(bytes: Uint8Array): boolean {
  if (
    bytes.length < pngSignature.length + 12 ||
    !pngSignature.every((byte, index) => bytes[index] === byte)
  ) {
    return false;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = pngSignature.length;
  let chunkIndex = 0;
  let sawHeader = false;
  let sawImageData = false;

  while (offset < bytes.length) {
    if (bytes.length - offset < 12) {
      return false;
    }

    const declaredLength = view.getUint32(offset);

    if (declaredLength > bytes.length - offset - 12) {
      return false;
    }

    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + declaredLength;
    const chunkEnd = crcOffset + 4;
    const chunkType = readAscii(bytes, typeOffset, 4);

    if (
      !/^[A-Za-z]{4}$/.test(chunkType) ||
      view.getUint32(crcOffset) !== crc32(bytes, typeOffset, crcOffset)
    ) {
      return false;
    }

    if (chunkIndex === 0 && chunkType !== "IHDR") {
      return false;
    }

    if (chunkType === "IHDR") {
      if (
        sawHeader ||
        !hasValidPngHeader(bytes, dataOffset, declaredLength)
      ) {
        return false;
      }

      sawHeader = true;
    } else if (chunkType === "IDAT") {
      if (!sawHeader) {
        return false;
      }

      sawImageData = true;
    } else if (chunkType === "IEND") {
      return (
        declaredLength === 0 &&
        sawHeader &&
        sawImageData &&
        chunkEnd === bytes.length
      );
    } else if (isPngCriticalChunk(chunkType) && chunkType !== "PLTE") {
      return false;
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }

  return false;
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

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(4, true) !== bytes.length - 8) {
    return false;
  }

  let offset = 12;
  let sawImageChunk = false;

  while (offset < bytes.length) {
    if (bytes.length - offset < 8) {
      return false;
    }

    const chunkType = readAscii(bytes, offset, 4);
    const chunkLength = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    const paddedLength = chunkLength + (chunkLength % 2);

    if (paddedLength > bytes.length - dataOffset) {
      return false;
    }

    if (chunkType === "VP8 ") {
      sawImageChunk ||= hasValidVp8Frame(bytes, dataOffset, chunkLength);
    } else if (chunkType === "VP8L") {
      sawImageChunk ||= hasValidVp8LosslessFrame(
        bytes,
        dataOffset,
        chunkLength
      );
    } else if (chunkType === "VP8X") {
      sawImageChunk ||= hasValidVp8ExtendedHeader(
        bytes,
        dataOffset,
        chunkLength
      );
    }

    offset = dataOffset + paddedLength;
  }

  return sawImageChunk && offset === bytes.length;
}

function readJpegMarker(
  bytes: Uint8Array,
  offset: number
): { code: number; nextOffset: number } | null {
  if (bytes[offset] !== 0xff) {
    return null;
  }

  while (offset < bytes.length && bytes[offset] === 0xff) {
    offset += 1;
  }

  if (offset >= bytes.length) {
    return null;
  }

  return { code: bytes[offset], nextOffset: offset + 1 };
}

function isJpegRestartMarker(marker: number): boolean {
  return marker >= 0xd0 && marker <= 0xd7;
}

function hasValidJpegDimensions(
  bytes: Uint8Array,
  dataOffset: number,
  segmentLength: number
): boolean {
  if (segmentLength < 11) {
    return false;
  }

  const componentCount = bytes[dataOffset + 5];

  return (
    componentCount > 0 &&
    segmentLength === 8 + 3 * componentCount &&
    readUint16BigEndian(bytes, dataOffset + 1) > 0 &&
    readUint16BigEndian(bytes, dataOffset + 3) > 0
  );
}

function hasValidJpegScanHeader(
  bytes: Uint8Array,
  dataOffset: number,
  segmentLength: number
): boolean {
  if (segmentLength < 8) {
    return false;
  }

  const componentCount = bytes[dataOffset];
  return componentCount > 0 && segmentLength === 6 + 2 * componentCount;
}

function findJpegMarkerAfterScan(bytes: Uint8Array, offset: number): number {
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const markerOffset = offset;

    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= bytes.length) {
      return -1;
    }

    const marker = bytes[offset];

    if (marker === 0x00 || isJpegRestartMarker(marker)) {
      offset += 1;
      continue;
    }

    return markerOffset;
  }

  return -1;
}

function hasValidPngHeader(
  bytes: Uint8Array,
  dataOffset: number,
  declaredLength: number
): boolean {
  if (declaredLength !== 13) {
    return false;
  }

  const width = readUint32BigEndian(bytes, dataOffset);
  const height = readUint32BigEndian(bytes, dataOffset + 4);
  const bitDepth = bytes[dataOffset + 8];
  const colorType = bytes[dataOffset + 9];
  const allowedDepths: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };

  return (
    width > 0 &&
    height > 0 &&
    allowedDepths[colorType]?.includes(bitDepth) === true &&
    bytes[dataOffset + 10] === 0 &&
    bytes[dataOffset + 11] === 0 &&
    (bytes[dataOffset + 12] === 0 || bytes[dataOffset + 12] === 1)
  );
}

function isPngCriticalChunk(chunkType: string): boolean {
  return chunkType.charCodeAt(0) >= 65 && chunkType.charCodeAt(0) <= 90;
}

function hasValidVp8Frame(
  bytes: Uint8Array,
  dataOffset: number,
  chunkLength: number
): boolean {
  return (
    chunkLength >= 10 &&
    bytes[dataOffset + 3] === 0x9d &&
    bytes[dataOffset + 4] === 0x01 &&
    bytes[dataOffset + 5] === 0x2a &&
    (readUint16LittleEndian(bytes, dataOffset + 6) & 0x3fff) > 0 &&
    (readUint16LittleEndian(bytes, dataOffset + 8) & 0x3fff) > 0
  );
}

function hasValidVp8LosslessFrame(
  bytes: Uint8Array,
  dataOffset: number,
  chunkLength: number
): boolean {
  return (
    chunkLength >= 5 &&
    bytes[dataOffset] === 0x2f &&
    (bytes[dataOffset + 4] & 0xe0) === 0
  );
}

function hasValidVp8ExtendedHeader(
  bytes: Uint8Array,
  dataOffset: number,
  chunkLength: number
): boolean {
  return (
    chunkLength === 10 &&
    (bytes[dataOffset] & 0xc1) === 0 &&
    bytes[dataOffset + 1] === 0 &&
    bytes[dataOffset + 2] === 0 &&
    bytes[dataOffset + 3] === 0
  );
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";

  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }

  return value;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;

  for (let offset = start; offset < end; offset += 1) {
    crc ^= bytes[offset];

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
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
