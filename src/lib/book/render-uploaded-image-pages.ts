import { PDFFont, PDFDocument, PDFImage, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { PAGE_HEIGHT, PAGE_WIDTH, POINTS_PER_INCH, TOTAL_PAGES } from "./constants";
import type { ImageAsset } from "./types";

const DEFAULT_CONTENT_PADDING = 0.32 * POINTS_PER_INCH;
const PAGE_NUMBER_PADDING = 0.35 * POINTS_PER_INCH;
const PAGE_NUMBER_RADIUS = 0.24 * POINTS_PER_INCH;
const PAGE_NUMBER_TEXT_COLOR = rgb(1, 1, 1);
type PageNumberPosition = "alternating" | "center";

interface ImageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderUploadedImagePagesOptions {
  backgroundImageAssets?: ImageAsset[];
  contentImageAssets?: ImageAsset[];
  pageWidth?: number;
  pageHeight?: number;
  totalPages?: number;
  contentPadding?: number;
  sequentialBackgroundImages?: boolean;
  fineTuneBackgrounds?: boolean;
  backgroundlessContentImageIndexes?: number[];
  stretchContentImages?: boolean;
  imageFrameEnabled?: boolean;
  imageFrameThickness?: number;
  showPageNumbers?: boolean;
  pageNumberPosition?: PageNumberPosition;
  pageNumberFill?: ReturnType<typeof rgb>;
}

export async function renderUploadedImagePages(options: RenderUploadedImagePagesOptions): Promise<Uint8Array> {
  const {
    backgroundImageAssets = [],
    contentImageAssets = [],
    pageWidth = PAGE_WIDTH,
    pageHeight = PAGE_HEIGHT,
    totalPages = TOTAL_PAGES,
    contentPadding = DEFAULT_CONTENT_PADDING,
    sequentialBackgroundImages = false,
    fineTuneBackgrounds = false,
    backgroundlessContentImageIndexes = [],
    stretchContentImages = false,
    imageFrameEnabled = false,
    imageFrameThickness = 0,
    showPageNumbers = false,
    pageNumberPosition = "alternating",
    pageNumberFill = rgb(0, 0, 0),
  } = options;

  if (!contentImageAssets.length) {
    throw new Error("Upload at least one content image.");
  }

  const pageCount = Math.max(1, Math.floor(totalPages));
  const pdf = await PDFDocument.create();
  const backgroundImages = await embedImages(pdf, backgroundImageAssets);
  const contentImages = await embedImages(pdf, contentImageAssets);
  const resolvedContentPadding = Math.max(0, contentPadding);
  const resolvedImageFrameThickness = imageFrameEnabled
    ? Math.min(Math.max(0, imageFrameThickness), pageWidth / 2, pageHeight / 2)
    : 0;
  const pageNumberFont = showPageNumbers ? await pdf.embedFont(StandardFonts.HelveticaBold) : null;
  const backgroundlessContentIndexes = fineTuneBackgrounds
    ? new Set(backgroundlessContentImageIndexes.filter((index) => index < contentImages.length))
    : new Set<number>();
  let backgroundPageIndex = 0;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    const contentIndex = pageIndex % contentImages.length;
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

    let contentBounds: ImageBounds;
    if (stretchContentImages || isBackgroundlessContent) {
      contentBounds = drawStretchedImage(page, contentImages[contentIndex], pageWidth, pageHeight);
    } else {
      contentBounds = drawContainedImage(
        page,
        contentImages[contentIndex],
        contentImageAssets[contentIndex],
        pageWidth,
        pageHeight,
        resolvedContentPadding + resolvedImageFrameThickness
      );
    }

    if (resolvedImageFrameThickness > 0) {
      drawImageFrame(page, contentBounds, pageWidth, pageHeight, resolvedImageFrameThickness);
    }

    if (pageNumberFont && pageIndex > 0 && pageIndex < pageCount - 1) {
      drawPageNumber(page, pageIndex + 1, pageNumberFont, pageNumberFill, pageWidth, pageNumberPosition);
    }
  }

  return pdf.save();
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

function drawStretchedImage(page: PDFPage, image: PDFImage, pageWidth: number, pageHeight: number): ImageBounds {
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });
  return { x: 0, y: 0, width: pageWidth, height: pageHeight };
}

function drawContainedImage(
  page: PDFPage,
  image: PDFImage,
  assetMeta: { width: number; height: number },
  pageWidth: number,
  pageHeight: number,
  padding: number
): ImageBounds {
  const availableWidth = Math.max(1, pageWidth - padding * 2);
  const availableHeight = Math.max(1, pageHeight - padding * 2);
  const scale = Math.min(availableWidth / assetMeta.width, availableHeight / assetMeta.height);
  const width = assetMeta.width * scale;
  const height = assetMeta.height * scale;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;

  page.drawImage(image, { x, y, width, height });
  return { x, y, width, height };
}

function drawImageFrame(
  page: PDFPage,
  bounds: ImageBounds,
  pageWidth: number,
  pageHeight: number,
  thickness: number
) {
  const x = Math.max(thickness / 2, bounds.x - thickness / 2);
  const y = Math.max(thickness / 2, bounds.y - thickness / 2);
  const right = Math.min(pageWidth - thickness / 2, bounds.x + bounds.width + thickness / 2);
  const top = Math.min(pageHeight - thickness / 2, bounds.y + bounds.height + thickness / 2);
  page.drawRectangle({
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, top - y),
    borderColor: rgb(0, 0, 0),
    borderWidth: thickness,
  });
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
