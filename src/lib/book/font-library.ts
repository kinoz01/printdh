import fontkit from "@pdf-lib/fontkit";
import { unzipSync } from "fflate";
import { promises as fs } from "fs";
import path from "path";

const BOOK_FONTS_ROOT = path.resolve(process.cwd(), "fonts");
const SUPPORTED_BOOK_FONT_EXTENSIONS = new Map<
  string,
  { format: "truetype" | "opentype"; mimeType: string }
>([
  [".ttf", { format: "truetype", mimeType: "font/ttf" }],
  [".otf", { format: "opentype", mimeType: "font/otf" }],
]);
const SUPPORTED_BOOK_FONT_ARCHIVES = new Set([".zip"]);

export interface BookFontRecord {
  id: string;
  label: string;
  fileName: string;
  fullName: string;
  familyName: string;
  subfamilyName: string;
  format: "truetype" | "opentype";
  mimeType: string;
  previewFamily: string;
  sourceLabel: string;
  sourceType: "file" | "zip";
  entryPath: string | null;
}

export interface LoadedBookFont extends BookFontRecord {
  bytes: Uint8Array;
}

export async function listBookFonts(): Promise<BookFontRecord[]> {
  await fs.mkdir(BOOK_FONTS_ROOT, { recursive: true });
  const entries = await fs.readdir(BOOK_FONTS_ROOT, { withFileTypes: true });
  const fonts: BookFontRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (SUPPORTED_BOOK_FONT_EXTENSIONS.has(extension)) {
      const filePath = path.join(BOOK_FONTS_ROOT, entry.name);
      const bytes = new Uint8Array(await fs.readFile(filePath));
      const record = createFontRecord({
        id: entry.name,
        fileName: entry.name,
        sourceLabel: entry.name,
        sourceType: "file",
        entryPath: null,
        bytes,
      });
      if (record) {
        fonts.push(record);
      }
      continue;
    }
    if (!SUPPORTED_BOOK_FONT_ARCHIVES.has(extension)) {
      continue;
    }
    const archiveBytes = new Uint8Array(await fs.readFile(path.join(BOOK_FONTS_ROOT, entry.name)));
    const archiveEntries = unzipSync(archiveBytes);
    for (const [entryPath, entryBytes] of Object.entries(archiveEntries)) {
      const normalizedEntryPath = entryPath.replace(/\\/g, "/");
      const entryExtension = path.extname(normalizedEntryPath).toLowerCase();
      if (!SUPPORTED_BOOK_FONT_EXTENSIONS.has(entryExtension)) {
        continue;
      }
      const record = createFontRecord({
        id: `${entry.name}::${normalizedEntryPath}`,
        fileName: path.posix.basename(normalizedEntryPath),
        sourceLabel: entry.name,
        sourceType: "zip",
        entryPath: normalizedEntryPath,
        bytes: entryBytes,
      });
      if (record) {
        fonts.push(record);
      }
    }
  }
  fonts.sort(compareBookFonts);
  return fonts;
}

export async function readBookFont(fontId: string): Promise<LoadedBookFont | null> {
  const fonts = await listBookFonts();
  const match = fonts.find((font) => font.id === fontId);
  if (!match) {
    return null;
  }
  const bytes = await readFontBytes(match);
  if (!bytes) {
    return null;
  }
  return {
    ...match,
    bytes,
  };
}

export function buildBookFontPreviewUrl(fontId: string) {
  return `/api/book-fonts?file=${encodeURIComponent(fontId)}`;
}

function humanizeFontFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const withSpaces = baseName.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return withSpaces || baseName;
}

function buildPreviewFamily(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `PreviewFont_${safeName || "Custom"}`;
}

async function readFontBytes(font: BookFontRecord) {
  if (font.sourceType === "file") {
    return new Uint8Array(await fs.readFile(path.join(BOOK_FONTS_ROOT, font.fileName)));
  }
  if (!font.entryPath) {
    return null;
  }
  const archivePath = path.join(BOOK_FONTS_ROOT, font.sourceLabel);
  const archiveBytes = new Uint8Array(await fs.readFile(archivePath));
  const archiveEntries = unzipSync(archiveBytes);
  return archiveEntries[font.entryPath] ?? null;
}

function createFontRecord(source: {
  id: string;
  fileName: string;
  sourceLabel: string;
  sourceType: "file" | "zip";
  entryPath: string | null;
  bytes: Uint8Array;
}) {
  const extension = path.extname(source.fileName).toLowerCase();
  const supported = SUPPORTED_BOOK_FONT_EXTENSIONS.get(extension);
  if (!supported) {
    return null;
  }
  try {
    const parsed = fontkit.create(source.bytes);
    const familyName = parsed.familyName?.trim() || humanizeFontFileName(source.fileName);
    const subfamilyName = parsed.subfamilyName?.trim() || inferSubfamilyName(source.fileName);
    const fullName = parsed.fullName?.trim() || [familyName, subfamilyName].filter(Boolean).join(" ").trim() || familyName;
    return {
      id: source.id,
      label: familyName,
      fileName: source.fileName,
      fullName,
      familyName,
      subfamilyName,
      format: supported.format,
      mimeType: supported.mimeType,
      previewFamily: buildPreviewFamily(source.id),
      sourceLabel: source.sourceLabel,
      sourceType: source.sourceType,
      entryPath: source.entryPath,
    } satisfies BookFontRecord;
  } catch (error) {
    console.warn(`skip font ${source.id}: ${(error as Error).message}`);
    return null;
  }
}

function inferSubfamilyName(fileName: string) {
  const normalized = humanizeFontFileName(fileName);
  const segments = normalized.split(/\s+/).filter(Boolean);
  if (segments.length <= 1) {
    return "Regular";
  }
  return segments.slice(1).join(" ");
}

function compareBookFonts(left: BookFontRecord, right: BookFontRecord) {
  return (
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" }) ||
    left.subfamilyName.localeCompare(right.subfamilyName, undefined, { sensitivity: "base" }) ||
    left.sourceLabel.localeCompare(right.sourceLabel, undefined, { sensitivity: "base" }) ||
    left.fileName.localeCompare(right.fileName, undefined, { sensitivity: "base" })
  );
}
