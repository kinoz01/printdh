import { DEFAULT_IMAGE_LIBRARY, MAX_TOTAL_PAGES, PageSizePreset, resolvePageSettings } from "./constants";
import { parseFactsInput, parseListDescriptionInput, parseListInput, parseLooseFactsInput } from "./entry-parsers";
import { renderBook } from "./render-book";
import { renderFullFactBook } from "./render-full-fact";
import { renderDictionaryBook } from "./render-dictionary";
import { renderUploadedImagePages } from "./render-uploaded-image-pages";
import { renderUploadedPdfPages } from "./render-uploaded-pdf-pages";
import { hexToRgb } from "./colors";
import { getNumberBadgeColorOption, type NumberBadgeColorKey } from "./number-badge-colors";
import { FACT_STYLE, TITLE_STYLE, type TextAlignment } from "./types";
import type { ImageAsset, PdfAsset } from "./types";

export type BookMode =
  | "facts"
  | "facts-both"
  | "list"
  | "list-description"
  | "list-description-even"
  | "described-pictures"
  | "even-described-pictures"
  | "fully-described-images"
  | "even-full-page-text"
  | "image-only"
  | "uploaded-images"
  | "uploaded-pdfs"
  | "full-fact"
  | "dictionary";

export interface GenerateBookPayload {
  mode: BookMode;
  facts?: string;
  list?: string;
  listDescription?: string;
  imageLibrary?: string;
  overlayOpacity?: number;
  numberBadgeColor?: NumberBadgeColorKey;
  describedPictureTextAlignment?: Extract<TextAlignment, "left" | "center">;
  describedPictureMaxBoxWidth?: number;
  describedPictureBoxHeight?: number;
  factsPerPage?: number;
  fullFactBoxFontId?: string;
  fullFactUploadedFontBytes?: Uint8Array;
  fullFactTitleFontId?: string;
  fullFactTitleUploadedFontBytes?: Uint8Array;
  targetImageSize?: number;
  contentPadding?: number;
  sequentialBackgroundImages?: boolean;
  fineTuneBackgrounds?: boolean;
  backgroundlessContentImageIndexes?: number[];
  stretchContentImages?: boolean;
  imageFrameEnabled?: boolean;
  imageFrameThickness?: number;
  showPageNumbers?: boolean;
  pageNumberPosition?: "alternating" | "center";
  pageSize?: PageSizePreset;
  pageCount?: number;
  imageAssets?: ImageAsset[];
  pdfAssets?: PdfAsset[];
  backgroundImageAssets?: ImageAsset[];
}

export async function generateBook(payload: GenerateBookPayload) {
  const imageLibrary = payload.imageLibrary || DEFAULT_IMAGE_LIBRARY;
  const opacity = clampOpacity(payload.overlayOpacity ?? 0.9);
  const numberBadgeFill = hexToRgb(getNumberBadgeColorOption(payload.numberBadgeColor).hex);
  const pageSettings = resolvePageSettings(payload.pageSize, payload.pageCount);
  const totalPages =
    payload.mode === "uploaded-images"
      ? resolveUploadedImagePageCount(payload.pageCount, payload.imageAssets)
      : pageSettings.totalPages;
  const sharedPageOptions = {
    pageWidth: pageSettings.width,
    pageHeight: pageSettings.height,
    totalPages,
  };
  const sharedImageOptions = {
    imageLibrary,
    imageAssets: payload.imageAssets,
  };

  switch (payload.mode) {
    case "facts": {
      const entries = parseFactsInput(payload.facts ?? "", 30);
      return renderBook({
        entries,
        placeholder: "Replace this placeholder fact paragraph with your narrative #{}.",
        ...sharedImageOptions,
        overlayOverrides: {
          showOnEven: true,
          showOnOdd: false,
          showNumber: true,
          numberBadgeFill,
          opacity,
        },
        ...sharedPageOptions,
      });
    }
    case "facts-both": {
      const entries = parseFactsInput(payload.facts ?? "", 60);
      return renderBook({
        entries,
        placeholder: "Add fact for page #{}.",
        ...sharedImageOptions,
        overlayOverrides: {
          showOnEven: true,
          showOnOdd: true,
          showNumber: true,
          numberBadgeFill,
          opacity,
        },
        ...sharedPageOptions,
      });
    }
    case "list": {
      const entries = parseListInput(payload.list ?? "");
      return renderBook({
        entries,
        placeholder: "Add list entry #{}.",
        ...sharedImageOptions,
        overlayOverrides: {
          showOnEven: true,
          showOnOdd: true,
          minHeight: 0.8 * 72,
          maxHeight: 1 * 72,
          opacity: clampOpacity(payload.overlayOpacity ?? 0.9),
        },
        ...sharedPageOptions,
      });
    }
    case "list-description": {
      const entries = parseListDescriptionInput(payload.listDescription ?? "");
      return renderBook({
        entries,
        placeholder: "Add description for entry #{}.",
        ...sharedImageOptions,
        overlayOverrides: {
          showOnEven: true,
          showOnOdd: true,
          showNumber: false,
          opacity,
        },
        ...sharedPageOptions,
      });
    }
    case "list-description-even": {
      const entries = parseListDescriptionInput(payload.listDescription ?? "");
      return renderBook({
        entries,
        placeholder: "Entry #{} description goes here.",
        ...sharedImageOptions,
        overlayOverrides: {
          showOnEven: true,
          showOnOdd: false,
          showNumber: false,
          opacity,
        },
        ...sharedPageOptions,
      });
    }
    case "described-pictures": {
      const entries = parseListInput(payload.list ?? "");
      return renderBook({
        entries,
        placeholder: "Add picture description #{}.",
        ...sharedImageOptions,
        overlayOverrides: {
          showOnEven: true,
          showOnOdd: true,
          showNumber: false,
          titleStyle: null,
          bodyStyle: {
            ...FACT_STYLE,
            fontSize: 17,
            leading: 20,
            alignment: payload.describedPictureTextAlignment ?? "center",
          },
          minHeight: 0.62 * 72,
          maxHeight: pageSettings.height * 0.24,
          fitContentWidth: true,
          contentWidthMin: 2.3 * 72,
          contentWidthMaxLines: 3,
          centerHorizontally: true,
          marginLeft: 0.7 * 72,
          marginRight: 0.7 * 72,
          marginBottom: 0.7 * 72,
          maxBoxWidth: payload.describedPictureMaxBoxWidth ?? 6.2 * 72,
          horizontalPadding: 0.26 * 72,
          verticalPadding: 0.16 * 72,
          roundness: 14,
          opacity,
        },
        boxTextFontId: payload.fullFactBoxFontId,
        boxTextFontBytes: payload.fullFactUploadedFontBytes,
        ...sharedPageOptions,
      });
    }
    case "even-described-pictures": {
      const entries = parseListInput(payload.list ?? "");
      return renderBook({
        entries,
        placeholder: "Add picture description #{}.",
        ...sharedImageOptions,
        overlayOverrides: {
          showOnEven: true,
          showOnOdd: false,
          showNumber: false,
          titleStyle: null,
          bodyStyle: {
            ...FACT_STYLE,
            fontSize: 17,
            leading: 20,
            alignment: payload.describedPictureTextAlignment ?? "center",
          },
          minHeight: 0.62 * 72,
          maxHeight: pageSettings.height * 0.24,
          fitContentWidth: true,
          contentWidthMin: 2.3 * 72,
          contentWidthMaxLines: 3,
          centerHorizontally: true,
          marginLeft: 0.7 * 72,
          marginRight: 0.7 * 72,
          marginBottom: 0.7 * 72,
          maxBoxWidth: payload.describedPictureMaxBoxWidth ?? 6.2 * 72,
          horizontalPadding: 0.26 * 72,
          verticalPadding: 0.16 * 72,
          roundness: 14,
          opacity,
        },
        skipOverlayPageIndexes: [0, pageSettings.totalPages - 1],
        boxTextFontId: payload.fullFactBoxFontId,
        boxTextFontBytes: payload.fullFactUploadedFontBytes,
        ...sharedPageOptions,
      });
    }
    case "fully-described-images": {
      const entries = parseListDescriptionInput(payload.listDescription ?? "");
      return renderBook({
        entries,
        placeholder: "Add a title and description for picture #{}.",
        ...sharedImageOptions,
        overlayOverrides: {
          showOnEven: true,
          showOnOdd: true,
          showNumber: false,
          titleStyle: {
            ...TITLE_STYLE,
            fontSize: 16,
            leading: 18,
            alignment: "left",
            spaceAfter: 4,
          },
          bodyStyle: {
            ...FACT_STYLE,
            fontSize: 14,
            leading: 17,
            alignment: "left",
          },
          minHeight: 0.82 * 72,
          maxHeight: pageSettings.height * 0.28,
          fitContentWidth: true,
          contentWidthMin: 2.7 * 72,
          contentWidthMaxLines: 6,
          centerHorizontally: true,
          marginLeft: 0.7 * 72,
          marginRight: 0.7 * 72,
          marginBottom: 0.7 * 72,
          maxBoxWidth: payload.describedPictureMaxBoxWidth ?? 6.2 * 72,
          horizontalPadding: 0.26 * 72,
          verticalPadding: 0.18 * 72,
          roundness: 14,
          bodyPreserveLineBreaks: true,
          bodyParagraphSpacing: 15,
          bodyInterpretMarkdown: true,
          opacity,
        },
        boxTitleFontId: payload.fullFactTitleFontId,
        boxTitleFontBytes: payload.fullFactTitleUploadedFontBytes,
        boxTextFontId: payload.fullFactBoxFontId,
        boxTextFontBytes: payload.fullFactUploadedFontBytes,
        ...sharedPageOptions,
      });
    }
    case "even-full-page-text": {
      const entries = parseListDescriptionInput(payload.listDescription ?? "");
      const fullPageTextBoxWidth = payload.describedPictureMaxBoxWidth ?? 7 * 72;
      const fullPageTextBoxHeight = payload.describedPictureBoxHeight ?? 7 * 72;
      const evenOverlayPageIndexes = Array.from({ length: pageSettings.totalPages }, (_, pageIndex) => pageIndex).filter(
        (pageIndex) => pageIndex % 2 === 1
      );
      const skipLastEvenTextOverlay =
        entries.length < evenOverlayPageIndexes.length && evenOverlayPageIndexes.length > 0
          ? [evenOverlayPageIndexes[evenOverlayPageIndexes.length - 1]]
          : [];
      return renderBook({
        entries,
        placeholder: "Add a title and paragraph for text page #{}.",
        ...sharedImageOptions,
        overlayOverrides: {
          showOnEven: true,
          showOnOdd: false,
          showNumber: false,
          titleStyle: {
            ...TITLE_STYLE,
            fontSize: 20,
            leading: 24,
            alignment: "center",
            spaceAfter: 10,
          },
          bodyStyle: {
            ...FACT_STYLE,
            fontSize: 12.5,
            leading: 15,
            alignment: "left",
          },
          marginTop: 0.5 * 72,
          marginRight: 0.5 * 72,
          marginBottom: 0.5 * 72,
          marginLeft: 0.5 * 72,
          minHeight: fullPageTextBoxHeight,
          maxHeight: fullPageTextBoxHeight,
          maxBoxWidth: fullPageTextBoxWidth,
          horizontalPadding: 0.38 * 72,
          verticalPadding: 0.4 * 72,
          roundness: 18,
          centerHorizontally: true,
          centerVertically: true,
          centerTextVertically: true,
          bodyPreserveLineBreaks: true,
          bodyParagraphSpacing: 15,
          bodyInterpretMarkdown: true,
          opacity,
        },
        skipOverlayPageIndexes: skipLastEvenTextOverlay,
        boxTitleFontId: payload.fullFactTitleFontId,
        boxTitleFontBytes: payload.fullFactTitleUploadedFontBytes,
        boxTextFontId: payload.fullFactBoxFontId,
        boxTextFontBytes: payload.fullFactUploadedFontBytes,
        ...sharedPageOptions,
      });
    }
    case "image-only": {
      return renderBook({
        entries: [],
        placeholder: "Image placeholder #{}.",
        ...sharedImageOptions,
        overlayOverrides: {
          showOnEven: false,
          showOnOdd: false,
          showImageOnEven: true,
          showImageOnOdd: true,
        },
        ...sharedPageOptions,
      });
    }
    case "uploaded-images": {
      return renderUploadedImagePages({
        backgroundImageAssets: payload.backgroundImageAssets,
        contentImageAssets: payload.imageAssets,
        contentPadding: payload.contentPadding,
        sequentialBackgroundImages: payload.sequentialBackgroundImages,
        fineTuneBackgrounds: payload.fineTuneBackgrounds,
        backgroundlessContentImageIndexes: payload.backgroundlessContentImageIndexes,
        stretchContentImages: payload.stretchContentImages,
        imageFrameEnabled: payload.imageFrameEnabled,
        imageFrameThickness: payload.imageFrameThickness,
        showPageNumbers: payload.showPageNumbers,
        pageNumberPosition: payload.pageNumberPosition,
        pageNumberFill: numberBadgeFill,
        ...sharedPageOptions,
      });
    }
    case "uploaded-pdfs": {
      return renderUploadedPdfPages({
        backgroundImageAssets: payload.backgroundImageAssets,
        contentPdfAssets: payload.pdfAssets,
        contentPadding: payload.contentPadding,
        sequentialBackgroundImages: payload.sequentialBackgroundImages,
        fineTuneBackgrounds: payload.fineTuneBackgrounds,
        backgroundlessContentImageIndexes: payload.backgroundlessContentImageIndexes,
        stretchContentImages: payload.stretchContentImages,
        showPageNumbers: payload.showPageNumbers,
        pageNumberPosition: payload.pageNumberPosition,
        pageNumberFill: numberBadgeFill,
        pageWidth: pageSettings.width,
        pageHeight: pageSettings.height,
        totalPages: payload.pageCount,
      });
    }
    case "full-fact": {
      const entries = parseLooseFactsInput(payload.facts ?? "");
      const factsPerPage = Math.max(1, Math.min(6, payload.factsPerPage ?? 4));
      return renderFullFactBook({
        entries,
        factsPerPage,
        ...sharedImageOptions,
        overlayOpacity: clampOpacity(payload.overlayOpacity ?? 0.9),
        numberBadgeFill,
        boxTextFontId: payload.fullFactBoxFontId,
        boxTextFontBytes: payload.fullFactUploadedFontBytes,
        ...sharedPageOptions,
      });
    }
    case "dictionary": {
      return renderDictionaryBook({
        ...sharedImageOptions,
        targetSize: payload.targetImageSize,
        ...sharedPageOptions,
      });
    }
    default:
      throw new Error(`Unsupported mode: ${payload.mode}`);
  }
}

function clampOpacity(value: number) {
  if (Number.isNaN(value)) {
    return 0.9;
  }
  return Math.min(1, Math.max(0, value));
}

function resolveUploadedImagePageCount(pageCount?: number, imageAssets?: ImageAsset[]) {
  const fallback = imageAssets?.length ? imageAssets.length : 1;
  const raw = typeof pageCount === "number" && !Number.isNaN(pageCount) ? pageCount : fallback;
  return Math.min(MAX_TOTAL_PAGES, Math.max(1, Math.floor(raw)));
}
