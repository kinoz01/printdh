import { promises as fs } from "fs";
import path from "path";
import { imageSize } from "image-size";
import type { ImageAsset, TemplateAsset } from "./types";
import { orderBy } from "natural-orderby";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"]);

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
      assets.push({
        bytes: bytes,
        width: dimensions.width,
        height: dimensions.height,
        mimeType: determineMimeType(file),
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

function determineMimeType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
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
