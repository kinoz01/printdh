import { NextResponse } from "next/server";
import { z } from "zod";

import { convertWebpDownloadToPng, pickImageDownloadExtension } from "@/lib/image-download";

const fetchedImageDownloadSchema = z
  .object({
    previewUrl: z.string().url(),
    fullsizeUrl: z.string().url().optional(),
    source: z.string().optional(),
    title: z.string().optional(),
    provider: z.string().optional(),
  })
  .refine((value) => Boolean(value.fullsizeUrl || value.previewUrl), {
    message: "Missing image URL",
    path: ["previewUrl"],
  });

export async function POST(request: Request) {
  try {
    const payload = fetchedImageDownloadSchema.parse(await request.json());
    const downloaded = await downloadImageBytes(payload.fullsizeUrl, payload.previewUrl);
    if (!downloaded) {
      return NextResponse.json({ error: "Unable to download fetched image." }, { status: 502 });
    }

    const image = await convertWebpDownloadToPng(downloaded);
    const extension = pickImageDownloadExtension(image.contentType, image.url);
    const filename = buildFileName(
      `${payload.provider || "fetched"}-${payload.title || payload.source || "image"}`,
      extension
    );
    const responseBody = new ArrayBuffer(image.bytes.byteLength);
    new Uint8Array(responseBody).set(image.bytes);

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": image.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to download fetched image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function downloadImageBytes(fullsizeUrl?: string, previewUrl?: string) {
  const candidates = [fullsizeUrl, previewUrl].filter((value, index, values): value is string => {
    return typeof value === "string" && value.trim().length > 0 && values.indexOf(value) === index;
  });

  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        continue;
      }
      return {
        bytes: new Uint8Array(arrayBuffer),
        contentType: response.headers.get("content-type"),
        url,
      };
    } catch {
      // try the next available URL
    }
  }

  return null;
}

function buildFileName(value: string, extension: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return `${slug || "image"}${extension}`;
}
