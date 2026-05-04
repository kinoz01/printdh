import { promises as fs, Dirent } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { zipSync } from "fflate";
import { z } from "zod";

const IMAGES_ROOT = path.resolve(process.cwd(), "..", "images");
const SOURCES_MAP_FILE = path.join(IMAGES_ROOT, ".sources.json");
const ORDER_FILE_NAME = ".order.json";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
type RawCollectedFile = { name: string; relativePath: string; size: number; modified: number; added: number };
type LibraryEntry = Omit<RawCollectedFile, "added">;
type SourceMap = Record<string, string>;
const saveSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  folder: z.string().optional(),
});
const reorderSchema = z.object({
  folder: z.string().optional(),
  order: z.array(z.string()).min(1),
});

export async function GET(request: NextRequest) {
  try {
    await fs.mkdir(IMAGES_ROOT, { recursive: true });
    const { searchParams } = new URL(request.url);
    if (searchParams.get("download") === "zip") {
      const folderKey = normalizeFolderKey(searchParams.get("folder") ?? "");
      return await downloadLibraryZip(folderKey);
    }
    const { folders, files, sourcesByUrl } = await readLibrary();
    const filesWithPreview = files.map((file) => ({
      ...file,
      previewUrl: buildPreviewUrl(file.relativePath),
    }));
    return NextResponse.json({
      rootLabel: path.relative(process.cwd(), IMAGES_ROOT) || "images",
      folders,
      files: filesWithPreview,
      sourcesByUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function downloadLibraryZip(folderKey: string) {
  const files = await collectOrderedFilesForFolder(folderKey);
  if (files.length === 0) {
    return NextResponse.json(
      { error: folderKey ? `No images found in ${folderKey}` : "No root folder images found" },
      { status: 404 }
    );
  }

  const zipEntries: Record<string, Uint8Array> = {};
  for (const file of files) {
    const filePath = resolveLibraryPath(file.relativePath);
    zipEntries[file.name] = new Uint8Array(await fs.readFile(filePath));
  }

  const zipBytes = zipSync(zipEntries, { level: 0 });
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
  new Uint8Array(zipBuffer).set(zipBytes);
  const filename = buildLibraryZipFileName(folderKey);
  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      return await handleLocalUpload(request);
    }
    const body = await request.json();
    const payload = saveSchema.parse(body);
    const folderPath = sanitizeFolder(payload.folder);
    const targetDirectory = ensureWithinRoot(folderPath ? path.join(IMAGES_ROOT, folderPath) : IMAGES_ROOT);
    await fs.mkdir(targetDirectory, { recursive: true });

    const response = await fetch(payload.url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to download image");
    }
    const arrayBuffer = await response.arrayBuffer();
    const fileBytes = Buffer.from(arrayBuffer);
    const extension = pickExtension(response.headers.get("content-type"), payload.url);
    const baseFilename = buildBaseFileName(payload.title, extension);
    const existingFiles = await collectImageFiles(IMAGES_ROOT);
    const duplicate = findDuplicateImage(existingFiles, baseFilename, fileBytes.byteLength);
    if (duplicate) {
      await saveSourceMapping(payload.url, toPosixRelative(duplicate.relativePath));
      return NextResponse.json({ savedAs: duplicate.relativePath, duplicate: true });
    }
    const filename = buildUniqueFileName(existingFiles, baseFilename);
    const filePath = ensureWithinRoot(path.join(targetDirectory, filename));
    await fs.writeFile(filePath, fileBytes);

    const savedAs = path.relative(IMAGES_ROOT, filePath) || path.basename(filePath);
    await appendFileToOrder(toRelativeFolderPath(targetDirectory), path.basename(filePath));
    await saveSourceMapping(payload.url, toPosixRelative(savedAs));
    return NextResponse.json({ savedAs });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to save image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleLocalUpload(request: NextRequest) {
  const formData = await request.formData();
  const uploadedFile = formData.get("file");
  const folderValue = formData.get("folder");
  const folderPath = typeof folderValue === "string" ? sanitizeFolder(folderValue) : "";
  const targetDirectory = ensureWithinRoot(folderPath ? path.join(IMAGES_ROOT, folderPath) : IMAGES_ROOT);
  await fs.mkdir(targetDirectory, { recursive: true });

  if (!(uploadedFile instanceof File)) {
    return NextResponse.json({ error: "Missing image file" }, { status: 400 });
  }
  if (uploadedFile.size <= 0) {
    return NextResponse.json({ error: "Image file is empty" }, { status: 400 });
  }

  const filename = buildUploadFileName(uploadedFile.name, uploadedFile.type);
  if (!isImageFile(filename)) {
    return NextResponse.json({ error: "Only JPG, PNG, WEBP, and GIF images are supported" }, { status: 400 });
  }

  const existingFiles = await collectImageFiles(IMAGES_ROOT);
  const uniqueFilename = buildUniqueFileName(existingFiles, filename);
  const filePath = ensureWithinRoot(path.join(targetDirectory, uniqueFilename));
  const fileBytes = Buffer.from(await uploadedFile.arrayBuffer());
  await fs.writeFile(filePath, fileBytes);

  const savedAs = path.relative(IMAGES_ROOT, filePath) || path.basename(filePath);
  await appendFileToOrder(toRelativeFolderPath(targetDirectory), path.basename(filePath));
  return NextResponse.json({ savedAs });
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deleteAll = searchParams.get("all") === "true";
    if (deleteAll) {
      const files = await collectImageFiles(IMAGES_ROOT);
      let removed = 0;
      for (const file of files) {
        try {
          await fs.unlink(resolveLibraryPath(file.relativePath));
          removed += 1;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
      }
      await clearSourceMap();
      await clearAllFolderOrders(IMAGES_ROOT);
      return NextResponse.json({ deletedAll: true, count: removed });
    }
    const relativePath = searchParams.get("path");
    if (!relativePath) {
      return NextResponse.json({ error: "Missing file path" }, { status: 400 });
    }
    const filePath = resolveLibraryPath(relativePath);
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return NextResponse.json({ error: "Only image files can be removed" }, { status: 400 });
    }
    await fs.unlink(filePath);
    const normalizedPath = toPosixRelative(relativePath);
    await removeSourceMappingByPath(normalizedPath);
    await removeFileFromOrder(getFolderKey(normalizedPath), path.posix.basename(normalizedPath));
    return NextResponse.json({ deleted: relativePath });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Unable to remove image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = reorderSchema.parse(body);
    const folderKey = normalizeFolderKey(payload.folder);
    const folderPath = folderKey ? ensureWithinRoot(path.join(IMAGES_ROOT, folderKey)) : IMAGES_ROOT;
    const availableFiles = await listImageFiles(folderPath);
    const desired = sanitizeOrderList(payload.order).filter((name) => availableFiles.includes(name));
    const remaining = availableFiles.filter((name) => !desired.includes(name));
    const finalOrder = [...desired, ...remaining];
    if (finalOrder.length === 0) {
      await removeOrderFile(folderPath);
    } else {
      await writeOrderFile(folderPath, finalOrder);
    }
    return NextResponse.json({ folder: folderKey, order: finalOrder });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to reorder images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function readLibrary() {
  const entries = await fs.readdir(IMAGES_ROOT, { withFileTypes: true });
  const folders = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(IMAGES_ROOT, entry.name);
        const children = await fs.readdir(fullPath);
        const fileCount = children.filter((name) => isImageFile(name)).length;
        return { name: entry.name, relativePath: entry.name, fileCount };
      })
  );

  const rawFiles = await collectImageFiles(IMAGES_ROOT);
  rawFiles.sort((a, b) => a.added - b.added);
  const orderings = await collectFolderOrders(IMAGES_ROOT);
  const sortedFiles = rawFiles.sort((a, b) => compareWithOrdering(a, b, orderings));
  const files: LibraryEntry[] = sortedFiles.map(({ name, relativePath, size, modified }) => ({
    name,
    relativePath,
    size,
    modified,
  }));
  const sourcesByUrl = await readSourceMap();
  return { folders, files, sourcesByUrl };
}

async function collectOrderedFilesForFolder(folderKey: string) {
  const rawFiles = await collectImageFiles(IMAGES_ROOT);
  const orderings = await collectFolderOrders(IMAGES_ROOT);
  return rawFiles
    .filter((file) => getFolderKey(file.relativePath) === folderKey)
    .sort((a, b) => compareWithOrdering(a, b, orderings));
}

async function collectImageFiles(directory: string): Promise<RawCollectedFile[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const collected: RawCollectedFile[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && isImageFile(entry.name)) {
      const stats = await fs.stat(fullPath);
      collected.push({
        name: entry.name,
        relativePath: toRelativePath(fullPath),
        size: stats.size,
        modified: stats.mtimeMs,
        added: stats.birthtimeMs && Number.isFinite(stats.birthtimeMs) ? stats.birthtimeMs : stats.mtimeMs,
      });
    } else if (entry.isDirectory()) {
      collected.push(...(await collectImageFiles(fullPath)));
    }
  }
  return collected;
}

function sanitizeFolder(folder?: string) {
  if (!folder) {
    return "";
  }
  const parts = folder
    .split(/[\\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
  const cleaned = parts.map((segment) => segment.replace(/[^a-zA-Z0-9-_]/g, "-")).join(path.sep);
  return cleaned;
}

function pickExtension(contentType: string | null, url: string) {
  const mimeMap: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  if (contentType && mimeMap[contentType]) {
    return mimeMap[contentType];
  }
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      return ext;
    }
  } catch {
    // ignore
  }
  return ".jpg";
}

function buildBaseFileName(title: string | undefined, extension: string) {
  const base = title?.trim() ? title.trim().slice(0, 60) : "image";
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return `${slug || "image"}${extension}`;
}

function buildUploadFileName(originalName: string, contentType: string) {
  const baseName = path.basename(originalName || "").trim();
  const rawExtension = path.extname(baseName).toLowerCase();
  const extension = IMAGE_EXTENSIONS.has(rawExtension) ? rawExtension : pickExtension(contentType || null, originalName || "");
  const stem = rawExtension ? baseName.slice(0, -rawExtension.length) : baseName;
  const cleanedStem = stem.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-").replace(/\s+/g, " ").trim();
  return `${cleanedStem || "image"}${extension}`;
}

function buildUniqueFileName(files: RawCollectedFile[], baseFilename: string) {
  const usedNames = new Set(files.map((file) => file.name));
  if (!usedNames.has(baseFilename)) {
    return baseFilename;
  }
  const extension = path.extname(baseFilename);
  const stem = extension ? baseFilename.slice(0, -extension.length) : baseFilename;
  let suffix = 2;
  while (usedNames.has(`${stem}-${suffix}${extension}`)) {
    suffix += 1;
  }
  return `${stem}-${suffix}${extension}`;
}

function findDuplicateImage(files: RawCollectedFile[], filename: string, size: number) {
  return files.find((file) => file.name === filename && file.size === size) ?? null;
}

function ensureWithinRoot(targetPath: string) {
  const normalized = path.normalize(targetPath);
  if (!normalized.startsWith(IMAGES_ROOT)) {
    throw new Error("Invalid folder path");
  }
  return normalized;
}

function resolveLibraryPath(relativePath: string) {
  const sanitized = relativePath.replace(/^[/\\\\]+/, "");
  const normalized = sanitized.split(/[\\\\/]+/).join(path.sep);
  return ensureWithinRoot(path.join(IMAGES_ROOT, normalized));
}

function isImageFile(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function toRelativePath(filePath: string) {
  const relative = path.relative(IMAGES_ROOT, filePath);
  return relative.split(path.sep).join(path.posix.sep);
}

function buildPreviewUrl(relativePath: string) {
  return `/api/image-preview?path=${encodeURIComponent(relativePath)}`;
}

function buildLibraryZipFileName(folderKey: string) {
  if (!folderKey) {
    return "root-folder-images.zip";
  }
  return `${folderKey.replace(/[\\/]+/g, "-")}-images.zip`;
}

async function collectFolderOrders(directory: string, relative = ""): Promise<Record<string, string[]>> {
  const orders: Record<string, string[]> = {};
  const folderKey = normalizeFolderKey(relative);
  try {
    const filePath = path.join(directory, ORDER_FILE_NAME);
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
      if (cleaned.length > 0) {
        orders[folderKey] = cleaned;
      }
    }
  } catch {
    // no custom order for this folder
  }
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      Object.assign(orders, await collectFolderOrders(path.join(directory, entry.name), childRelative));
    }
  }
  return orders;
}

function compareWithOrdering(a: RawCollectedFile, b: RawCollectedFile, orderings: Record<string, string[]>) {
  const folderA = getFolderKey(a.relativePath);
  const folderB = getFolderKey(b.relativePath);
  if (folderA !== folderB) {
    if (folderA === "") {
      return -1;
    }
    if (folderB === "") {
      return 1;
    }
    return folderA.localeCompare(folderB);
  }
  const orderList = orderings[folderA] ?? [];
  const rankA = getOrderRank(orderList, a.name);
  const rankB = getOrderRank(orderList, b.name);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return a.added - b.added;
}

function getFolderKey(relativePath: string) {
  const normalized = toPosixRelative(relativePath);
  const directory = path.posix.dirname(normalized);
  return directory === "." ? "" : directory;
}

function getOrderRank(order: string[], name: string) {
  const index = order.indexOf(name);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function normalizeFolderKey(folder?: string) {
  if (!folder) {
    return "";
  }
  if (!folder.trim()) {
    return "";
  }
  const sanitized = sanitizeFolder(folder);
  return sanitized ? sanitized.split(path.sep).join(path.posix.sep) : "";
}

function toRelativeFolderPath(absolutePath: string) {
  const relative = path.relative(IMAGES_ROOT, absolutePath);
  return relative && relative !== "." ? toPosixRelative(relative) : "";
}

function toPosixRelative(relativePath: string) {
  return relativePath.split(path.sep).join(path.posix.sep);
}

async function appendFileToOrder(folderKey: string, filename: string) {
  if (!filename) {
    return;
  }
  const folderPath = folderKey ? ensureWithinRoot(path.join(IMAGES_ROOT, folderKey)) : IMAGES_ROOT;
  const order = await readOrderFile(path.join(folderPath, ORDER_FILE_NAME));
  if (!order.includes(filename)) {
    order.push(filename);
    await writeOrderFile(folderPath, order);
  }
}

async function removeFileFromOrder(folderKey: string, filename: string) {
  const folderPath = folderKey ? ensureWithinRoot(path.join(IMAGES_ROOT, folderKey)) : IMAGES_ROOT;
  const filePath = path.join(folderPath, ORDER_FILE_NAME);
  const order = await readOrderFile(filePath);
  const next = order.filter((entry) => entry !== filename);
  if (next.length === 0) {
    await removeOrderFile(folderPath);
    return;
  }
  if (next.length !== order.length) {
    await writeOrderFile(folderPath, next);
  }
}

async function readOrderFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
    }
  } catch {
    // ignore
  }
  return [];
}

async function writeOrderFile(folderPath: string, order: string[]) {
  const filePath = path.join(folderPath, ORDER_FILE_NAME);
  if (order.length === 0) {
    await removeOrderFile(folderPath);
    return;
  }
  await fs.writeFile(filePath, JSON.stringify(order, null, 2));
}

async function removeOrderFile(folderPath: string) {
  const filePath = path.join(folderPath, ORDER_FILE_NAME);
  await fs.rm(filePath, { force: true });
}

async function clearAllFolderOrders(directory: string) {
  await removeOrderFile(directory);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await clearAllFolderOrders(path.join(directory, entry.name));
    }
  }
}

async function listImageFiles(folderPath: string) {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && isImageFile(entry.name)).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function sanitizeOrderList(order: string[]) {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const entry of order) {
    const name = sanitizeFileName(entry);
    if (name && !seen.has(name)) {
      seen.add(name);
      cleaned.push(name);
    }
  }
  return cleaned;
}

function sanitizeFileName(value: string) {
  if (!value) {
    return "";
  }
  return value.replace(/[\\\/]/g, "").trim();
}

async function readSourceMap(): Promise<SourceMap> {
  try {
    const raw = await fs.readFile(SOURCES_MAP_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeSourceMap(parsed);
  } catch {
    return {};
  }
}

async function saveSourceMapping(sourceUrl: string, relativePath: string) {
  if (!sourceUrl) {
    return;
  }
  const current = await readSourceMap();
  current[sourceUrl] = relativePath;
  await fs.writeFile(SOURCES_MAP_FILE, JSON.stringify(current, null, 2));
}

async function removeSourceMappingByPath(relativePath: string) {
  const normalized = toPosixRelative(relativePath);
  const current = await readSourceMap();
  let mutated = false;
  for (const [key, value] of Object.entries(current)) {
    if (value === normalized) {
      delete current[key];
      mutated = true;
    }
  }
  if (mutated) {
    await fs.writeFile(SOURCES_MAP_FILE, JSON.stringify(current, null, 2));
  }
}

async function clearSourceMap() {
  await fs.rm(SOURCES_MAP_FILE, { force: true });
}

function normalizeSourceMap(value: unknown): SourceMap {
  if (!value || typeof value !== "object") {
    return {};
  }
  const entries = Object.entries(value);
  const map: SourceMap = {};
  for (const [key, item] of entries) {
    if (typeof key === "string" && typeof item === "string") {
      map[key] = toPosixRelative(item);
    }
  }
  return map;
}
