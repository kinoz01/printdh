import path from "path";
import sharp from "sharp";

export interface DownloadedImage {
  bytes: Uint8Array;
  contentType: string | null;
  url: string;
}

export async function convertWebpDownloadToPng(image: DownloadedImage): Promise<DownloadedImage> {
  if (!isWebpImage(image.bytes, image.contentType, image.url)) {
    return image;
  }

  const pngBytes = await sharp(Buffer.from(image.bytes), { animated: false, failOn: "none" }).png().toBuffer();
  return {
    ...image,
    bytes: new Uint8Array(pngBytes),
    contentType: "image/png",
  };
}

export function pickImageDownloadExtension(contentType: string | null, url: string) {
  const mimeMap: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
  };

  const normalizedContentType = normalizeContentType(contentType);
  if (normalizedContentType && mimeMap[normalizedContentType]) {
    return mimeMap[normalizedContentType];
  }

  try {
    const parsed = new URL(url);
    const extension = path.extname(parsed.pathname).toLowerCase();
    if (extension) {
      return extension;
    }
  } catch {
    // ignore malformed URLs and fall back to JPG
  }

  return ".jpg";
}

function isWebpImage(bytes: Uint8Array, contentType: string | null, url: string) {
  if (normalizeContentType(contentType) === "image/webp") {
    return true;
  }
  if (hasWebpSignature(bytes)) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return path.extname(parsed.pathname).toLowerCase() === ".webp";
  } catch {
    return false;
  }
}

function hasWebpSignature(bytes: Uint8Array) {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function normalizeContentType(contentType: string | null) {
  return contentType?.split(";")[0]?.trim().toLowerCase() || null;
}
