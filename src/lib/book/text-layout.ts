import { PDFFont, PDFPage, PDFPageDrawTextOptions } from "pdf-lib";
import { OverlayConfig, ParagraphStyle, StandardFontName, TextAlignment, TextEntry } from "./types";

type TextDrawOptions = PDFPageDrawTextOptions & { wordSpacing?: number };

export interface ParagraphLayout {
  lines: string[];
  style: ParagraphStyle;
  font: PDFFont;
}

export async function buildEntryStory(
  entry: TextEntry,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  maxWidth: number,
  fallback = "Share your fact here."
) {
  const story: ParagraphLayout[] = [];
  if (entry.title && config.titleStyle) {
    const titleParagraphs = await layoutText(entry.title, config.titleStyle, getFont, maxWidth, fallback);
    story.push(...titleParagraphs);
  }
  const bodyParagraphs = await layoutText(entry.body || fallback, config.bodyStyle, getFont, maxWidth, fallback);
  story.push(...bodyParagraphs);
  return story;
}

export async function layoutText(
  text: string,
  style: ParagraphStyle,
  getFont: (font: StandardFontName) => Promise<PDFFont>,
  maxWidth: number,
  fallback = "Share your fact here."
) {
  const font = await getFont(style.font);
  return layoutTextWithFont(text, style, font, maxWidth, fallback);
}

export function layoutTextWithFont(
  text: string,
  style: ParagraphStyle,
  font: PDFFont,
  maxWidth: number,
  fallback = "Share your fact here."
) {
  const cleaned = text?.replace(/\r\n/g, "\n") ?? "";
  const chunks = cleaned ? cleaned.split(/\n\n+/) : [];
  const normalized = chunks.map((chunk) => chunk.trim()).filter(Boolean);
  const paragraphs = normalized.length ? normalized : [fallback];
  return paragraphs.map<ParagraphLayout>((paragraph) => ({
    lines: wrapLines(paragraph, font, style.fontSize, maxWidth),
    font,
    style,
  }));
}

export function wrapLines(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const targetWidth = Math.max(maxWidth, fontSize * 2);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= targetWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [text];
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

export function drawParagraphs(
  page: PDFPage,
  paragraph: ParagraphLayout,
  x: number,
  startY: number,
  width: number,
  isFirstParagraph = false
) {
  let cursorY = startY;
  const { style, font } = paragraph;
  const metrics = getParagraphMetrics(paragraph);
  for (let index = 0; index < paragraph.lines.length; index++) {
    const line = paragraph.lines[index];
    cursorY -= index === 0 && isFirstParagraph ? metrics.ascentHeight : style.leading;
    const lineWidth = font.widthOfTextAtSize(line, style.fontSize);
    const offset = alignmentOffset(style.alignment, width, lineWidth);
    const options: TextDrawOptions = {
      x: x + offset,
      y: cursorY,
      font,
      size: style.fontSize,
      color: style.color,
    };
    if (style.alignment === "justify" && index < paragraph.lines.length - 1) {
      const spaces = line.split(/\s+/).length - 1;
      if (spaces > 0 && lineWidth < width) {
        options.wordSpacing = (width - lineWidth) / spaces;
      }
    }
    page.drawText(line, options);
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
