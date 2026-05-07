import fontkit from "@pdf-lib/fontkit";
import { PDFFont, PDFDocument, PDFImage, PDFPage } from "pdf-lib";
import { DEFAULT_IMAGE_LIBRARY, PAGE_HEIGHT, PAGE_WIDTH, TOTAL_PAGES } from "./constants";
import { createOverlayConfig } from "./overlay-config";
import { resolveEmojiInlineAsset, type InlineImageAsset } from "./emoji-inline-assets";
import { readBookFont } from "./font-library";
import { loadUnicodeFallbackFont, parseFontData } from "./font-support";
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
  skipOverlayPageIndexes?: number[];
  boxTitleFontId?: string;
  boxTitleFontBytes?: Uint8Array;
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
    skipOverlayPageIndexes = [],
    boxTitleFontId,
    boxTitleFontBytes,
    boxTextFontId,
    boxTextFontBytes,
    pageWidth = PAGE_WIDTH,
    pageHeight = PAGE_HEIGHT,
    totalPages = TOTAL_PAGES,
  } = options;
  const overlayConfig = createOverlayConfig(overlayOverrides);
  const skipOverlayPages = new Set(
    skipOverlayPageIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < totalPages)
  );
  const overlaysNeeded = countOverlays(overlayConfig, totalPages, skipOverlayPages);
  const preparedEntries = prepareEntries(entries, overlaysNeeded, placeholder, overlayConfig.repeatEntries);

  const pdf = await PDFDocument.create();
  const fontCache = new Map<StandardFontName, PDFFont>();
  const getFont = async (font: StandardFontName) => {
    if (!fontCache.has(font)) {
      fontCache.set(font, await pdf.embedFont(font));
    }
    return fontCache.get(font)!;
  };
  const unicodeFallbackFont = await loadUnicodeFallbackFont(pdf);
  let customBoxTitleFont: PDFFont | null = null;
  let customBoxTitleFontData: ReturnType<typeof parseFontData> = null;
  let customBoxTextFont: PDFFont | null = null;
  let customBoxTextFontData: ReturnType<typeof parseFontData> = null;
  if (boxTitleFontBytes || boxTitleFontId || boxTextFontBytes || boxTextFontId) {
    pdf.registerFontkit(fontkit);
  }
  if (boxTitleFontBytes || boxTitleFontId) {
    const selectedBytes =
      boxTitleFontBytes ??
      (boxTitleFontId ? (await readBookFont(boxTitleFontId))?.bytes ?? null : null);
    if (!selectedBytes) {
      throw new Error(`Selected title font "${boxTitleFontId}" was not found in ./fonts.`);
    }
    customBoxTitleFontData = parseFontData(selectedBytes);
    customBoxTitleFont = await pdf.embedFont(selectedBytes, { subset: true });
  }
  if (boxTextFontBytes || boxTextFontId) {
    const selectedBytes =
      boxTextFontBytes ??
      (boxTextFontId ? (await readBookFont(boxTextFontId))?.bytes ?? null : null);
    if (!selectedBytes) {
      throw new Error(`Selected font "${boxTextFontId}" was not found in ./fonts.`);
    }
    customBoxTextFontData = parseFontData(selectedBytes);
    customBoxTextFont = await pdf.embedFont(selectedBytes, { subset: true });
  }
  const inlineImageCache = new Map<string, Promise<PDFImage>>();
  const embedInlineImage = async (asset: InlineImageAsset) => {
    const cached = inlineImageCache.get(asset.key);
    if (cached) {
      return cached;
    }
    const pending =
      asset.mimeType === "image/png" ? pdf.embedPng(asset.bytes) : pdf.embedJpg(asset.bytes);
    inlineImageCache.set(asset.key, pending);
    return pending;
  };

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
    const entry = shouldPlaceOverlay(pageIndex, overlayConfig, skipOverlayPages) ? preparedEntries[entryIndex++] : null;
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
      await drawOverlay(
        page,
        entry,
        overlayConfig,
        getFont,
        customBoxTitleFont,
        customBoxTitleFontData,
        customBoxTextFont,
        customBoxTextFontData,
        unicodeFallbackFont?.pdfFont ?? null,
        unicodeFallbackFont?.fontData ?? null,
        embedInlineImage,
        pageWidth,
        pageHeight
      );
    }
  }

  return pdf.save();
}

function countOverlays(config: OverlayConfig, totalPages: number, skipOverlayPages: Set<number>) {
  let overlays = 0;
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    if (shouldPlaceOverlay(pageIndex, config, skipOverlayPages)) {
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

function shouldPlaceOverlay(pageIndex: number, config: OverlayConfig, skipOverlayPages: Set<number> = new Set()) {
  if (skipOverlayPages.has(pageIndex)) {
    return false;
  }
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
  customBoxTitleFont: PDFFont | null,
  customBoxTitleFontData: ReturnType<typeof parseFontData>,
  customBoxTextFont: PDFFont | null,
  customBoxTextFontData: ReturnType<typeof parseFontData>,
  unicodeFallbackFont: PDFFont | null,
  unicodeFallbackFontData: ReturnType<typeof parseFontData>,
  embedInlineImage: (asset: InlineImageAsset) => Promise<PDFImage>,
  pageWidth: number,
  pageHeight: number
) {
  if (entry.skipOverlay) {
    return;
  }
  const baseOverlayWidth = pageWidth - config.marginLeft - config.marginRight;
  const maxOverlayWidth = config.maxBoxWidth ? Math.min(baseOverlayWidth, Math.max(40, config.maxBoxWidth)) : baseOverlayWidth;
  const maxTextWidth = Math.max(20, maxOverlayWidth - config.horizontalPadding * 2);
  const resolvedTextWidth = await resolveTextWidth(
    entry,
    config,
    getFont,
    customBoxTitleFont,
    customBoxTitleFontData,
    customBoxTextFont,
    customBoxTextFontData,
    unicodeFallbackFont,
    unicodeFallbackFontData,
    maxTextWidth
  );
  const textWidth = resolvedTextWidth ?? maxTextWidth;
  const story = await buildOverlayStory(
    entry,
    config,
    getFont,
    textWidth,
    customBoxTitleFont,
    customBoxTitleFontData,
    customBoxTextFont,
    customBoxTextFontData,
    unicodeFallbackFont,
    unicodeFallbackFontData
  );
  if (!story.length) {
    return;
  }
  const overlayWidth = Math.min(maxOverlayWidth, Math.max(40, textWidth + config.horizontalPadding * 2));
  const estimatedHeight = estimateStoryHeight(story);
  const maxAvailableHeight = Math.min(config.maxHeight, pageHeight - config.marginTop - config.marginBottom);
  const overlayHeight = Math.min(
    Math.max(config.minHeight, estimatedHeight + config.verticalPadding * 2),
    maxAvailableHeight
  );
  const centerOverlay = config.centerHorizontally || resolvedTextWidth !== null;
  const overlayX = centerOverlay
    ? clamp((pageWidth - overlayWidth) / 2, config.marginLeft, pageWidth - config.marginRight - overlayWidth)
    : config.marginLeft;
  const overlayY = config.centerVertically
    ? clamp((pageHeight - overlayHeight) / 2, config.marginBottom, pageHeight - config.marginTop - overlayHeight)
    : config.marginBottom;

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
  let isFirstParagraph = true;
  for (const paragraph of story) {
    cursorY = await drawParagraphs(
      page,
      paragraph,
      overlayX + config.horizontalPadding,
      cursorY,
      textWidth,
      isFirstParagraph,
      embedInlineImage
    );
    if (paragraph.lines.length > 0) {
      isFirstParagraph = false;
    }
  }
}

async function resolveTextWidth(
  entry: TextEntry,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  customBoxTitleFont: PDFFont | null,
  customBoxTitleFontData: ReturnType<typeof parseFontData>,
  customBoxTextFont: PDFFont | null,
  customBoxTextFontData: ReturnType<typeof parseFontData>,
  unicodeFallbackFont: PDFFont | null,
  unicodeFallbackFontData: ReturnType<typeof parseFontData>,
  maxTextWidth: number
) {
  const widestFit = await buildOverlayStory(
    entry,
    config,
    getFont,
    maxTextWidth,
    customBoxTitleFont,
    customBoxTitleFontData,
    customBoxTextFont,
    customBoxTextFontData,
    unicodeFallbackFont,
    unicodeFallbackFontData
  );
  if (!widestFit.length) {
    return null;
  }
  if (config.fitContentWidth) {
    return fitStoryWidth(
      entry,
      config,
      getFont,
      customBoxTitleFont,
      customBoxTitleFontData,
      customBoxTextFont,
      customBoxTextFontData,
      unicodeFallbackFont,
      unicodeFallbackFontData,
      maxTextWidth
    );
  }
  return detectSingleLineWidth(entry, widestFit, maxTextWidth, config);
}

async function fitStoryWidth(
  entry: TextEntry,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  customBoxTitleFont: PDFFont | null,
  customBoxTitleFontData: ReturnType<typeof parseFontData>,
  customBoxTextFont: PDFFont | null,
  customBoxTextFontData: ReturnType<typeof parseFontData>,
  unicodeFallbackFont: PDFFont | null,
  unicodeFallbackFontData: ReturnType<typeof parseFontData>,
  maxTextWidth: number
) {
  const minimumWidth = Math.min(maxTextWidth, Math.max(20, config.contentWidthMin));
  const story = await buildOverlayStory(
    entry,
    config,
    getFont,
    maxTextWidth,
    customBoxTitleFont,
    customBoxTitleFontData,
    customBoxTextFont,
    customBoxTextFontData,
    unicodeFallbackFont,
    unicodeFallbackFontData
  );
  if (!story.length) {
    return null;
  }
  if (countStoryLines(story) > Math.max(1, config.contentWidthMaxLines)) {
    return maxTextWidth;
  }
  return Math.max(
    minimumWidth,
    Math.min(maxTextWidth, measureWidestLine(story) + config.horizontalPadding * 0.5)
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function buildOverlayStory(
  entry: TextEntry,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  maxWidth: number,
  customBoxTitleFont: PDFFont | null,
  customBoxTitleFontData: ReturnType<typeof parseFontData>,
  customBoxTextFont: PDFFont | null,
  customBoxTextFontData: ReturnType<typeof parseFontData>,
  unicodeFallbackFont: PDFFont | null,
  unicodeFallbackFontData: ReturnType<typeof parseFontData>
) {
  const story: ParagraphLayout[] = [];
  const bodyLayoutOptions = {
    fallbackFont: unicodeFallbackFont,
    fallbackFontData: unicodeFallbackFontData,
    emojiAssetResolver: resolveEmojiInlineAsset,
    preserveLineBreaks: config.bodyPreserveLineBreaks,
    paragraphSpacing: config.bodyParagraphSpacing,
    interpretMarkdown: config.bodyInterpretMarkdown,
  };
  if (entry.title && config.titleStyle) {
    const titleFont = customBoxTitleFont ?? customBoxTextFont;
    const titleFontData = customBoxTitleFontData ?? customBoxTextFontData;
    if (titleFont) {
      story.push(
        ...(await layoutTextWithFont(entry.title, config.titleStyle, titleFont, maxWidth, undefined, {
          primaryFontData: titleFontData,
          fallbackFont: unicodeFallbackFont,
          fallbackFontData: unicodeFallbackFontData,
          emojiAssetResolver: resolveEmojiInlineAsset,
        }))
      );
    } else {
      story.push(
        ...(await layoutText(entry.title, config.titleStyle, getFont, maxWidth, undefined, {
          fallbackFont: unicodeFallbackFont,
          fallbackFontData: unicodeFallbackFontData,
          emojiAssetResolver: resolveEmojiInlineAsset,
        }))
      );
    }
  }

  const body = entry.body || "Share your fact here.";
  if (customBoxTextFont) {
    story.push(
      ...(await layoutTextWithFont(body, config.bodyStyle, customBoxTextFont, maxWidth, undefined, {
        primaryFontData: customBoxTextFontData,
        ...bodyLayoutOptions,
      }))
    );
  } else {
    story.push(
      ...(await layoutText(body, config.bodyStyle, getFont, maxWidth, undefined, bodyLayoutOptions))
    );
  }
  return story;
}

function countStoryLines(story: ParagraphLayout[]) {
  return story.reduce((count, paragraph) => count + Math.max(1, paragraph.lines.length), 0);
}

function measureWidestLine(story: ParagraphLayout[]) {
  let widest = 0;
  for (const paragraph of story) {
    for (const line of paragraph.lines) {
      const lineWidth = line.width + (line.indent ?? 0);
      if (lineWidth > widest) {
        widest = lineWidth;
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
  const line = paragraph.lines[0];
  const measured = (line?.width ?? 0) + (line?.indent ?? 0);
  if (!line || measured <= 0) {
    return null;
  }
  if (measured <= 0 || measured > maxWidth) {
    return null;
  }
  const snug = measured + config.horizontalPadding * 0.5;
  return Math.min(maxWidth, snug);
}
