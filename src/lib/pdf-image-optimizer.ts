export interface PrepareImagesForPdfUploadOptions {
  maxDimension?: number;
  jpegQuality?: number;
  maxOriginalSize?: number;
}

interface ResolvedPrepareImagesForPdfUploadOptions {
  maxDimension: number;
  jpegQuality: number;
  maxOriginalSize: number;
}

type SupportedPdfUploadMimeType = "image/png" | "image/jpeg";
type CanvasImageSourceLike = ImageBitmap | HTMLImageElement;

const DEFAULT_PREPARE_IMAGES_FOR_PDF_UPLOAD_OPTIONS: ResolvedPrepareImagesForPdfUploadOptions = {
  maxDimension: 1800,
  jpegQuality: 0.82,
  maxOriginalSize: 1_500_000,
};

export async function prepareImagesForPdfUpload(
  files: File[],
  options?: PrepareImagesForPdfUploadOptions
): Promise<File[]> {
  const resolvedOptions = resolvePrepareImagesForPdfUploadOptions(options);
  const preparedFiles: File[] = [];
  for (const file of files) {
    preparedFiles.push(await prepareImageForPdfUpload(file, resolvedOptions));
  }
  return preparedFiles;
}

export function normalizeImageMimeType(mimeType: string | null | undefined): string {
  const normalized = (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  switch (normalized) {
    case "image/jpg":
    case "image/pjpeg":
      return "image/jpeg";
    case "image/x-png":
      return "image/png";
    default:
      return normalized;
  }
}

export function isPdfUploadMimeType(mimeType: string | null | undefined): mimeType is SupportedPdfUploadMimeType {
  const normalized = normalizeImageMimeType(mimeType);
  return normalized === "image/png" || normalized === "image/jpeg";
}

async function prepareImageForPdfUpload(
  file: File,
  options: ResolvedPrepareImagesForPdfUploadOptions
): Promise<File> {
  try {
    const originalType = normalizeImageMimeType(file.type);
    const outputType: SupportedPdfUploadMimeType = originalType === "image/png" ? "image/png" : "image/jpeg";
    const source = await loadCanvasImageSource(file);

    try {
      const needsResize = Math.max(source.width, source.height) > options.maxDimension;
      const needsReencode =
        outputType !== originalType || (originalType === "image/jpeg" && file.size > options.maxOriginalSize);

      if (!needsResize && !needsReencode) {
        return file;
      }

      const scale = Math.min(1, options.maxDimension / Math.max(source.width, source.height));
      const targetWidth = Math.max(1, Math.round(source.width * scale));
      const targetHeight = Math.max(1, Math.round(source.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        return file;
      }

      context.drawImage(source.image, 0, 0, targetWidth, targetHeight);
      const blob = await canvasToBlob(
        canvas,
        outputType,
        outputType === "image/jpeg" ? options.jpegQuality : undefined
      );
      if (!blob || blob.size >= file.size) {
        return file;
      }

      return new File([blob], replaceFileExtension(file.name, outputType), {
        type: outputType,
        lastModified: file.lastModified,
      });
    } finally {
      source.release();
    }
  } catch {
    return file;
  }
}

function resolvePrepareImagesForPdfUploadOptions(
  options?: PrepareImagesForPdfUploadOptions
): ResolvedPrepareImagesForPdfUploadOptions {
  return {
    maxDimension: Math.max(
      512,
      Math.round(coerceFiniteNumber(options?.maxDimension, DEFAULT_PREPARE_IMAGES_FOR_PDF_UPLOAD_OPTIONS.maxDimension))
    ),
    jpegQuality: clampNumber(
      coerceFiniteNumber(options?.jpegQuality, DEFAULT_PREPARE_IMAGES_FOR_PDF_UPLOAD_OPTIONS.jpegQuality),
      0.5,
      0.95
    ),
    maxOriginalSize: Math.max(
      256_000,
      Math.round(
        coerceFiniteNumber(options?.maxOriginalSize, DEFAULT_PREPARE_IMAGES_FOR_PDF_UPLOAD_OPTIONS.maxOriginalSize)
      )
    ),
  };
}

function coerceFiniteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function loadCanvasImageSource(file: File): Promise<{
  image: CanvasImageSourceLike;
  width: number;
  height: number;
  release: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall back to Image decoding when bitmap creation is unavailable for this file.
    }
  }

  const image = await loadImageElement(file);
  return {
    image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    release: () => {},
  };
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Unable to decode ${file.name}`));
      });
    }
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: SupportedPdfUploadMimeType,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function replaceFileExtension(fileName: string, mimeType: SupportedPdfUploadMimeType) {
  const nextExtension = mimeType === "image/png" ? ".png" : ".jpg";
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return `${fileName}${nextExtension}`;
  }
  return `${fileName.slice(0, lastDotIndex)}${nextExtension}`;
}
