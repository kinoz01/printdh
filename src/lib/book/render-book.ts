import fontkit from "@pdf-lib/fontkit";
import { PDFFont, PDFDocument, PDFImage, PDFPage } from "pdf-lib";
import { DEFAULT_IMAGE_LIBRARY, PAGE_HEIGHT, PAGE_WIDTH, TOTAL_PAGES } from "./constants";
import { createOverlayConfig } from "./overlay-config";
import { readBookFont } from "./font-library";
import type { OverlayConfig, TextEntry } from "./types";
import { StandardFontName } from "./types";
import { loadImageAssets } from "./assets";
import { hexToRgb, mixColors } from "./colors";
import { drawParagraphs, estimateStoryHeight, layoutText, layoutTextWithFont, ParagraphLayout } from "./text-layout";
import { drawNumberBadge, drawRoundedRectangle } from "./overlay-helpers";

export interface RenderBookOptions {
  entries: TextEntry[];
  placeholder: string;
  imageLibrary?: string;
  overlayOverrides?: Partial<OverlayConfig>;
  boxTextFontId?: string;
  boxTextFontBytes?: Uint8Array;
  pageWidth?: number;
  pageHeight?: number;
  totalPages?: number;
}

export async function renderBook(options: RenderBookOptions): Promise<Uint8Array> {
  const {
    entries,
    placeholder,
    imageLibrary = DEFAULT_IMAGE_LIBRARY,
    overlayOverrides,
    boxTextFontId,
    boxTextFontBytes,
    pageWidth = PAGE_WIDTH,
    pageHeight = PAGE_HEIGHT,
    totalPages = TOTAL_PAGES,
  } = options;
  const overlayConfig = createOverlayConfig(overlayOverrides);
  const overlaysNeeded = countOverlays(overlayConfig, totalPages);
  const preparedEntries = prepareEntries(entries, overlaysNeeded, placeholder, overlayConfig.repeatEntries);

  const pdf = await PDFDocument.create();
  const fontCache = new Map<StandardFontName, PDFFont>();
  const getFont = async (font: StandardFontName) => {
    if (!fontCache.has(font)) {
      fontCache.set(font, await pdf.embedFont(font));
    }
    return fontCache.get(font)!;
  };
  let customBoxTextFont: PDFFont | null = null;
  if (boxTextFontBytes || boxTextFontId) {
    const selectedBytes =
      boxTextFontBytes ??
      (boxTextFontId ? (await readBookFont(boxTextFontId))?.bytes ?? null : null);
    if (!selectedBytes) {
      throw new Error(`Selected font "${boxTextFontId}" was not found in ./fonts.`);
    }
    pdf.registerFontkit(fontkit);
    customBoxTextFont = await pdf.embedFont(selectedBytes, { subset: true });
  }

  const imageAssets = await loadImageAssets(imageLibrary);
  const embeddedImages: PDFImage[] = [];
  for (const asset of imageAssets) {
    const image = asset.mimeType === "image/png" ? await pdf.embedPng(asset.bytes) : await pdf.embedJpg(asset.bytes);
    embeddedImages.push(image);
  }

  let entryIndex = 0;
  let imageIndex = 0;

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    const evenPage = pageIndex % 2 === 1;
    const showImage = evenPage ? overlayConfig.showImageOnEven : overlayConfig.showImageOnOdd;
    const entry = shouldPlaceOverlay(pageIndex, overlayConfig) ? preparedEntries[entryIndex++] : null;
    drawPageBackground(page, entry, overlayConfig, showImage, pageWidth, pageHeight);

    if (showImage) {
      if (embeddedImages.length) {
        const assetIndex = imageIndex % embeddedImages.length;
        drawImage(page, embeddedImages[assetIndex], imageAssets[assetIndex], pageWidth, pageHeight);
      } else {
        await drawPlaceholder(page, getFont, pageWidth, pageHeight);
      }
      imageIndex++;
    }

    if (entry) {
      await drawOverlay(page, entry, overlayConfig, getFont, customBoxTextFont, pageWidth, pageHeight);
    }
  }

  return pdf.save();
}

function countOverlays(config: OverlayConfig, totalPages: number) {
  let overlays = 0;
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    if (shouldPlaceOverlay(pageIndex, config)) {
      overlays++;
    }
  }
  return overlays;
}

function prepareEntries(
  entries: TextEntry[],
  required: number,
  placeholder: string,
  repeatEntries: boolean
) {
  const clones = entries.map((entry) => ({ ...entry }));
  let prepared: TextEntry[] = [];
  if (repeatEntries && clones.length) {
    for (let index = 0; index < required; index++) {
      prepared.push({ ...clones[index % clones.length] });
    }
  } else {
    while (clones.length < required) {
      const label = `${clones.length + 1}`;
      const message = placeholder.includes("{}") ? placeholder.replace("{}", label) : `${placeholder} ${label}`;
      clones.push({ body: message });
    }
    prepared = clones.slice(0, required);
  }
  return prepared.map((entry, index) => ({ ...entry, number: index + 1 }));
}

function shouldPlaceOverlay(pageIndex: number, config: OverlayConfig) {
  if (config.showOnEven && pageIndex % 2 === 1) {
    return true;
  }
  if (config.showOnOdd && pageIndex % 2 === 0) {
    return true;
  }
  return false;
}

function drawPageBackground(
  page: PDFPage,
  entry: TextEntry | null,
  config: OverlayConfig,
  hasImage: boolean,
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
  if (hasImage || !config.drawTextBackground) {
    return;
  }
  const base = config.textPageBackground;
  const accent = entry?.accentColor && config.useEntryAccentForBackground ? entry.accentColor : null;
  const blended = accent ? mixColors(base, accent, config.backgroundMixAmount) : base;
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: blended,
  });
}

function drawImage(
  page: PDFPage,
  image: PDFImage,
  assetMeta: { width: number; height: number },
  pageWidth: number,
  pageHeight: number
) {
  const scale = Math.max(pageWidth / assetMeta.width, pageHeight / assetMeta.height);
  const width = assetMeta.width * scale;
  const height = assetMeta.height * scale;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;
  page.drawImage(image, { x, y, width, height });
}

async function drawPlaceholder(
  page: PDFPage,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  pageWidth: number,
  pageHeight: number
) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: hexToRgb("#d8d5cf"),
  });
  const font = await getFont(StandardFontName.TimesRomanItalic);
  const text = "Add imagery to ./images/";
  const textWidth = font.widthOfTextAtSize(text, 18);
  page.drawText(text, {
    x: (pageWidth - textWidth) / 2,
    y: pageHeight / 2,
    size: 18,
    font,
    color: hexToRgb("#6b6257"),
  });
}

async function drawOverlay(
  page: PDFPage,
  entry: TextEntry,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  customBoxTextFont: PDFFont | null,
  pageWidth: number,
  pageHeight: number
) {
  if (entry.skipOverlay) {
    return;
  }
  const baseOverlayWidth = pageWidth - config.margin * 2;
  const maxTextWidth = Math.max(20, baseOverlayWidth - config.horizontalPadding * 2);
  const resolvedTextWidth = await resolveTextWidth(entry, config, getFont, customBoxTextFont, maxTextWidth);
  const textWidth = resolvedTextWidth ?? maxTextWidth;
  const story = await buildOverlayStory(entry, config, getFont, textWidth, customBoxTextFont);
  if (!story.length) {
    return;
  }
  const overlayWidth = Math.max(40, textWidth + config.horizontalPadding * 2);
  const estimatedHeight = estimateStoryHeight(story);
  const maxAvailableHeight = Math.min(config.maxHeight, pageHeight - config.margin * 2);
  const overlayHeight = Math.min(
    Math.max(config.minHeight, estimatedHeight + config.verticalPadding * 2),
    maxAvailableHeight
  );
  const centerOverlay = config.centerHorizontally || resolvedTextWidth !== null;
  const overlayX = centerOverlay ? (pageWidth - overlayWidth) / 2 : config.margin;
  const overlayY = config.centerVertically ? (pageHeight - overlayHeight) / 2 : config.margin;

  if (config.drawOverlayBox) {
    const fillColor =
      config.useEntryAccentForFill && entry.accentColor ? entry.accentColor : config.fillColor;
    const strokeColor =
      config.useEntryAccentForStroke && entry.accentColor ? entry.accentColor : config.strokeColor;
    drawRoundedRectangle(page, {
      x: overlayX,
      y: overlayY,
      width: overlayWidth,
      height: overlayHeight,
      color: fillColor,
      borderColor: strokeColor,
      borderWidth: config.strokeWidth,
      radius: config.roundness,
      opacity: config.opacity,
      borderOpacity: config.opacity,
    });
  }

  if (config.showNumber && typeof entry.number === "number") {
    await drawNumberBadge(page, entry.number, overlayX, overlayY, overlayHeight, config, getFont);
  }

  const availableHeight = overlayHeight - config.verticalPadding * 2;
  const extraSpace = Math.max(0, availableHeight - estimatedHeight);
  const yStart = config.centerTextVertically
    ? overlayY + overlayHeight - config.verticalPadding - extraSpace / 2 - config.textOffsetTop
    : overlayY + overlayHeight - config.verticalPadding - config.textOffsetTop;

  let cursorY = yStart;
  for (const paragraph of story) {
    cursorY = drawParagraphs(page, paragraph, overlayX + config.horizontalPadding, cursorY, textWidth);
  }
}

async function resolveTextWidth(
  entry: TextEntry,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  customBoxTextFont: PDFFont | null,
  maxTextWidth: number
) {
  const widestFit = await buildOverlayStory(entry, config, getFont, maxTextWidth, customBoxTextFont);
  if (!widestFit.length) {
    return null;
  }
  if (config.fitContentWidth) {
    return fitStoryWidth(entry, config, getFont, customBoxTextFont, maxTextWidth);
  }
  return detectSingleLineWidth(entry, widestFit, maxTextWidth, config);
}

async function fitStoryWidth(
  entry: TextEntry,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  customBoxTextFont: PDFFont | null,
  maxTextWidth: number
) {
  const minimumWidth = Math.min(maxTextWidth, Math.max(20, config.contentWidthMin));
  const candidateWidths = buildCandidateWidths(minimumWidth, maxTextWidth);
  for (const width of candidateWidths) {
    const story = await buildOverlayStory(entry, config, getFont, width, customBoxTextFont);
    if (!story.length) {
      continue;
    }
    if (measureWidestLine(story) > width) {
      continue;
    }
    if (countStoryLines(story) <= config.contentWidthMaxLines) {
      return width;
    }
  }
  return null;
}

async function buildOverlayStory(
  entry: TextEntry,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  maxWidth: number,
  customBoxTextFont: PDFFont | null
) {
  const story: ParagraphLayout[] = [];
  if (entry.title && config.titleStyle) {
    if (customBoxTextFont) {
      story.push(...layoutTextWithFont(entry.title, config.titleStyle, customBoxTextFont, maxWidth));
    } else {
      story.push(...(await layoutText(entry.title, config.titleStyle, getFont, maxWidth)));
    }
  }

  const body = entry.body || "Share your fact here.";
  if (customBoxTextFont) {
    story.push(...layoutTextWithFont(body, config.bodyStyle, customBoxTextFont, maxWidth));
  } else {
    story.push(...(await layoutText(body, config.bodyStyle, getFont, maxWidth)));
  }
  return story;
}

function buildCandidateWidths(minimumWidth: number, maxTextWidth: number) {
  const min = Math.max(20, Math.min(minimumWidth, maxTextWidth));
  if (min >= maxTextWidth) {
    return [maxTextWidth];
  }
  return [min, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
    .map((value) => (value <= 1 ? maxTextWidth * value : value))
    .map((value) => Math.max(min, Math.min(maxTextWidth, value)))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left - right);
}

function countStoryLines(story: ParagraphLayout[]) {
  return story.reduce((count, paragraph) => count + Math.max(1, paragraph.lines.length), 0);
}

function measureWidestLine(story: ParagraphLayout[]) {
  let widest = 0;
  for (const paragraph of story) {
    for (const line of paragraph.lines) {
      const width = paragraph.font.widthOfTextAtSize(line, paragraph.style.fontSize);
      if (width > widest) {
        widest = width;
      }
    }
  }
  return widest;
}

function detectSingleLineWidth(
  entry: TextEntry,
  story: ParagraphLayout[],
  maxWidth: number,
  config: OverlayConfig
) {
  if (entry.title || story.length !== 1) {
    return null;
  }
  const paragraph = story[0];
  if (paragraph.lines.length !== 1) {
    return null;
  }
  const text = paragraph.lines[0];
  if (!text) {
    return null;
  }
  const measured = paragraph.font.widthOfTextAtSize(text, paragraph.style.fontSize);
  if (measured <= 0 || measured > maxWidth) {
    return null;
  }
  const snug = measured + config.horizontalPadding * 0.5;
  return Math.min(maxWidth, snug);
}
