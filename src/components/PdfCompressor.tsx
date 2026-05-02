"use client";

import { useMemo, useState } from "react";

type QualityPreset = "printer" | "prepress" | "ebook" | "screen";

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

export function PdfCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<QualityPreset>("printer");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ original: number; compressed: number } | null>(null);

  const canSubmit = !!file && !isLoading;
  const ratio = useMemo(() => {
    if (!stats || stats.original <= 0) return null;
    return stats.compressed / stats.original;
  }, [stats]);

  async function handleCompress() {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStats(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("quality", quality);

      const response = await fetch("/api/compress-pdf", { method: "POST", body: form });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };
        const message = detail.error || "Unable to compress PDF";
        throw new Error(detail.hint ? `${message} (${detail.hint})` : message);
      }

      const blob = await response.blob();
      const originalSize = file.size;
      const compressedSize = blob.size;
      setStats({ original: originalSize, compressed: compressedSize });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${toSafeBasename(file.name)}-compressed.pdf`;
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
        <h2 className="text-lg font-semibold text-zinc-900">Compress a PDF for printing</h2>
        <p className="text-sm text-zinc-700">Upload a PDF and download a smaller, print-friendly copy.</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="text-sm font-medium text-zinc-900">PDF file</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
          />
          {file && (
            <span className="text-xs text-zinc-600">
              Selected: {file.name} ({formatBytes(file.size)})
            </span>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-900">Quality preset</span>
          <select
            value={quality}
            onChange={(event) => setQuality(event.target.value as QualityPreset)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="printer">Printer (recommended)</option>
            <option value="prepress">Prepress (highest quality)</option>
            <option value="ebook">eBook (smaller)</option>
            <option value="screen">Screen (smallest)</option>
          </select>
          <span className="text-xs text-zinc-600">Tip: start with Printer; use Prepress for art books.</span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleCompress}
          disabled={!canSubmit}
          className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Compressing..." : "Compress + download"}
        </button>

        {stats && (
          <p className="text-xs text-zinc-700">
            {formatBytes(stats.original)} → {formatBytes(stats.compressed)}
            {ratio !== null && ratio < 1 ? ` (${Math.round((1 - ratio) * 100)}% smaller)` : ""}
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
    </section>
  );
}
