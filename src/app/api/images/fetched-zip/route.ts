import path from "path";
import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { z } from "zod";

const imageResultSchema = z.object({
  previewUrl: z.string().url(),
  fullsizeUrl: z.string().optional(),
  source: z.string().min(1),
  title: z.string().optional(),
  provider: z.string().min(1),
});

const keywordProviderGroupSchema = z.object({
  provider: z.string().min(1),
  results: z.array(imageResultSchema),
  error: z.string().nullable().optional(),
});

const keywordGroupSchema = z.object({
  keyword: z.string().min(1),
  providers: z.array(keywordProviderGroupSchema),
});

const fetchedZipRequestSchema = z.object({
  keywordGroups: z.array(keywordGroupSchema).min(1),
});

export async function POST(request: Request) {
  try {
    const payload = fetchedZipRequestSchema.parse(await request.json());
    const zipEntries: Record<string, Uint8Array> = {};
    let addedCount = 0;

    for (const group of payload.keywordGroups) {
      const folderName = sanitizeZipSegment(group.keyword) || "keyword";
      let folderImageIndex = 0;

      for (const providerBucket of group.providers) {
        for (const result of providerBucket.results) {
          const downloaded = await downloadImageBytes(result.fullsizeUrl, result.previewUrl);
          if (!downloaded) {
            continue;
          }

          folderImageIndex += 1;
          addedCount += 1;

          const extension = pickExtension(downloaded.contentType, downloaded.url);
          const filename = buildFileName(
            `${String(folderImageIndex).padStart(2, "0")}-${result.provider}-${result.title || result.source || "image"}`,
            extension
          );
          zipEntries[`${folderName}/${filename}`] = downloaded.bytes;
        }
      }
    }

    if (addedCount === 0) {
      return NextResponse.json({ error: "None of the fetched images could be downloaded." }, { status: 502 });
    }

    const zipBytes = zipSync(zipEntries, { level: 0 });
    const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
    new Uint8Array(zipBuffer).set(zipBytes);

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="fetched-images-by-keyword.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to build fetched images ZIP";
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

function sanitizeZipSegment(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim();
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

function pickExtension(contentType: string | null, url: string) {
  const mimeMap: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
  };

  if (contentType) {
    const normalizedContentType = contentType.split(";")[0]?.trim().toLowerCase();
    if (normalizedContentType && mimeMap[normalizedContentType]) {
      return mimeMap[normalizedContentType];
    }
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
