"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from "react";

const TARGET_WIDTH_IN = 8.625;
const TARGET_HEIGHT_IN = 11.25;
const MAX_PDF_SIZE = 500 * 1024 * 1024;

type PdfPageSize = {
  widthIn: number;
  heightIn: number;
  pages: number;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : unitIndex === 1 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function toSafeBasename(name: string) {
  const trimmed = name.trim() || "document.pdf";
  const cleaned = trimmed.replace(/[\\\/]+/g, "-");
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned.slice(0, -4) : cleaned;
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function formatScale(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatInches(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function formatPageSize(size: Pick<PdfPageSize, "widthIn" | "heightIn">) {
  return `${formatInches(size.widthIn)} x ${formatInches(size.heightIn)} in`;
}

export function HardcoverPdfResizer() {
  const [file, setFile] = useState<File | null>(null);
  const [detectedSize, setDetectedSize] = useState<PdfPageSize | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ original: number; resized: number; pages: number | null } | null>(null);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canSubmit = !!file && !isLoading;

  const stretchPreview = useMemo(() => {
    if (!detectedSize) {
      return null;
    }

    return {
      width: formatScale(TARGET_WIDTH_IN / detectedSize.widthIn),
      height: formatScale(TARGET_HEIGHT_IN / detectedSize.heightIn),
    };
  }, [detectedSize]);

  const handleSelectedFiles = useCallback((files: File[]) => {
    if (files.length === 0) {
      return;
    }
    if (files.length > 1) {
      setError("Choose one PDF at a time.");
      return;
    }
    const nextFile = files[0];
    if (!isPdfFile(nextFile)) {
      setError("Only PDF files are supported.");
      return;
    }
    if (nextFile.size > MAX_PDF_SIZE) {
      setError(`PDF is too large (max ${formatBytes(MAX_PDF_SIZE)}).`);
      return;
    }
    setFile(nextFile);
    setDetectedSize(null);
    setError(null);
    setStats(null);
  }, []);

  const handleOpenFilePicker = useCallback(() => {
    if (isLoading) {
      return;
    }
    fileInputRef.current?.click();
  }, [isLoading]);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleSelectedFiles(Array.from(event.target.files ?? []));
      event.target.value = "";
    },
    [handleSelectedFiles]
  );

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isLoading) {
        return;
      }
      setIsDropTargetActive(true);
    },
    [isLoading]
  );

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsDropTargetActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDropTargetActive(false);
      if (isLoading) {
        return;
      }
      handleSelectedFiles(Array.from(event.dataTransfer.files ?? []));
    },
    [handleSelectedFiles, isLoading]
  );

  async function handleResize() {
    if (!file) {
      setError("Choose a PDF.");
      return;
    }
    if (!isPdfFile(file)) {
      setError("Only PDF files are supported.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStats(null);

    try {
      const form = new FormData();
      form.set("file", file);

      const response = await fetch("/api/stretch-pdf-to-letter", { method: "POST", body: form });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error || "Unable to resize PDF");
      }

      const blob = await response.blob();
      const pageCountHeader = response.headers.get("X-Page-Count");
      const sourceSizeHeader = response.headers.get("X-Source-Size-In");
      const pageCount = pageCountHeader ? Number(pageCountHeader) : null;
      const sourceSize = parseSourceSizeHeader(sourceSizeHeader, Number.isFinite(pageCount) ? pageCount : null);
      setDetectedSize(sourceSize);
      setStats({
        original: file.size,
        resized: blob.size,
        pages: Number.isFinite(pageCount) ? pageCount : null,
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${toSafeBasename(file.name)}-8.625x11.25.pdf`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">Stretch PDF pages to US Letter bleed</h2>
        <p className="text-sm text-zinc-700">
          Upload a hardcover interior PDF and download a copy with every page rebuilt at 8.625 x 11.25 in.
        </p>
      </div>

      <div className="mt-4 grid gap-3 text-xs text-zinc-700 sm:grid-cols-3">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          Source:{" "}
          {detectedSize
            ? `${formatPageSize(detectedSize)} (${detectedSize.pages} page${detectedSize.pages === 1 ? "" : "s"})`
            : file
              ? "checked during resize"
              : "choose a PDF"}
        </div>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          Target: {TARGET_WIDTH_IN} x {TARGET_HEIGHT_IN} in
        </div>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          Stretch:{" "}
          {stretchPreview
            ? `${stretchPreview.width} wide, ${stretchPreview.height} tall`
            : file
              ? "checked during resize"
              : "choose a PDF"}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-900">PDF file</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-xl border border-dashed p-4 transition ${
              isDropTargetActive ? "border-black bg-zinc-50" : "border-zinc-300 bg-white"
            } ${isLoading ? "opacity-70" : ""}`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-900">Drop a PDF here</p>
                <p className="text-xs text-zinc-600">Or choose one from your device. Only PDF files are accepted.</p>
              </div>
              <button
                type="button"
                onClick={handleOpenFilePicker}
                disabled={isLoading}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-black disabled:opacity-60"
              >
                Choose PDF
              </button>
            </div>
            {file && (
              <p className="mt-3 text-xs text-zinc-600">
                Selected: {file.name} ({formatBytes(file.size)})
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleResize}
          disabled={!canSubmit}
          className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Uploading + stretching..." : "Stretch + download"}
        </button>

        {stats && (
          <p className="text-xs text-zinc-700">
            {stats.pages ? `${stats.pages} page${stats.pages === 1 ? "" : "s"}, ` : ""}
            {formatBytes(stats.original)} to {formatBytes(stats.resized)}
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
    </section>
  );
}

function parseSourceSizeHeader(value: string | null, pages: number | null): PdfPageSize | null {
  if (!value) {
    return null;
  }
  const [widthValue, heightValue] = value.split("x");
  const widthIn = Number(widthValue);
  const heightIn = Number(heightValue);
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
    return null;
  }
  return {
    widthIn,
    heightIn,
    pages: pages ?? 0,
  };
}
