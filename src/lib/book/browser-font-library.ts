import fontkit from "@pdf-lib/fontkit";
import { unzipSync } from "fflate";

const DB_NAME = "printdh-browser-fonts";
const STORE_NAME = "uploaded-fonts";
const DB_VERSION = 1;

const SUPPORTED_FONT_EXTENSIONS = new Map<string, { format: "truetype" | "opentype"; mimeType: string }>([
  [".ttf", { format: "truetype", mimeType: "font/ttf" }],
  [".otf", { format: "opentype", mimeType: "font/otf" }],
]);

const SUPPORTED_FONT_ARCHIVES = new Set([".zip"]);

export interface BrowserStoredFontRecord {
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
  dataBase64: string;
}

export interface BrowserFontOption extends BrowserStoredFontRecord {
  previewUrl: string;
  storageScope: "browser";
}

export async function listBrowserFonts(): Promise<BrowserFontOption[]> {
  if (typeof indexedDB === "undefined") {
    return [];
  }

  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const storedFonts = await requestToPromise<BrowserStoredFontRecord[]>(store.getAll());
  await waitForTransaction(transaction);

  storedFonts.sort(compareFonts);
  return storedFonts.map((font) => ({
    ...font,
    previewUrl: URL.createObjectURL(new Blob([base64ToBytes(font.dataBase64)], { type: font.mimeType })),
    storageScope: "browser",
  }));
}

export async function importBrowserFontFile(file: File): Promise<BrowserStoredFontRecord[]> {
  if (typeof indexedDB === "undefined") {
    throw new Error("Browser font storage is unavailable in this browser.");
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const extension = getExtension(file.name);
  const importedFonts: BrowserStoredFontRecord[] = [];

  if (SUPPORTED_FONT_ARCHIVES.has(extension)) {
    const archiveEntries = unzipSync(fileBytes);
    for (const [entryPath, entryBytes] of Object.entries(archiveEntries)) {
      const normalizedEntryPath = entryPath.replace(/\\/g, "/");
      if (!SUPPORTED_FONT_EXTENSIONS.has(getExtension(normalizedEntryPath))) {
        continue;
      }
      const font = createStoredFontRecord({
        id: `browser:${file.name}::${normalizedEntryPath}`,
        fileName: getBaseName(normalizedEntryPath),
        sourceLabel: file.name,
        sourceType: "zip",
        entryPath: normalizedEntryPath,
        bytes: entryBytes,
      });
      if (font) {
        importedFonts.push(font);
      }
    }
  } else if (SUPPORTED_FONT_EXTENSIONS.has(extension)) {
    const font = createStoredFontRecord({
      id: `browser:${file.name}`,
      fileName: file.name,
      sourceLabel: file.name,
      sourceType: "file",
      entryPath: null,
      bytes: fileBytes,
    });
    if (font) {
      importedFonts.push(font);
    }
  } else {
    throw new Error("Upload a .zip, .ttf, or .otf font file.");
  }

  if (importedFonts.length === 0) {
    throw new Error("No supported fonts were found in the uploaded file.");
  }

  importedFonts.sort(compareFonts);
  await replaceStoredFonts(file.name, importedFonts);
  return importedFonts;
}

function createStoredFontRecord(source: {
  id: string;
  fileName: string;
  sourceLabel: string;
  sourceType: "file" | "zip";
  entryPath: string | null;
  bytes: Uint8Array;
}) {
  const supported = SUPPORTED_FONT_EXTENSIONS.get(getExtension(source.fileName));
  if (!supported) {
    return null;
  }

  try {
    const parsed = fontkit.create(source.bytes);
    const familyName = parsed.familyName?.trim() || humanizeFileName(source.fileName);
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
      dataBase64: bytesToBase64(source.bytes),
    } satisfies BrowserStoredFontRecord;
  } catch (error) {
    console.warn(`skip browser font ${source.id}: ${(error as Error).message}`);
    return null;
  }
}

async function replaceStoredFonts(sourceLabel: string, nextFonts: BrowserStoredFontRecord[]) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const currentFonts = await requestToPromise<BrowserStoredFontRecord[]>(store.getAll());

  for (const font of currentFonts) {
    if (font.sourceLabel === sourceLabel) {
      store.delete(font.id);
    }
  }

  for (const font of nextFonts) {
    store.put(font);
  }

  await waitForTransaction(transaction);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Unable to open browser font database."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.oncomplete = () => resolve();
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function compareFonts(left: BrowserStoredFontRecord, right: BrowserStoredFontRecord) {
  return (
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" }) ||
    left.subfamilyName.localeCompare(right.subfamilyName, undefined, { sensitivity: "base" }) ||
    left.sourceLabel.localeCompare(right.sourceLabel, undefined, { sensitivity: "base" }) ||
    left.fileName.localeCompare(right.fileName, undefined, { sensitivity: "base" })
  );
}

function buildPreviewFamily(value: string) {
  const safeName = value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `PreviewFont_${safeName || "Custom"}`;
}

function inferSubfamilyName(fileName: string) {
  const normalized = humanizeFileName(fileName);
  const segments = normalized.split(/\s+/).filter(Boolean);
  if (segments.length <= 1) {
    return "Regular";
  }
  return segments.slice(1).join(" ");
}

function humanizeFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const withSpaces = baseName.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return withSpaces || baseName;
}

function getBaseName(value: string) {
  return value.split("/").pop() ?? value;
}

function getExtension(value: string) {
  const match = value.toLowerCase().match(/(\.[^.]+)$/);
  return match ? match[1] : "";
}
