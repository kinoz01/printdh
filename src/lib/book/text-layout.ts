import type { Font as FontkitFont } from "@pdf-lib/fontkit";
import { degrees, PDFFont, PDFImage, PDFPage, PDFPageDrawTextOptions } from "pdf-lib";
import { InlineImageAsset, shouldResolveInlineEmoji } from "./emoji-inline-assets";
import { OverlayConfig, ParagraphStyle, StandardFontName, TextAlignment, TextEntry } from "./types";

type TextDrawOptions = PDFPageDrawTextOptions & { wordSpacing?: number };
type TextEmphasis = "normal" | "bold" | "italic";

export interface TextLineSegment {
  type: "text";
  text: string;
  font: PDFFont;
  width: number;
  emphasis: TextEmphasis;
}

export interface InlineImageSegment {
  type: "image";
  text: string;
  asset: InlineImageAsset;
  width: number;
  height: number;
}

export type LineSegment = TextLineSegment | InlineImageSegment;

export interface LineLayout {
  segments: LineSegment[];
  width: number;
  indent?: number;
}

export interface ParagraphLayout {
  lines: LineLayout[];
  style: ParagraphStyle;
  font: PDFFont;
}

export interface TextLayoutOptions {
  primaryFontData?: FontkitFont | null;
  fallbackFont?: PDFFont | null;
  fallbackFontData?: FontkitFont | null;
  emojiAssetResolver?: ((grapheme: string, style: ParagraphStyle) => Promise<InlineImageAsset | null>) | null;
  preserveLineBreaks?: boolean;
  paragraphSpacing?: number;
  interpretMarkdown?: boolean;
}

export async function buildEntryStory(
  entry: TextEntry,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  maxWidth: number,
  fallback = "Share your fact here.",
  options?: TextLayoutOptions
) {
  const story: ParagraphLayout[] = [];
  if (entry.title && config.titleStyle) {
    const titleParagraphs = await layoutText(entry.title, config.titleStyle, getFont, maxWidth, fallback, options);
    story.push(...titleParagraphs);
  }
  const bodyParagraphs = await layoutText(entry.body || fallback, config.bodyStyle, getFont, maxWidth, fallback, options);
  story.push(...bodyParagraphs);
  return story;
}

export async function layoutText(
  text: string,
  style: ParagraphStyle,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  maxWidth: number,
  fallback = "Share your fact here.",
  options?: TextLayoutOptions
) {
  const font = await getFont(style.font);
  return layoutTextWithFont(text, style, font, maxWidth, fallback, options);
}

export async function layoutTextWithFont(
  text: string,
  style: ParagraphStyle,
  font: PDFFont,
  maxWidth: number,
  fallback = "Share your fact here.",
  options?: TextLayoutOptions
) {
  const cleaned = (text?.replace(/\r\n/g, "\n") ?? "").normalize("NFC");
  const chunks = cleaned ? cleaned.split(/\n\n+/) : [];
  const normalized = chunks.map((chunk) => chunk.trim()).filter(Boolean);
  const paragraphs = normalized.length ? normalized : [fallback];
  return Promise.all(
    paragraphs.map(async (paragraph, index) => {
      const paragraphStyle =
        options?.paragraphSpacing && index < paragraphs.length - 1
          ? { ...style, spaceAfter: (style.spaceAfter ?? 0) + options.paragraphSpacing }
          : style;
      return {
        lines: await wrapLines(paragraph, font, style.fontSize, maxWidth, paragraphStyle, options),
        font,
        style: paragraphStyle,
      };
    })
  );
}

export async function wrapLines(
  text: string,
  primaryFont: PDFFont,
  fontSize: number,
  maxWidth: number,
  style: ParagraphStyle,
  options?: TextLayoutOptions
) {
  const targetWidth = Math.max(maxWidth, fontSize * 2);
  const rawLines = options?.preserveLineBreaks ? text.split("\n") : [text];
  const lines: LineLayout[] = [];
  for (const rawLine of rawLines) {
    const wrappedLines = await wrapSingleTextLine(rawLine, primaryFont, fontSize, targetWidth, style, options);
    lines.push(...wrappedLines);
  }

  if (!lines.length) {
    const fallbackSegments = await buildLineSegments(text, primaryFont, fontSize, style, options, "normal");
    return [{ segments: fallbackSegments, width: measureLineWidth(fallbackSegments) }];
  }

  return lines;
}

export function estimateStoryHeight(story: ParagraphLayout[]) {
  let height = 0;
  let lastDescender = 0;
  let hasLines = false;
  for (const paragraph of story) {
    const metrics = getParagraphMetrics(paragraph);
    for (let index = 0; index < paragraph.lines.length; index++) {
      if (!hasLines) {
        height += metrics.ascentHeight;
        hasLines = true;
      } else {
        height += paragraph.style.leading;
      }
      lastDescender = metrics.descenderHeight;
    }
    if (paragraph.lines.length > 0 && paragraph.style.spaceAfter) {
      height += paragraph.style.spaceAfter;
    }
  }
  return hasLines ? height + lastDescender : 0;
}

export async function drawParagraphs(
  page: PDFPage,
  paragraph: ParagraphLayout,
  x: number,
  startY: number,
  width: number,
  isFirstParagraph = false,
  embedInlineImage?: ((asset: InlineImageAsset) => Promise<PDFImage>) | null
) {
  let cursorY = startY;
  const { style } = paragraph;
  const metrics = getParagraphMetrics(paragraph);
  for (let index = 0; index < paragraph.lines.length; index++) {
    const line = paragraph.lines[index];
    cursorY -= index === 0 && isFirstParagraph ? metrics.ascentHeight : style.leading;
    const totalLineWidth = line.width + (line.indent ?? 0);
    const offset = alignmentOffset(style.alignment, width, totalLineWidth);
    let cursorX = x + offset + (line.indent ?? 0);

    const useWordSpacing =
      style.alignment === "justify" &&
      index < paragraph.lines.length - 1 &&
      line.segments.length === 1 &&
      line.segments[0]?.type === "text";

    for (const segment of line.segments) {
      if (segment.type === "text") {
        const options: TextDrawOptions = {
          x: cursorX,
          y: cursorY,
          font: segment.font,
          size: style.fontSize,
          color: style.color,
        };
        if (segment.emphasis === "italic") {
          options.xSkew = degrees(12);
        }
        if (useWordSpacing) {
          const spaces = segment.text.split(/\s+/).length - 1;
          if (spaces > 0 && segment.width < width) {
            options.wordSpacing = (width - segment.width) / spaces;
          }
        }
        if (segment.emphasis === "bold") {
          page.drawText(segment.text, {
            ...options,
            x: cursorX + Math.max(0.2, style.fontSize * 0.02),
          });
        }
        page.drawText(segment.text, options);
        cursorX += segment.width;
        continue;
      }

      if (!embedInlineImage) {
        cursorX += segment.width;
        continue;
      }

      const image = await embedInlineImage(segment.asset);
      const baselineOffset = segment.height * 0.18;
      page.drawImage(image, {
        x: cursorX,
        y: cursorY - baselineOffset,
        width: segment.width,
        height: segment.height,
      });
      cursorX += segment.width;
    }
  }
  if (style.spaceAfter) {
    cursorY -= style.spaceAfter;
  }
  return cursorY;
}

function getParagraphMetrics(paragraph: ParagraphLayout) {
  const ascentHeight = paragraph.font.heightAtSize(paragraph.style.fontSize, { descender: false });
  const fullHeight = paragraph.font.heightAtSize(paragraph.style.fontSize);
  const descenderHeight = Math.max(0, fullHeight - ascentHeight);
  return { ascentHeight, descenderHeight, fullHeight };
}

export function alignmentOffset(alignment: TextAlignment, containerWidth: number, lineWidth: number) {
  if (alignment === "center") {
    return (containerWidth - lineWidth) / 2;
  }
  if (alignment === "right") {
    return containerWidth - lineWidth;
  }
  return 0;
}

interface InlineToken {
  type: "text" | "space";
  text: string;
  emphasis: TextEmphasis;
}

async function wrapSingleTextLine(
  rawLine: string,
  primaryFont: PDFFont,
  fontSize: number,
  maxWidth: number,
  style: ParagraphStyle,
  options?: TextLayoutOptions
) {
  const trimmedLine = rawLine.trim();
  const prefixMatch = trimmedLine.match(/^(-\s+|\d+\.\s+)(.*)$/);
  const prefixText = prefixMatch?.[1] ?? "";
  const contentText = prefixMatch?.[2] ?? trimmedLine;
  const prefixSegments = prefixText
    ? await buildLineSegments(prefixText, primaryFont, fontSize, style, options, "normal")
    : [];
  const prefixWidth = measureLineWidth(prefixSegments);
  const continuationIndent = prefixWidth > 0 ? prefixWidth : 0;
  const tokens = buildInlineTokens(contentText, options?.interpretMarkdown ?? false);

  if (!tokens.length) {
    return prefixSegments.length ? [{ segments: prefixSegments, width: prefixWidth }] : [];
  }

  const lines: LineLayout[] = [];
  let currentSegments = [...prefixSegments];
  let currentWidth = prefixWidth;
  let currentIndent = 0;
  let availableWidth = maxWidth;
  let pendingSpace = false;

  for (const token of tokens) {
    if (token.type === "space") {
      pendingSpace = currentSegments.length > 0;
      continue;
    }

    const wordSegments = await buildLineSegments(
      token.text,
      primaryFont,
      fontSize,
      style,
      options,
      token.emphasis
    );
    const wordWidth = measureLineWidth(wordSegments);
    const needsSpace = pendingSpace && currentSegments.length > 0;
    const spaceWidth = needsSpace ? measureSpaceWidth(currentSegments, primaryFont, fontSize) : 0;
    const candidateWidth = needsSpace ? currentWidth + spaceWidth + wordWidth : currentWidth + wordWidth;
    const isFirstTokenOnLine = currentWidth === 0 || (currentIndent === 0 && currentWidth === prefixWidth);

    if (candidateWidth <= availableWidth || isFirstTokenOnLine) {
      if (needsSpace) {
        appendLineSegment(currentSegments, {
          type: "text",
          text: " ",
          font: primaryFont,
          width: primaryFont.widthOfTextAtSize(" ", fontSize),
          emphasis: "normal",
        });
        currentWidth += spaceWidth;
      }
      appendLineSegments(currentSegments, wordSegments);
      currentWidth += wordWidth;
      pendingSpace = false;
      continue;
    }

    lines.push({
      segments: currentSegments,
      width: currentWidth,
      indent: currentIndent,
    });
    currentSegments = [];
    currentWidth = 0;
    currentIndent = continuationIndent;
    availableWidth = Math.max(fontSize * 2, maxWidth - continuationIndent);
    pendingSpace = false;

    appendLineSegments(currentSegments, wordSegments);
    currentWidth = wordWidth;
  }

  if (currentSegments.length) {
    lines.push({
      segments: currentSegments,
      width: currentWidth,
      indent: currentIndent,
    });
  }

  return lines;
}

function buildInlineTokens(text: string, interpretMarkdown: boolean) {
  const spans = parseInlineSpans(text, interpretMarkdown);
  const tokens: InlineToken[] = [];

  for (const span of spans) {
    const pieces = span.text.split(/(\s+)/).filter(Boolean);
    for (const piece of pieces) {
      if (/^\s+$/.test(piece)) {
        if (tokens[tokens.length - 1]?.type !== "space") {
          tokens.push({ type: "space", text: " ", emphasis: "normal" });
        }
        continue;
      }
      tokens.push({
        type: "text",
        text: piece,
        emphasis: span.emphasis,
      });
    }
  }

  return tokens;
}

function parseInlineSpans(text: string, interpretMarkdown: boolean) {
  if (!interpretMarkdown || !text.includes("*")) {
    return [{ text, emphasis: "normal" as const }];
  }

  const spans: Array<{ text: string; emphasis: TextEmphasis }> = [];
  let buffer = "";
  let index = 0;

  const flushBuffer = () => {
    if (!buffer) {
      return;
    }
    spans.push({ text: buffer, emphasis: "normal" });
    buffer = "";
  };

  while (index < text.length) {
    if (text.startsWith("**", index)) {
      const closeIndex = text.indexOf("**", index + 2);
      if (closeIndex !== -1) {
        flushBuffer();
        const boldText = text.slice(index + 2, closeIndex);
        if (boldText) {
          spans.push({ text: boldText, emphasis: "bold" });
        }
        index = closeIndex + 2;
        continue;
      }
    }

    if (text[index] === "*") {
      const closeIndex = text.indexOf("*", index + 1);
      if (closeIndex !== -1) {
        flushBuffer();
        const italicText = text.slice(index + 1, closeIndex);
        if (italicText) {
          spans.push({ text: italicText, emphasis: "italic" });
        }
        index = closeIndex + 1;
        continue;
      }
    }

    buffer += text[index];
    index += 1;
  }

  flushBuffer();
  return spans.length ? spans : [{ text, emphasis: "normal" as const }];
}

async function buildLineSegments(
  text: string,
  primaryFont: PDFFont,
  fontSize: number,
  style: ParagraphStyle,
  options: TextLayoutOptions | undefined,
  emphasis: TextEmphasis
) {
  const graphemes = splitGraphemes(text);
  const segments: LineSegment[] = [];
  let currentText = "";
  let currentFont = primaryFont;

  const flushText = () => {
    if (!currentText) {
      return;
    }
    appendLineSegment(segments, {
      type: "text",
      text: currentText,
      font: currentFont,
      width: currentFont.widthOfTextAtSize(currentText, fontSize),
      emphasis,
    });
    currentText = "";
  };

  for (const grapheme of graphemes) {
    if (options?.emojiAssetResolver && shouldResolveInlineEmoji(grapheme)) {
      const asset = await options.emojiAssetResolver(grapheme, style);
      if (asset) {
        flushText();
        const height = fontSize * 1.08;
        const width = height * (asset.width / Math.max(1, asset.height));
        segments.push({
          type: "image",
          text: grapheme,
          asset,
          width,
          height,
        });
        continue;
      }
    }

    const resolvedFont = resolveFontForGrapheme(grapheme, primaryFont, options, currentFont);
    if (currentText && resolvedFont !== currentFont) {
      flushText();
      currentFont = resolvedFont;
    } else if (!currentText) {
      currentFont = resolvedFont;
    }
    currentText += grapheme;
  }

  flushText();
  return segments;
}

function resolveFontForGrapheme(
  grapheme: string,
  primaryFont: PDFFont,
  options: TextLayoutOptions | undefined,
  currentFont: PDFFont
) {
  if (!grapheme.trim()) {
    return currentFont;
  }
  if (supportsText(primaryFont, grapheme, options?.primaryFontData ?? null)) {
    return primaryFont;
  }
  if (options?.fallbackFont && supportsText(options.fallbackFont, grapheme, options.fallbackFontData ?? null)) {
    return options.fallbackFont;
  }
  return primaryFont;
}

function supportsText(font: PDFFont, text: string, fontData: FontkitFont | null) {
  const normalized = text.normalize("NFC");
  if (!normalized) {
    return true;
  }

  try {
    font.encodeText(normalized);
    if (!fontData) {
      return true;
    }
  } catch {
    if (!fontData) {
      return false;
    }
  }

  try {
    const hasAllCodePointGlyphs = Array.from(normalized).every((char) => {
      const codePoint = char.codePointAt(0);
      return codePoint === undefined || fontData.hasGlyphForCodePoint(codePoint);
    });
    if (hasAllCodePointGlyphs) {
      return true;
    }

    const glyphRun = fontData.layout(normalized);
    return glyphRun.glyphs.length > 0 && glyphRun.glyphs.every((glyph) => Boolean(glyph) && glyph.id !== 0);
  } catch {
    return false;
  }
}

function splitGraphemes(text: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }
  return Array.from(text);
}

function appendLineSegments(target: LineSegment[], segments: LineSegment[]) {
  for (const segment of segments) {
    appendLineSegment(target, segment);
  }
}

function appendLineSegment(target: LineSegment[], segment: LineSegment) {
  const previous = target[target.length - 1];
  if (
    previous?.type === "text" &&
    segment.type === "text" &&
    previous.font === segment.font &&
    previous.emphasis === segment.emphasis
  ) {
    previous.text += segment.text;
    previous.width += segment.width;
    return;
  }
  target.push(segment);
}

function measureLineWidth(segments: LineSegment[]) {
  return segments.reduce((sum, segment) => sum + segment.width, 0);
}

function measureSpaceWidth(segments: LineSegment[], primaryFont: PDFFont, fontSize: number) {
  const lastTextSegment = [...segments].reverse().find((segment) => segment.type === "text");
  const font = lastTextSegment?.type === "text" ? lastTextSegment.font : primaryFont;
  return font.widthOfTextAtSize(" ", fontSize);
}
