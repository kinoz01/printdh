import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateBook } from "@/lib/book/generator";

const schema = z.object({
  mode: z.enum([
    "facts",
    "facts-both",
    "list",
    "list-description",
    "list-description-even",
    "image-only",
    "full-fact",
    "dictionary",
  ]),
  facts: z.string().optional(),
  list: z.string().optional(),
  listDescription: z.string().optional(),
  imageLibrary: z.string().optional(),
  overlayOpacity: z.number().optional(),
  factsPerPage: z.number().int().positive().optional(),
  targetImageSize: z.number().positive().optional(),
  pageSize: z.enum(["square", "us-letter"]).optional(),
  pageCount: z.number().int().min(4).max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const pdfBytes = await generateBook(payload);
    const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
    new Uint8Array(pdfBuffer).set(pdfBytes);
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
