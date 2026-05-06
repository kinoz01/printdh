import fontkit, { type Font } from "@pdf-lib/fontkit";
import { promises as fs } from "fs";
import { PDFDocument, PDFFont } from "pdf-lib";

const UNICODE_FALLBACK_FONT_PATHS = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
] as const;

export interface EmbeddedFontSupport {
  pdfFont: PDFFont;
  fontData: Font;
}

export async function loadUnicodeFallbackFont(pdf: PDFDocument): Promise<EmbeddedFontSupport | null> {
  for (const fontPath of UNICODE_FALLBACK_FONT_PATHS) {
    try {
      const bytes = new Uint8Array(await fs.readFile(fontPath));
      const fontData = parseFontData(bytes);
      if (!fontData) {
        continue;
      }
      pdf.registerFontkit(fontkit);
      const pdfFont = await pdf.embedFont(bytes, { subset: true });
      return { pdfFont, fontData };
    } catch {
      continue;
    }
  }
  return null;
}

export function parseFontData(bytes: Uint8Array): Font | null {
  try {
    return fontkit.create(bytes);
  } catch {
    return null;
  }
}
