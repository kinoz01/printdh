import { PDFFont, PDFDocument, PDFEmbeddedPage, PDFImage, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { PAGE_HEIGHT, PAGE_WIDTH, POINTS_PER_INCH } from "./constants";
import type { ImageAsset, PdfAsset } from "./types";

const DEFAULT_CONTENT_PADDING = 0.32 * POINTS_PER_INCH;
const PAGE_NUMBER_PADDING = 0.35 * POINTS_PER_INCH;
const PAGE_NUMBER_RADIUS = 0.24 * POINTS_PER_INCH;
const PAGE_NUMBER_TEXT_COLOR = rgb(1, 1, 1);
type PageNumberPosition = "alternating" | "center";

interface EmbeddedContentPdfPage {
  page: PDFEmbeddedPage;
}

export interface RenderUploadedPdfPagesOptions {
  backgroundImageAssets?: ImageAsset[];
  contentPdfAssets?: PdfAsset[];
  pageWidth?: number;
  pageHeight?: number;
  totalPages?: number;
  contentPadding?: number;
  sequentialBackgroundImages?: boolean;
  fineTuneBackgrounds?: boolean;
  backgroundlessContentImageIndexes?: number[];
  stretchContentImages?: boolean;
  showPageNumbers?: boolean;
  pageNumberPosition?: PageNumberPosition;
  pageNumberFill?: ReturnType<typeof rgb>;
}

export async function renderUploadedPdfPages(options: RenderUploadedPdfPagesOptions): Promise<Uint8Array> {
  const {
    backgroundImageAssets = [],
    contentPdfAssets = [],
    pageWidth = PAGE_WIDTH,
    pageHeight = PAGE_HEIGHT,
    totalPages,
    contentPadding = DEFAULT_CONTENT_PADDING,
    sequentialBackgroundImages = false,
    fineTuneBackgrounds = false,
    backgroundlessContentImageIndexes = [],
    stretchContentImages = false,
    showPageNumbers = false,
    pageNumberPosition = "alternating",
    pageNumberFill = rgb(0, 0, 0),
  } = options;

  if (!contentPdfAssets.length) {
    throw new Error("Upload at least one content PDF.");
  }

  const pdf = await PDFDocument.create();
  const backgroundImages = await embedImages(pdf, backgroundImageAssets);
  const contentPages = await embedPdfContentPages(pdf, contentPdfAssets);
  if (!contentPages.length) {
    throw new Error("The uploaded PDFs do not contain any pages.");
  }

  const pageCount = Math.max(1, Math.floor(totalPages ?? contentPages.length));
  const resolvedContentPadding = Math.max(0, contentPadding);
  const pageNumberFont = showPageNumbers ? await pdf.embedFont(StandardFonts.HelveticaBold) : null;
  const backgroundlessContentIndexes = fineTuneBackgrounds
    ? new Set(backgroundlessContentImageIndexes.filter((index) => index < contentPages.length))
    : new Set<number>();
  let backgroundPageIndex = 0;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    const contentIndex = pageIndex % contentPages.length;
    const contentPage = contentPages[contentIndex];
    const isBackgroundlessContent = backgroundlessContentIndexes.has(contentIndex);
    const shouldDrawBackground = !isBackgroundlessContent;
    if (shouldDrawBackground && backgroundImages.length) {
      const backgroundIndex = resolveBackgroundIndex(
        backgroundPageIndex,
        backgroundImages.length,
        sequentialBackgroundImages
      );
      drawStretchedImage(page, backgroundImages[backgroundIndex], pageWidth, pageHeight);
      backgroundPageIndex += 1;
    } else {
      drawWhiteBackground(page, pageWidth, pageHeight);
    }

    if (stretchContentImages || isBackgroundlessContent) {
      drawStretchedPdfPage(page, contentPage.page, pageWidth, pageHeight);
    } else {
      drawContainedPdfPage(page, contentPage.page, pageWidth, pageHeight, resolvedContentPadding);
    }

    if (pageNumberFont && pageIndex > 0 && pageIndex < pageCount - 1) {
      drawPageNumber(page, pageIndex + 1, pageNumberFont, pageNumberFill, pageWidth, pageNumberPosition);
    }
  }

  return pdf.save();
}

async function embedPdfContentPages(pdf: PDFDocument, assets: PdfAsset[]) {
  const pages: EmbeddedContentPdfPage[] = [];
  for (const asset of assets) {
    try {
      const sourcePdf = await PDFDocument.load(asset.bytes, { ignoreEncryption: true });
      const sourcePages = sourcePdf.getPages();
      const embeddedPages = await pdf.embedPages(sourcePages);
      for (const page of embeddedPages) {
        pages.push({ page });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown PDF error";
      throw new Error(`Unable to read ${asset.name || "uploaded PDF"}: ${detail}`);
    }
  }
  return pages;
}

function drawWhiteBackground(page: PDFPage, pageWidth: number, pageHeight: number) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: rgb(1, 1, 1),
  });
}

async function embedImages(pdf: PDFDocument, assets: ImageAsset[]) {
  const images: PDFImage[] = [];
  for (const asset of assets) {
    const image = asset.mimeType === "image/png" ? await pdf.embedPng(asset.bytes) : await pdf.embedJpg(asset.bytes);
    images.push(image);
  }
  return images;
}

function resolveBackgroundIndex(pageIndex: number, backgroundCount: number, sequentialBackgroundImages: boolean) {
  if (sequentialBackgroundImages) {
    return pageIndex % backgroundCount;
  }
  if (backgroundCount <= 1 || pageIndex === 0) {
    return 0;
  }
  return (Math.floor((pageIndex - 1) / 2) + 1) % backgroundCount;
}

function drawStretchedImage(page: PDFPage, image: PDFImage, pageWidth: number, pageHeight: number) {
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });
}

function drawStretchedPdfPage(page: PDFPage, contentPage: PDFEmbeddedPage, pageWidth: number, pageHeight: number) {
  page.drawPage(contentPage, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });
}

function drawContainedPdfPage(
  page: PDFPage,
  contentPage: PDFEmbeddedPage,
  pageWidth: number,
  pageHeight: number,
  padding: number
) {
  const availableWidth = Math.max(1, pageWidth - padding * 2);
  const availableHeight = Math.max(1, pageHeight - padding * 2);
  const scale = Math.min(availableWidth / contentPage.width, availableHeight / contentPage.height);
  const width = contentPage.width * scale;
  const height = contentPage.height * scale;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;

  page.drawPage(contentPage, { x, y, width, height });
}

function drawPageNumber(
  page: PDFPage,
  pageNumber: number,
  font: PDFFont,
  fill: ReturnType<typeof rgb>,
  pageWidth: number,
  position: PageNumberPosition
) {
  const isEvenPage = pageNumber % 2 === 0;
  const centerX =
    position === "center"
      ? pageWidth / 2
      : isEvenPage
        ? PAGE_NUMBER_PADDING + PAGE_NUMBER_RADIUS
        : pageWidth - PAGE_NUMBER_PADDING - PAGE_NUMBER_RADIUS;
  const centerY = PAGE_NUMBER_PADDING + PAGE_NUMBER_RADIUS;
  page.drawCircle({
    x: centerX,
    y: centerY,
    size: PAGE_NUMBER_RADIUS,
    color: fill,
  });

  const text = String(pageNumber);
  const fontSize = pageNumber >= 100 ? 11 : 13;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize, { descender: false });
  page.drawText(text, {
    x: centerX - textWidth / 2,
    y: centerY - textHeight / 2,
    size: fontSize,
    font,
    color: PAGE_NUMBER_TEXT_COLOR,
  });
}
