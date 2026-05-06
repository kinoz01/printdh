import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
    "image-only",
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
  pageSize: z.enum(["square", "us-letter"]).optional(),
  pageCount: z.number().int().min(4).max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const normalizedPayload = {
      ...payload,
      fullFactUploadedFontBytes: payload.fullFactUploadedFont
        ? new Uint8Array(Buffer.from(payload.fullFactUploadedFont.bytesBase64, "base64"))
        : undefined,
      fullFactTitleUploadedFontBytes: payload.fullFactTitleUploadedFont
        ? new Uint8Array(Buffer.from(payload.fullFactTitleUploadedFont.bytesBase64, "base64"))
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
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
