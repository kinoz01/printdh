import { rgb, StandardFonts } from "pdf-lib";

export type TextAlignment = "left" | "center" | "right" | "justify";

export enum StandardFontName {
  TimesRoman = StandardFonts.TimesRoman,
  TimesRomanItalic = StandardFonts.TimesRomanItalic,
  TimesRomanBold = StandardFonts.TimesRomanBold,
  TimesRomanBoldItalic = StandardFonts.TimesRomanBoldItalic,
  Helvetica = StandardFonts.Helvetica,
  HelveticaBold = StandardFonts.HelveticaBold,
  HelveticaOblique = StandardFonts.HelveticaOblique,
}

export interface ParagraphStyle {
  font: StandardFontName;
  fontSize: number;
  leading: number;
  alignment: TextAlignment;
  color: ReturnType<typeof rgb>;
  spaceAfter?: number;
}

export interface TextEntry {
  body: string;
  title?: string | null;
  number?: number | null;
  skipOverlay?: boolean;
  accentColor?: ReturnType<typeof rgb>;
}

export interface OverlayConfig {
  showOnEven: boolean;
  showOnOdd: boolean;
  margin: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  maxBoxWidth: number | null;
  horizontalPadding: number;
  verticalPadding: number;
  minHeight: number;
  maxHeight: number;
  fitContentWidth: boolean;
  contentWidthMin: number;
  contentWidthMaxLines: number;
  opacity: number;
  roundness: number;
  titleStyle: ParagraphStyle | null;
  bodyStyle: ParagraphStyle;
  showNumber: boolean;
  numberLabel?: string;
  numberFontName: StandardFontName;
  numberFontSize: number;
  numberLabelFontName: StandardFontName;
  numberLabelFontSize: number;
  numberBadgeRadius: number;
  numberBadgeFill: ReturnType<typeof rgb>;
  numberBadgeTextColor: ReturnType<typeof rgb>;
  numberLabelColor: ReturnType<typeof rgb>;
  numberBadgeOffsetX: number;
  numberBadgeOffsetY: number;
  fillColor: ReturnType<typeof rgb>;
  strokeColor: ReturnType<typeof rgb>;
  strokeWidth: number;
  useEntryAccentForFill: boolean;
  useEntryAccentForStroke: boolean;
  showImageOnEven: boolean;
  showImageOnOdd: boolean;
  textPageBackground: ReturnType<typeof rgb>;
  useEntryAccentForBackground: boolean;
  backgroundMixAmount: number;
  useGradientBackground: boolean;
  gradientEndColor: ReturnType<typeof rgb> | null;
  gradientSteps: number;
  drawTextBackground: boolean;
  drawOverlayBox: boolean;
  repeatEntries: boolean;
  centerVertically: boolean;
  centerHorizontally: boolean;
  centerTextVertically: boolean;
  textOffsetTop: number;
  bodyPreserveLineBreaks: boolean;
  bodyParagraphSpacing: number;
  bodyInterpretMarkdown: boolean;
}

export type PdfImageMimeType = "image/png" | "image/jpeg";

export interface ImageAsset {
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: PdfImageMimeType;
}

export interface PdfAsset {
  bytes: Uint8Array;
  name: string;
}

export interface TemplateAsset {
  id: string;
  type: "image" | "pdf";
  bytes: Uint8Array;
  width?: number;
  height?: number;
  pageIndex?: number;
}

export const FACT_STYLE: ParagraphStyle = {
  font: StandardFontName.TimesRoman,
  fontSize: 16,
  leading: 21,
  alignment: "justify",
  color: rgb(0, 0, 0),
};

export const TITLE_STYLE: ParagraphStyle = {
  ...FACT_STYLE,
  font: StandardFontName.TimesRomanBold,
  fontSize: 18,
  leading: 22,
};
