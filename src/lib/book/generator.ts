import { DEFAULT_IMAGE_LIBRARY, PageSizePreset, resolvePageSettings } from "./constants";
import { parseFactsInput, parseListDescriptionInput, parseListInput, parseLooseFactsInput } from "./entry-parsers";
import { renderBook } from "./render-book";
import { renderFullFactBook } from "./render-full-fact";
import { renderDictionaryBook } from "./render-dictionary";

export type BookMode =
  | "facts"
  | "facts-both"
  | "list"
  | "list-description"
  | "list-description-even"
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
  factsPerPage?: number;
  fullFactBoxFontId?: string;
  fullFactUploadedFontBytes?: Uint8Array;
  targetImageSize?: number;
  pageSize?: PageSizePreset;
  pageCount?: number;
}

export async function generateBook(payload: GenerateBookPayload) {
  const imageLibrary = payload.imageLibrary || DEFAULT_IMAGE_LIBRARY;
  const opacity = clampOpacity(payload.overlayOpacity ?? 0.9);
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
