import { PDFPage, PDFFont } from "pdf-lib";
import { OverlayConfig, StandardFontName } from "./types";

type RectangleOptions = NonNullable<Parameters<PDFPage["drawRectangle"]>[0]>;

export async function drawNumberBadge(
  page: PDFPage,
  number: number,
  overlayX: number,
  overlayY: number,
  overlayHeight: number,
  config: OverlayConfig,
  getFont: (font: StandardFontName) => Promise<PDFFont>
) {
  const radius = Math.max(config.numberBadgeRadius, 7.2);
  const centerX = overlayX + radius * 0.6 + config.numberBadgeOffsetX;
  const centerY = overlayY + overlayHeight + radius * 0.6 + config.numberBadgeOffsetY;
  page.drawCircle({
    x: centerX,
    y: centerY,
    size: radius,
    color: config.numberBadgeFill,
  });
  const font = await getFont(config.numberFontName);
  const text = number.toString().padStart(2, "0");
  const textWidth = font.widthOfTextAtSize(text, config.numberFontSize);
  const textHeight = font.heightAtSize(config.numberFontSize, { descender: false });
  page.drawText(text, {
    x: centerX - textWidth / 2,
    y: centerY - textHeight / 2,
    size: config.numberFontSize,
    font,
    color: config.numberBadgeTextColor,
  });
  if (config.numberLabel) {
    const labelFont = await getFont(config.numberLabelFontName);
    const label = config.numberLabel.toUpperCase();
    const labelWidth = labelFont.widthOfTextAtSize(label, config.numberLabelFontSize);
    page.drawText(label, {
      x: centerX - labelWidth / 2,
      y: centerY - radius - config.numberLabelFontSize,
      size: config.numberLabelFontSize,
      font: labelFont,
      color: config.numberLabelColor,
    });
  }
}

export function drawRoundedRectangle(
  page: PDFPage,
  {
    x,
    y,
    width,
    height,
    radius,
    color,
    borderColor,
    borderWidth,
    opacity,
    borderOpacity,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    color: RectangleOptions["color"];
    borderColor: RectangleOptions["borderColor"];
    borderWidth: number;
    opacity: number;
    borderOpacity: number;
  }
) {
  const clampedRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (clampedRadius === 0) {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color,
      borderColor,
      borderWidth,
      opacity,
      borderOpacity,
    });
    return;
  }
  const path = [
    `M ${clampedRadius} 0`,
    `H ${width - clampedRadius}`,
    `A ${clampedRadius} ${clampedRadius} 0 0 1 ${width} ${clampedRadius}`,
    `V ${height - clampedRadius}`,
    `A ${clampedRadius} ${clampedRadius} 0 0 1 ${width - clampedRadius} ${height}`,
    `H ${clampedRadius}`,
    `A ${clampedRadius} ${clampedRadius} 0 0 1 0 ${height - clampedRadius}`,
    `V ${clampedRadius}`,
    `A ${clampedRadius} ${clampedRadius} 0 0 1 ${clampedRadius} 0`,
    "Z",
  ].join(" ");
  page.drawSvgPath(path, {
    x,
    // pdf-lib draws SVG paths from a top-left style origin after flipping the Y axis,
    // so shift by height to preserve the same bottom-left anchor as drawRectangle().
    y: y + height,
    color,
    borderColor,
    borderWidth,
    opacity,
    borderOpacity,
  });
}
