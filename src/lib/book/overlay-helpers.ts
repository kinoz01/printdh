import { PDFPage, PDFFont } from "pdf-lib";
import { OverlayConfig, StandardFontName } from "./types";

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
