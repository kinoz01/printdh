import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { zipSync } from "fflate";
import sharp from "sharp";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MAX_CROP_PIXELS = 100000;

interface CropSettings {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("images").filter((value): value is File => value instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "Missing image uploads" }, { status: 400 });
    }

    const crop = parseCropSettings(formData);
    const zipEntries: Record<string, Uint8Array> = {};
    const failures: string[] = [];
    const usedNames = new Set<string>();

    for (const file of files) {
      try {
        if (file.size <= 0) {
          throw new Error("Image file is empty");
        }
        const filename = sanitizeImageFilename(file.name, file.type);
        if (!isImageFile(filename)) {
          throw new Error("Unsupported image type");
        }
        const sourceBytes = Buffer.from(await file.arrayBuffer());
        const croppedBytes = await cropImage(sourceBytes, crop, filename);
        const outputName = buildUniqueZipName(usedNames, buildOutputFilename(filename));
        zipEntries[outputName] = new Uint8Array(croppedBytes);
      } catch (error) {
        failures.push(`${file.name || "image"}: ${error instanceof Error ? error.message : "Failed to crop image"}`);
      }
    }

    if (Object.keys(zipEntries).length === 0) {
      return NextResponse.json({ error: failures.join("; ") || "No images could be cropped" }, { status: 400 });
    }

    if (failures.length > 0) {
      zipEntries["crop-failures.txt"] = new TextEncoder().encode(failures.join("\n"));
    }

    const zipBytes = zipSync(zipEntries, { level: 0 });
    const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
    new Uint8Array(zipBuffer).set(zipBytes);
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="cropped-images.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to crop images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseCropSettings(formData: FormData): CropSettings {
  return {
    top: parseCropValue(formData.get("top")),
    right: parseCropValue(formData.get("right")),
    bottom: parseCropValue(formData.get("bottom")),
    left: parseCropValue(formData.get("left")),
  };
}

function parseCropValue(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value.trim() : "";
  const parsed = raw ? Number(raw) : 0;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_CROP_PIXELS) {
    throw new Error(`Crop values must be between 0 and ${MAX_CROP_PIXELS} pixels`);
  }
  return Math.round(parsed);
}

async function cropImage(sourceBytes: Buffer, crop: CropSettings, filename: string) {
  const image = sharp(sourceBytes, { animated: true, failOn: "none" });
  const metadata = await image.metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.pageHeight ?? metadata.height ?? 0;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Unable to read image dimensions");
  }

  const outputWidth = sourceWidth - crop.left - crop.right;
  const outputHeight = sourceHeight - crop.top - crop.bottom;
  if (outputWidth <= 0 || outputHeight <= 0) {
    throw new Error(`Crop is larger than the image (${sourceWidth}x${sourceHeight}px)`);
  }

  const pipeline = image.extract({
    left: crop.left,
    top: crop.top,
    width: outputWidth,
    height: outputHeight,
  });

  const extension = path.extname(filename).toLowerCase();
  if (extension === ".png") {
    return await pipeline.png().toBuffer();
  }
  if (extension === ".webp") {
    return await pipeline.webp().toBuffer();
  }
  if (extension === ".gif") {
    return await pipeline.gif().toBuffer();
  }
  return await pipeline.jpeg({ quality: 92 }).toBuffer();
}

function sanitizeImageFilename(originalName: string, contentType: string) {
  const baseName = path.basename(originalName || "").trim();
  const rawExtension = path.extname(baseName).toLowerCase();
  const extension = IMAGE_EXTENSIONS.has(rawExtension) ? rawExtension : pickExtension(contentType, originalName);
  const stem = rawExtension ? baseName.slice(0, -rawExtension.length) : baseName;
  const cleanedStem = stem.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-").replace(/\s+/g, " ").trim();
  return `${cleanedStem || "image"}${extension}`;
}

function pickExtension(contentType: string | null, filename: string) {
  const mimeMap: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  if (contentType && mimeMap[contentType]) {
    return mimeMap[contentType];
  }
  const extension = path.extname(filename || "").toLowerCase();
  return IMAGE_EXTENSIONS.has(extension) ? extension : ".jpg";
}

function isImageFile(filename: string) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function buildOutputFilename(filename: string) {
  const extension = path.extname(filename);
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  return `${stem || "image"}-cropped${extension || ".jpg"}`;
}

function buildUniqueZipName(usedNames: Set<string>, filename: string) {
  if (!usedNames.has(filename)) {
    usedNames.add(filename);
    return filename;
  }
  const extension = path.extname(filename);
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  let suffix = 2;
  while (usedNames.has(`${stem}-${suffix}${extension}`)) {
    suffix += 1;
  }
  const uniqueName = `${stem}-${suffix}${extension}`;
  usedNames.add(uniqueName);
  return uniqueName;
}
