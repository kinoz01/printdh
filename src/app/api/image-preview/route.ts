import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const IMAGES_ROOT = path.resolve(process.cwd(), "..", "images");
const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(request: NextRequest) {
  try {
    const target = request.nextUrl.searchParams.get("path");
    if (!target) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    const normalized = ensureWithinRoot(path.join(IMAGES_ROOT, target));
    const data = await fs.readFile(normalized);
    const ext = path.extname(normalized).toLowerCase();
    const type = MIME_MAP[ext] || "application/octet-stream";
    return new NextResponse(data, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load image";
    if (message === "Invalid path") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Preview not available" }, { status: 404 });
  }
}

function ensureWithinRoot(targetPath: string) {
  const normalized = path.normalize(targetPath);
  if (!normalized.startsWith(IMAGES_ROOT)) {
    throw new Error("Invalid path");
  }
  return normalized;
}
