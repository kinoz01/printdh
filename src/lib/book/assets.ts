import { promises as fs } from "fs";
import path from "path";
import { imageSize } from "image-size";
import sharp from "sharp";
import type { ImageAsset, TemplateAsset } from "./types";
import { orderBy } from "natural-orderby";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"]);
type NormalizedPdfImage = Pick<ImageAsset, "bytes" | "mimeType">;

export async function loadImageAssets(folder: string): Promise<ImageAsset[]> {
  const absolute = path.resolve(process.cwd(), folder);
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(absolute)).map((entry) => path.join(absolute, entry));
  } catch {
    return [];
  }
  const orderList = await readFolderOrder(absolute);
  const orderIndex = new Map(orderList.map((name, index) => [name, index]));
  const files = orderBy(
    entries.filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())),
    [
      (value) => {
        const filename = path.basename(value);
        return orderIndex.has(filename) ? orderIndex.get(filename)! : Number.MAX_SAFE_INTEGER;
      },
      (value) => naturalKey(path.basename(value).toLowerCase()),
    ]
  );
  const assets: ImageAsset[] = [];
  for (const file of files) {
    try {
      const bytes = await fs.readFile(file);
      const dimensions = imageSize(bytes);
      if (!dimensions.width || !dimensions.height) {
        continue;
      }
      const sourceMimeType = determineMimeType(dimensions.type) ?? determineMimeType(path.extname(file).toLowerCase());
      const normalized = await normalizePdfCompatibleImage(bytes, sourceMimeType);
      assets.push({
        bytes: normalized.bytes,
        width: dimensions.width,
        height: dimensions.height,
        mimeType: normalized.mimeType,
      });
    } catch (error) {
      console.warn(`skip image ${file}: ${(error as Error).message}`);
    }
  }
  return assets;
}

const TEMPLATE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);

export async function loadTemplateAssets(folder: string): Promise<TemplateAsset[]> {
  const absolute = path.resolve(process.cwd(), folder);
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(absolute)).map((entry) => path.join(absolute, entry));
  } catch {
    return [];
  }
  const files = orderBy(
    entries.filter((file) => TEMPLATE_EXTENSIONS.has(path.extname(file).toLowerCase())),
    [(value) => naturalKey(path.basename(value).toLowerCase())]
  );
  const assets: TemplateAsset[] = [];
  for (const file of files) {
    try {
      const bytes = await fs.readFile(file);
      const ext = path.extname(file).toLowerCase();
      if (ext === ".pdf") {
        assets.push({
          id: file,
          type: "pdf",
          bytes: bytes,
        });
      } else {
        const dimensions = imageSize(bytes);
        if (!dimensions.width || !dimensions.height) {
          continue;
        }
        assets.push({
          id: file,
          type: "image",
          bytes: bytes,
          width: dimensions.width,
          height: dimensions.height,
        });
      }
    } catch (error) {
      console.warn(`skip template ${file}: ${(error as Error).message}`);
    }
  }
  return assets;
}

function determineMimeType(identifier?: string | null): string | null {
  switch ((identifier ?? "").toLowerCase()) {
    case ".png":
    case "png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case ".webp":
    case "webp":
      return "image/webp";
    case ".bmp":
    case "bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
    case "tif":
    case "tiff":
      return "image/tiff";
    case ".gif":
    case "gif":
      return "image/gif";
    default:
      return null;
  }
}

async function normalizePdfCompatibleImage(bytes: Uint8Array, mimeType: string | null): Promise<NormalizedPdfImage> {
  if (mimeType === "image/png" || mimeType === "image/jpeg") {
    return { bytes, mimeType };
  }

  const metadata = await sharp(bytes).metadata();

  if (metadata.hasAlpha) {
    return {
      bytes: await sharp(bytes).png().toBuffer(),
      mimeType: "image/png",
    };
  }

  return {
    bytes: await sharp(bytes).jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
    mimeType: "image/jpeg",
  };
}

function naturalKey(value: string) {
  const chunks = value.split(/(\d+)/).filter(Boolean);
  return chunks.map((chunk) => (/\d/.test(chunk) ? Number(chunk) : chunk));
}

async function readFolderOrder(absoluteFolder: string) {
  const filePath = path.join(absoluteFolder, ".order.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
    }
  } catch {
    // ignore missing or invalid order files
  }
  return [];
}
