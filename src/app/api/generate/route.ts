import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadImageAssets, type ProvidedBookImage } from "@/lib/book/assets";
import { generateBook } from "@/lib/book/generator";
import { NUMBER_BADGE_COLOR_VALUES } from "@/lib/book/number-badge-colors";

const schema = z.object({
  mode: z.enum([
    "facts",
    "facts-both",
    "list",
    "list-description",
    "list-description-even",
    "described-pictures",
    "even-described-pictures",
    "fully-described-images",
    "even-full-page-text",
    "image-only",
    "uploaded-images",
    "full-fact",
    "dictionary",
  ]),
  facts: z.string().optional(),
  list: z.string().optional(),
  listDescription: z.string().optional(),
  imageLibrary: z.string().optional(),
  overlayOpacity: z.number().optional(),
  numberBadgeColor: z.enum(NUMBER_BADGE_COLOR_VALUES).optional(),
  describedPictureTextAlignment: z.enum(["left", "center"]).optional(),
  describedPictureMaxBoxWidth: z.number().positive().optional(),
  describedPictureBoxHeight: z.number().positive().optional(),
  factsPerPage: z.number().int().positive().optional(),
  fullFactBoxFontId: z.string().min(1).optional(),
  fullFactUploadedFont: z
    .object({
      bytesBase64: z.string().min(1),
      mimeType: z.string().min(1).optional(),
      fileName: z.string().min(1).optional(),
    })
    .optional(),
  fullFactTitleFontId: z.string().min(1).optional(),
  fullFactTitleUploadedFont: z
    .object({
      bytesBase64: z.string().min(1),
      mimeType: z.string().min(1).optional(),
      fileName: z.string().min(1).optional(),
    })
    .optional(),
  targetImageSize: z.number().positive().optional(),
  showPageNumbers: z.boolean().optional(),
  pageSize: z.enum(["square", "us-letter", "hardcover"]).optional(),
  pageCount: z.number().int().min(1).max(200).optional(),
});

class RequestParseError extends Error {}

export async function POST(request: NextRequest) {
  try {
    const { payload, uploadedImages, uploadedBackgroundImages } = await parseGenerateRequest(request);
    const normalizedPayload = {
      ...payload,
      fullFactUploadedFontBytes: payload.fullFactUploadedFont
        ? new Uint8Array(Buffer.from(payload.fullFactUploadedFont.bytesBase64, "base64"))
        : undefined,
      fullFactTitleUploadedFontBytes: payload.fullFactTitleUploadedFont
        ? new Uint8Array(Buffer.from(payload.fullFactTitleUploadedFont.bytesBase64, "base64"))
        : undefined,
      imageAssets: uploadedImages.length ? await loadImageAssets(payload.imageLibrary ?? "", uploadedImages) : undefined,
      backgroundImageAssets: uploadedBackgroundImages.length
        ? await loadImageAssets(payload.imageLibrary ?? "", uploadedBackgroundImages)
        : undefined,
    };
    const outputBytes = await generateBook(normalizedPayload);
    const pdfBuffer = new ArrayBuffer(outputBytes.byteLength);
    new Uint8Array(pdfBuffer).set(outputBytes);
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"picture-book.pdf\"",
      },
    });
  } catch (error) {
    console.error("Failed to generate book", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = error instanceof z.ZodError || error instanceof RequestParseError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function parseGenerateRequest(request: NextRequest): Promise<{
  payload: z.infer<typeof schema>;
  uploadedImages: ProvidedBookImage[];
  uploadedBackgroundImages: ProvidedBookImage[];
}> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    const body = await request.json();
    return {
      payload: schema.parse(body),
      uploadedImages: [],
      uploadedBackgroundImages: [],
    };
  }

  const formData = await request.formData();
  const payloadValue = formData.get("payload");
  if (typeof payloadValue !== "string") {
    throw new RequestParseError("Missing payload");
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(payloadValue);
  } catch {
    throw new RequestParseError("Invalid payload JSON");
  }

  return {
    payload: schema.parse(parsedPayload),
    uploadedImages: await readProvidedImages(formData, "images"),
    uploadedBackgroundImages: await readProvidedImages(formData, "backgroundImages"),
  };
}

async function readProvidedImages(formData: FormData, fieldName: string): Promise<ProvidedBookImage[]> {
  return Promise.all(
    formData
      .getAll(fieldName)
      .filter((value): value is File => value instanceof File && value.size > 0)
      .map(async (file) => ({
        name: file.name || "image",
        contentType: file.type || undefined,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }))
  );
}
