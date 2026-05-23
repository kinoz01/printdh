import { PDFDocument, PDFFont, PDFImage } from "pdf-lib";
import { DEFAULT_IMAGE_LIBRARY, PAGE_HEIGHT, PAGE_WIDTH, TOTAL_PAGES } from "./constants";
import { loadImageAssets } from "./assets";
import { hexToRgb } from "./colors";
import { StandardFontName } from "./types";
import type { ImageAsset } from "./types";

const DEFAULT_TARGET_SIZE = 7.7 * 72;

export interface DictionaryOptions {
  imageLibrary?: string;
  imageAssets?: ImageAsset[];
  targetSize?: number;
  pageWidth?: number;
  pageHeight?: number;
  totalPages?: number;
}

export async function renderDictionaryBook(options: DictionaryOptions = {}) {
  const {
    imageLibrary = DEFAULT_IMAGE_LIBRARY,
    imageAssets: providedImageAssets,
    targetSize = DEFAULT_TARGET_SIZE,
    pageWidth = PAGE_WIDTH,
    pageHeight = PAGE_HEIGHT,
    totalPages = TOTAL_PAGES,
  } = options;
  const pdf = await PDFDocument.create();
  const imageAssets = providedImageAssets ?? (await loadImageAssets(imageLibrary));
  const embeddedImages: { image: PDFImage; width: number; height: number }[] = [];
  for (const asset of imageAssets) {
    const image = asset.mimeType === "image/png" ? await pdf.embedPng(asset.bytes) : await pdf.embedJpg(asset.bytes);
    embeddedImages.push({ image, width: asset.width, height: asset.height });
  }
  const fontCache = new Map<StandardFontName, PDFFont>();
  const getFont = async (font: StandardFontName) => {
    if (!fontCache.has(font)) {
      fontCache.set(font, await pdf.embedFont(font));
    }
    return fontCache.get(font)!;
  };

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: hexToRgb("#ffffff"),
    });

    if (embeddedImages.length) {
      const asset = embeddedImages[pageIndex % embeddedImages.length];
      const scale = Math.max(targetSize / asset.width, targetSize / asset.height);
      const drawWidth = asset.width * scale;
      const drawHeight = asset.height * scale;
      const x = (pageWidth - drawWidth) / 2;
      const y = (pageHeight - drawHeight) / 2;
      page.drawImage(asset.image, { x, y, width: drawWidth, height: drawHeight });
    } else {
      const x = (pageWidth - targetSize) / 2;
      const y = (pageHeight - targetSize) / 2;
      page.drawRectangle({
        x,
        y,
        width: targetSize,
        height: targetSize,
        color: hexToRgb("#cccccc"),
      });
      const font = await getFont(StandardFontName.Helvetica);
      const text = "Add imagery to ./images/";
      const textWidth = font.widthOfTextAtSize(text, 14);
      page.drawText(text, {
        x: (pageWidth - textWidth) / 2,
        y: pageHeight / 2,
        size: 14,
        font,
        color: hexToRgb("#000000"),
      });
    }
  }

  return pdf.save();
}
