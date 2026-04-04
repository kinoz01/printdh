import { rgb } from "pdf-lib";

import { hexToRgb } from "./colors";
import { FACT_STYLE, OverlayConfig, StandardFontName, TITLE_STYLE } from "./types";
import { PAGE_HEIGHT } from "./constants";

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  showOnEven: true,
  showOnOdd: false,
  margin: 0.75 * 72,
  horizontalPadding: 0.2 * 72,
  verticalPadding: 0.2 * 72,
  minHeight: 0.5 * 72,
  maxHeight: PAGE_HEIGHT * 0.32,
  opacity: 0.75,
  roundness: 16,
  titleStyle: TITLE_STYLE,
  bodyStyle: FACT_STYLE,
  showNumber: false,
  numberLabel: "",
  numberFontName: StandardFontName.HelveticaBold,
  numberFontSize: 14,
  numberLabelFontName: StandardFontName.Helvetica,
  numberLabelFontSize: 10,
  numberBadgeRadius: 0.22 * 72,
  numberBadgeFill: hexToRgb("#ea8a72"),
  numberBadgeTextColor: rgb(1, 1, 1),
  numberLabelColor: hexToRgb("#756b63"),
  numberBadgeOffsetX: -0.05 * 72,
  numberBadgeOffsetY: -0.15 * 72,
  fillColor: hexToRgb("#f4f2ed"),
  strokeColor: hexToRgb("#c7c2bb"),
  strokeWidth: 0.5,
  useEntryAccentForFill: false,
  useEntryAccentForStroke: false,
  showImageOnEven: true,
  showImageOnOdd: true,
  textPageBackground: rgb(1, 1, 1),
  useEntryAccentForBackground: false,
  backgroundMixAmount: 0.85,
  useGradientBackground: false,
  gradientEndColor: rgb(1, 1, 1),
  gradientSteps: 60,
  drawTextBackground: true,
  drawOverlayBox: true,
  repeatEntries: false,
  centerVertically: false,
  centerTextVertically: true,
  textOffsetTop: 0,
};

export function createOverlayConfig(overrides: Partial<OverlayConfig> = {}): OverlayConfig {
  const config: OverlayConfig = {
    ...DEFAULT_OVERLAY_CONFIG,
    ...overrides,
    bodyStyle: overrides.bodyStyle ?? DEFAULT_OVERLAY_CONFIG.bodyStyle,
    titleStyle:
      overrides.titleStyle === null ? null : overrides.titleStyle ?? DEFAULT_OVERLAY_CONFIG.titleStyle,
  };
  return config;
}
