"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent } from "react";

interface CropValues {
  all: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
}

const DEFAULT_CROP_VALUES: CropValues = {
  all: "0",
  top: "",
  right: "",
  bottom: "",
  left: "",
};

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

export function ImageCropper() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [cropValues, setCropValues] = useState<CropValues>(DEFAULT_CROP_VALUES);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const effectiveCrop = useMemo(() => {
    const all = parseCropInput(cropValues.all);
    return {
      top: parseCropInput(cropValues.top, all),
      right: parseCropInput(cropValues.right, all),
      bottom: parseCropInput(cropValues.bottom, all),
      left: parseCropInput(cropValues.left, all),
    };
  }, [cropValues]);

  const handleAddFiles = useCallback((nextFiles: File[]) => {
    const supportedFiles = nextFiles.filter(isSupportedImageFile);
    const ignoredCount = nextFiles.length - supportedFiles.length;
    if (supportedFiles.length === 0) {
      setNotice({
        text: ignoredCount > 0 ? "Only JPG, PNG, WEBP, and GIF images can be cropped." : "Choose at least one image.",
        tone: "error",
      });
      return;
    }
    setFiles((current) => [...current, ...supportedFiles]);
    setNotice({
      text:
        ignoredCount > 0
          ? `Added ${supportedFiles.length} image${supportedFiles.length === 1 ? "" : "s"}. Ignored ${ignoredCount} unsupported file${ignoredCount === 1 ? "" : "s"}.`
          : `Added ${supportedFiles.length} image${supportedFiles.length === 1 ? "" : "s"}.`,
      tone: "success",
    });
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (selectedFiles.length > 0) {
        handleAddFiles(selectedFiles);
      }
    },
    [handleAddFiles]
  );

  const handleDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isProcessing) {
      event.dataTransfer.dropEffect = "copy";
      setIsDragActive(true);
    }
  }, [isProcessing]);

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      if (isProcessing) {
        return;
      }
      handleAddFiles(Array.from(event.dataTransfer.files ?? []));
    },
    [handleAddFiles, isProcessing]
  );

  const handleCropValueChange = useCallback((key: keyof CropValues, value: string) => {
    setCropValues((current) => ({ ...current, [key]: cleanNumericInput(value) }));
  }, []);

  const handleRemoveFile = useCallback((indexToRemove: number) => {
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
  }, []);

  const handleClearFiles = useCallback(() => {
    setFiles([]);
    setNotice(null);
  }, []);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) {
      setNotice({ text: "Add at least one image to crop.", tone: "error" });
      return;
    }

    setIsProcessing(true);
    setNotice(null);
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("images", file);
      }
      formData.append("top", String(effectiveCrop.top));
      formData.append("right", String(effectiveCrop.right));
      formData.append("bottom", String(effectiveCrop.bottom));
      formData.append("left", String(effectiveCrop.left));

      const response = await fetch("/api/crop-images", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Failed to crop images");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = getDownloadFileName(response.headers.get("content-disposition")) || "cropped-images.zip";
      anchor.click();
      window.URL.revokeObjectURL(url);
      setNotice({
        text: `Downloaded ${files.length} cropped image${files.length === 1 ? "" : "s"} as ${anchor.download}.`,
        tone: "success",
      });
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "Failed to crop images",
        tone: "error",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [effectiveCrop, files]);

  return (
    <section className="space-y-5">
      <div className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-5">
        <label className="space-y-1 text-sm font-medium text-zinc-700">
          <span className="block text-xs uppercase tracking-wide text-zinc-500">All sides</span>
          <input
            type="number"
            min={0}
            value={cropValues.all}
            onChange={(event) => handleCropValueChange("all", event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
        </label>
        {(["top", "right", "bottom", "left"] as const).map((key) => (
          <label key={key} className="space-y-1 text-sm font-medium text-zinc-700">
            <span className="block text-xs uppercase tracking-wide text-zinc-500">{key}</span>
            <input
              type="number"
              min={0}
              value={cropValues[key]}
              onChange={(event) => handleCropValueChange(key, event.target.value)}
              placeholder={String(parseCropInput(cropValues.all))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          </label>
        ))}
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-xl border border-dashed bg-white p-6 transition ${
          isDragActive ? "border-black bg-zinc-50" : "border-zinc-300"
        } ${isProcessing ? "opacity-70" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-zinc-950">Drop images here</p>
            <p className="text-xs text-zinc-500">
              Cropping now removes {effectiveCrop.top}px top, {effectiveCrop.right}px right, {effectiveCrop.bottom}px bottom, and{" "}
              {effectiveCrop.left}px left.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-black disabled:opacity-60"
          >
            Choose images
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-950">
              {files.length} image{files.length === 1 ? "" : "s"} ready
            </p>
            <button
              type="button"
              onClick={handleClearFiles}
              disabled={isProcessing}
              className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-black disabled:opacity-60"
            >
              Clear
            </button>
          </div>
          <ul className="space-y-2">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-950">{file.name}</p>
                  <p className="text-xs text-zinc-500">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  disabled={isProcessing}
                  className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:border-red-400 disabled:opacity-60"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleProcess()}
        disabled={isProcessing || files.length === 0}
        className="w-full rounded-md bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {isProcessing ? "Cropping images..." : "Crop and download images"}
      </button>
      {notice && <p className={`text-sm ${notice.tone === "success" ? "text-emerald-600" : "text-red-600"}`}>{notice.text}</p>}
    </section>
  );
}

function parseCropInput(value: string, fallback = 0) {
  if (!value.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.round(parsed);
}

function cleanNumericInput(value: string) {
  if (!value.trim()) {
    return "";
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "0";
  }
  return String(Math.round(parsed));
}

function isSupportedImageFile(file: File) {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return true;
  }
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_IMAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function getDownloadFileName(contentDisposition: string | null) {
  if (!contentDisposition) {
    return "";
  }
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return basicMatch?.[1] ?? "";
}
