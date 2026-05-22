export const POINTS_PER_INCH = 72;

export type PageSizePreset = "square" | "us-letter" | "hardcover";

const PAGE_SIZE_MAP: Record<PageSizePreset, { width: number; height: number }> = {
  square: { width: 8.64 * POINTS_PER_INCH, height: 8.76 * POINTS_PER_INCH },
  "us-letter": { width: 8.625 * POINTS_PER_INCH, height: 11.25 * POINTS_PER_INCH },
  hardcover: { width: 8.375 * POINTS_PER_INCH, height: 11.25 * POINTS_PER_INCH },
};

export const DEFAULT_PAGE_SIZE: PageSizePreset = "square";
const DEFAULT_DIMENSIONS = PAGE_SIZE_MAP[DEFAULT_PAGE_SIZE];

export const PAGE_WIDTH = DEFAULT_DIMENSIONS.width;
export const PAGE_HEIGHT = DEFAULT_DIMENSIONS.height;
export const PAGE_ASPECT_RATIO = PAGE_WIDTH / PAGE_HEIGHT;
export const TOTAL_PAGES = 59;
export const MIN_TOTAL_PAGES = 4;
export const MAX_TOTAL_PAGES = 200;
export const DEFAULT_IMAGE_LIBRARY = "../images";
export const DEFAULT_TEMPLATE_LIBRARY = "../template";

export function resolvePageSettings(pageSize?: PageSizePreset, totalPages?: number) {
  const preset = pageSize ?? DEFAULT_PAGE_SIZE;
  const dimensions = PAGE_SIZE_MAP[preset] ?? DEFAULT_DIMENSIONS;
  return {
    width: dimensions.width,
    height: dimensions.height,
    totalPages: clampTotalPages(totalPages),
  };
}

export function clampTotalPages(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return TOTAL_PAGES;
  }
  const floored = Math.floor(value);
  if (floored < MIN_TOTAL_PAGES) {
    return MIN_TOTAL_PAGES;
  }
  if (floored > MAX_TOTAL_PAGES) {
    return MAX_TOTAL_PAGES;
  }
  return floored;
}
