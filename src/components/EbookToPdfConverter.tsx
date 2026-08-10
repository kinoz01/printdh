"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from "react";

const MAX_EBOOK_SIZE = 300 * 1024 * 1024;
const ACCEPTED_EBOOK_EXTENSIONS = [
  ".epub",
  ".mobi",
  ".azw",
  ".azw3",
  ".fb2",
  ".lit",
  ".lrf",
  ".pdb",
  ".pml",
  ".rb",
  ".rtf",
  ".txt",
  ".html",
  ".htm",
  ".docx",
  ".odt",
];

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

function getFileExtension(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function isEbookFile(file: File) {
  return ACCEPTED_EBOOK_EXTENSIONS.includes(getFileExtension(file.name));
}

function toSafeBasename(name: string) {
  const trimmed = name.trim() || "ebook";
  const extension = getFileExtension(trimmed);
  const withoutExtension = extension ? trimmed.slice(0, -extension.length) : trimmed;
  return withoutExtension.replace(/[\\/:*?"<>|]+/g, "-").trim() || "ebook";
}

export function EbookToPdfConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ original: number; pdf: number; settings: string | null } | null>(null);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canSubmit = !!file && !isLoading;
  const acceptedFormatsLabel = useMemo(
    () =>
      ACCEPTED_EBOOK_EXTENSIONS.map((extension) => extension.slice(1).toUpperCase())
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(", "),
    []
  );

  const handleSelectedFiles = useCallback((files: File[]) => {
    if (files.length === 0) {
      return;
    }
    if (files.length > 1) {
      setError("Choose one ebook at a time.");
      return;
    }
    const nextFile = files[0];
    if (!isEbookFile(nextFile)) {
      setError("Unsupported ebook format.");
      return;
    }
    if (nextFile.size > MAX_EBOOK_SIZE) {
      setError(`Ebook is too large (max ${formatBytes(MAX_EBOOK_SIZE)}).`);
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

  async function handleConvert() {
    if (!file) {
      setError("Choose an ebook.");
      return;
    }
    if (!isEbookFile(file)) {
      setError("Unsupported ebook format.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStats(null);

    try {
      const form = new FormData();
      form.set("file", file);

      const response = await fetch("/api/ebook-to-pdf", { method: "POST", body: form });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };
        const message = detail.error || "Unable to convert ebook to PDF";
        throw new Error(detail.hint ? `${message} (${detail.hint})` : message);
      }

      const blob = await response.blob();
      setStats({
        original: file.size,
        pdf: blob.size,
        settings: response.headers.get("X-Output-Settings"),
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${toSafeBasename(file.name)}.pdf`;
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
        <h2 className="text-lg font-semibold text-zinc-900">Ebook to PDF</h2>
        <p className="text-sm text-zinc-700">Upload an ebook and download a print-friendly PDF.</p>
      </div>

      <div className="mt-4 grid gap-3 text-xs text-zinc-700 sm:grid-cols-3">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">Page: Letter</div>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">Margins: 0.75 in</div>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">Text: automatic</div>
      </div>

      <div className="mt-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-900">Ebook file</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EBOOK_EXTENSIONS.join(",")}
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
                <p className="text-sm font-semibold text-zinc-900">Drop an ebook here</p>
                <p className="text-xs text-zinc-600">{acceptedFormatsLabel}</p>
              </div>
              <button
                type="button"
                onClick={handleOpenFilePicker}
                disabled={isLoading}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-black disabled:opacity-60"
              >
                Choose ebook
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
          onClick={handleConvert}
          disabled={!canSubmit}
          className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Converting..." : "ebook2pdf"}
        </button>

        {stats && (
          <p className="text-xs text-zinc-700">
            {formatBytes(stats.original)} to {formatBytes(stats.pdf)}
            {stats.settings ? ` (${stats.settings})` : ""}
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
    </section>
  );
}
