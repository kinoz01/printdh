"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from "react";

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

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function createRandomPdfName() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(6);
  window.crypto.getRandomValues(bytes);
  return `${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}.pdf`;
}

export function PdfMetadataRemover() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ original: number; cleaned: number } | null>(null);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canSubmit = !!file && !isLoading;
  const sizeDelta = useMemo(() => {
    if (!stats || stats.original <= 0) return null;
    const diff = stats.cleaned - stats.original;
    if (diff === 0) return "same size";
    return diff < 0 ? `${Math.round((Math.abs(diff) / stats.original) * 100)}% smaller` : "rebuilt";
  }, [stats]);

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
    setFile(nextFile);
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

  async function handleRemoveMetadata() {
    if (!file) return;
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

      const response = await fetch("/api/remove-pdf-metadata", { method: "POST", body: form });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };
        const message = detail.error || "Unable to remove PDF metadata";
        throw new Error(detail.hint ? `${message} (${detail.hint})` : message);
      }

      const blob = await response.blob();
      setStats({ original: file.size, cleaned: blob.size });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = createRandomPdfName();
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
        <h2 className="text-lg font-semibold text-zinc-900">Remove PDF metadata</h2>
        <p className="text-sm text-zinc-700">
          Rebuild a PDF and strip document info, XMP metadata, IDs, actions, attachments, forms, and annotations.
        </p>
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
          onClick={handleRemoveMetadata}
          disabled={!canSubmit}
          className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Removing..." : "Remove metadata + download"}
        </button>

        {stats && (
          <p className="text-xs text-zinc-700">
            {formatBytes(stats.original)} → {formatBytes(stats.cleaned)}
            {sizeDelta ? ` (${sizeDelta})` : ""}
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
    </section>
  );
}
