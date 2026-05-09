import { DEFAULT_IMAGE_LIBRARY, PageSizePreset, resolvePageSettings } from "./constants";
import { parseFactsInput, parseListDescriptionInput, parseListInput, parseLooseFactsInput } from "./entry-parsers";
import { renderBook } from "./render-book";
import { renderFullFactBook } from "./render-full-fact";
import { renderDictionaryBook } from "./render-dictionary";
import { hexToRgb } from "./colors";
import { getNumberBadgeColorOption, type NumberBadgeColorKey } from "./number-badge-colors";
import { FACT_STYLE, TITLE_STYLE, type TextAlignment } from "./types";

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
  factsPerPage?: number;
  fullFactBoxFontId?: string;
  fullFactUploadedFontBytes?: Uint8Array;
  fullFactTitleFontId?: string;
  fullFactTitleUploadedFontBytes?: Uint8Array;
  targetImageSize?: number;
  pageSize?: PageSizePreset;
  pageCount?: number;
}

export async function generateBook(payload: GenerateBookPayload) {
  const imageLibrary = payload.imageLibrary || DEFAULT_IMAGE_LIBRARY;
  const opacity = clampOpacity(payload.overlayOpacity ?? 0.9);
  const numberBadgeFill = hexToRgb(getNumberBadgeColorOption(payload.numberBadgeColor).hex);
  const pageSettings = resolvePageSettings(payload.pageSize, payload.pageCount);
  const sharedPageOptions = {
    pageWidth: pageSettings.width,
    pageHeight: pageSettings.height,
    totalPages: pageSettings.totalPages,
  };

  switch (payload.mode) {
    case "facts": {
      const entries = parseFactsInput(payload.facts ?? "", 30);
      return renderBook({
        entries,
        placeholder: "Replace this placeholder fact paragraph with your narrative #{}.",
        imageLibrary,
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
        imageLibrary,
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
        imageLibrary,
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
        imageLibrary,
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
        imageLibrary,
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
        imageLibrary,
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
        imageLibrary,
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
        imageLibrary,
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
      const fullPageTextBoxSize = payload.describedPictureMaxBoxWidth ?? 7 * 72;
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
        imageLibrary,
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
          minHeight: fullPageTextBoxSize,
          maxHeight: fullPageTextBoxSize,
          maxBoxWidth: fullPageTextBoxSize,
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
        imageLibrary,
        overlayOverrides: {
          showOnEven: false,
          showOnOdd: false,
          showImageOnEven: true,
          showImageOnOdd: true,
        },
        ...sharedPageOptions,
      });
    }
    case "full-fact": {
      const entries = parseLooseFactsInput(payload.facts ?? "");
      const factsPerPage = Math.max(1, Math.min(6, payload.factsPerPage ?? 4));
      return renderFullFactBook({
        entries,
        factsPerPage,
        imageLibrary,
        overlayOpacity: clampOpacity(payload.overlayOpacity ?? 0.9),
        boxTextFontId: payload.fullFactBoxFontId,
        boxTextFontBytes: payload.fullFactUploadedFontBytes,
        ...sharedPageOptions,
      });
    }
    case "dictionary": {
      return renderDictionaryBook({
        imageLibrary,
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
