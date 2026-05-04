import { NextRequest, NextResponse } from "next/server";
import { buildBookFontPreviewUrl, listBookFonts, readBookFont } from "@/lib/book/font-library";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const file = searchParams.get("file");
    if (file) {
      const font = await readBookFont(file);
      if (!font) {
        return NextResponse.json({ error: "Font not found" }, { status: 404 });
      }
      const body = new ArrayBuffer(font.bytes.byteLength);
      new Uint8Array(body).set(font.bytes);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": font.mimeType,
          "Cache-Control": "no-store",
        },
      });
    }

    const fonts = await listBookFonts();
    return NextResponse.json({
      fonts: fonts.map((font) => ({
        ...font,
        previewUrl: buildBookFontPreviewUrl(font.id),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read fonts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
