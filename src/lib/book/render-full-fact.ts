import { PDFFont, PDFDocument, PDFImage, PDFPage } from "pdf-lib";
import {
  DEFAULT_IMAGE_LIBRARY,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  TOTAL_PAGES,
} from "./constants";
import { loadImageAssets } from "./assets";
import { createOverlayConfig } from "./overlay-config";
import { OverlayConfig, StandardFontName, TextEntry } from "./types";
import { buildEntryStory, drawParagraphs, estimateStoryHeight, ParagraphLayout } from "./text-layout";
import { drawNumberBadge } from "./overlay-helpers";
import { hexToRgb } from "./colors";

const PLACEHOLDER = "Add another fact for stack #{}.";

const CARD_OVERLAY_CONFIG = createOverlayConfig({
  showOnEven: true,
  showOnOdd: false,
  showNumber: true,
  opacity: 0.6,
});

const STACK_LAYOUT = {
  marginX: 0.75 * 72,
  topMargin: 0.75 * 72,
  bottomMargin: 0.75 * 72,
  gap: 0.7 * 72,
};

export interface FullFactOptions {
  entries: TextEntry[];
  factsPerPage: number;
  imageLibrary?: string;
  pageWidth?: number;
  pageHeight?: number;
  totalPages?: number;
}

export async function renderFullFactBook(options: FullFactOptions) {
  const {
    entries,
    factsPerPage,
    imageLibrary = DEFAULT_IMAGE_LIBRARY,
    pageWidth = PAGE_WIDTH,
    pageHeight = PAGE_HEIGHT,
    totalPages = TOTAL_PAGES,
  } = options;
  const evenPageCount = Math.floor(totalPages / 2);
  const overlaysNeeded = evenPageCount * factsPerPage;
  const filledEntries = padEntries(entries, overlaysNeeded, PLACEHOLDER).map((entry, index) => ({
    ...entry,
    number: index + 1,
  }));

  const chunks: TextEntry[][] = [];
  for (let idx = 0; idx < filledEntries.length; idx += factsPerPage) {
    chunks.push(filledEntries.slice(idx, idx + factsPerPage));
  }

  const pdf = await PDFDocument.create();
  const fontCache = new Map<StandardFontName, PDFFont>();
  const getFont = async (font: StandardFontName) => {
    if (!fontCache.has(font)) {
      fontCache.set(font, await pdf.embedFont(font));
    }
    return fontCache.get(font)!;
  };

  const assets = await loadImageAssets(imageLibrary);
  const embeddedImages: PDFImage[] = [];
  for (const asset of assets) {
    const image =
      asset.mimeType === "image/png" || asset.mimeType === "image/webp"
        ? await pdf.embedPng(asset.bytes)
        : await pdf.embedJpg(asset.bytes);
    embeddedImages.push(image);
  }

  let chunkIndex = 0;
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    drawImageBackground(page, embeddedImages, assets, pageIndex, pageWidth, pageHeight);
    if (pageIndex % 2 === 1 && chunkIndex < chunks.length) {
      await drawFactStack(page, chunks[chunkIndex], CARD_OVERLAY_CONFIG, getFont, pageWidth, pageHeight);
      chunkIndex++;
    }
  }

  return pdf.save();
}

function padEntries(entries: TextEntry[], required: number, placeholder: string) {
  const clones = entries.map((entry) => ({ ...entry }));
  while (clones.length < required) {
    const label = `${clones.length + 1}`;
    const message = placeholder.includes("{}") ? placeholder.replace("{}", label) : `${placeholder} ${label}`;
    clones.push({ body: message });
  }
  return clones.slice(0, required);
}

function drawImageBackground(
  page: PDFPage,
  embedded: PDFImage[],
  assets: { width: number; height: number }[],
  index: number,
  pageWidth: number,
  pageHeight: number
) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: hexToRgb("#ffffff"),
  });
  if (!embedded.length) {
    return;
  }
  const assetIndex = index % embedded.length;
  const image = embedded[assetIndex];
  const meta = assets[assetIndex];
  const scale = Math.max(pageWidth / meta.width, pageHeight / meta.height);
  const width = meta.width * scale;
  const height = meta.height * scale;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;
  page.drawImage(image, { x, y, width, height });
}

async function drawFactStack(
  page: PDFPage,
  entries: TextEntry[],
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  pageWidth: number,
  pageHeight: number
) {
  if (!entries.length) {
    return;
  }
  const cardWidth = pageWidth - 2 * STACK_LAYOUT.marginX;
  const textWidth = Math.max(4, cardWidth - 2 * config.horizontalPadding);
  const availableHeight = pageHeight - STACK_LAYOUT.topMargin - STACK_LAYOUT.bottomMargin;
  const gap = entries.length > 1 ? STACK_LAYOUT.gap : 0;
  const gapSpace = gap * (entries.length - 1);
  const perCardCap = Math.max(1, (availableHeight - gapSpace) / entries.length);
  const maxCardHeight = Math.max(
    config.minHeight,
    Math.min(config.maxHeight, perCardCap)
  );

  const prepared: Array<{ entry: TextEntry; story: ParagraphLayout[]; height: number }> = [];
  for (const entry of entries) {
    const story = await buildEntryStory(entry, config, getFont, textWidth);
    const estimated = estimateStoryHeight(story);
    const cardHeight = Math.max(
      config.minHeight,
      Math.min(maxCardHeight, estimated + 2 * config.verticalPadding)
    );
    prepared.push({ entry, story, height: cardHeight });
  }

  const totalHeight =
    prepared.reduce((sum, card) => sum + card.height, 0) + gap * (prepared.length - 1);
  let stackBottom = Math.max(STACK_LAYOUT.bottomMargin, (pageHeight - totalHeight) / 2);
  const stackTop = stackBottom + totalHeight;
  if (stackTop > pageHeight - STACK_LAYOUT.topMargin) {
    const shift = stackTop - (pageHeight - STACK_LAYOUT.topMargin);
    stackBottom = Math.max(STACK_LAYOUT.bottomMargin, stackBottom - shift);
  }

  let cursorY = stackBottom + totalHeight;
  for (const card of prepared) {
    cursorY -= card.height;
    drawCard(
      page,
      card.entry,
      card.story,
      STACK_LAYOUT.marginX,
      cursorY,
      cardWidth,
      card.height,
      config,
      getFont
    );
    cursorY -= gap;
  }
}

async function drawCard(
  page: PDFPage,
  entry: TextEntry,
  story: ParagraphLayout[],
  x: number,
  y: number,
  width: number,
  height: number,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: config.fillColor,
    borderColor: config.strokeColor,
    borderWidth: config.strokeWidth,
    opacity: config.opacity,
    borderOpacity: config.opacity,
  });
  let cursorY = y + height - config.verticalPadding;
  for (const paragraph of story) {
    cursorY = drawParagraphs(page, paragraph, x + config.horizontalPadding, cursorY, width - 2 * config.horizontalPadding);
  }
  if (config.showNumber && typeof entry.number === "number") {
    await drawNumberBadge(page, entry.number, x, y, height, config, getFont);
  }
}
