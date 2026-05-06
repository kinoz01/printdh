"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildMetadataDownloadText,
  buildMetadataFileName,
  createEmptyDownloadKeywords,
  DEFAULT_DOWNLOAD_DESCRIPTION,
  DEFAULT_DOWNLOAD_TITLE,
  METADATA_STORAGE_KEY,
  parseStoredMetadata,
} from "@/lib/download-metadata";

export function MetadataManager() {
  const [downloadTitle, setDownloadTitle] = useState(DEFAULT_DOWNLOAD_TITLE);
  const [downloadSubtitle, setDownloadSubtitle] = useState("");
  const [downloadDescription, setDownloadDescription] = useState(DEFAULT_DOWNLOAD_DESCRIPTION);
  const [downloadKeywords, setDownloadKeywords] = useState<string[]>(() => createEmptyDownloadKeywords());
  const [metadataStorageReady, setMetadataStorageReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem(METADATA_STORAGE_KEY);
      if (!stored) {
        return;
      }
      const parsed = parseStoredMetadata(stored);
      setDownloadTitle(parsed.title);
      setDownloadSubtitle(parsed.subtitle);
      setDownloadDescription(parsed.description);
      setDownloadKeywords(parsed.keywords);
    } catch {
      // ignore corrupted payloads
    } finally {
      setMetadataStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !metadataStorageReady) {
      return;
    }
    try {
      window.localStorage.setItem(
        METADATA_STORAGE_KEY,
        JSON.stringify({
          title: downloadTitle,
          subtitle: downloadSubtitle,
          description: downloadDescription,
          keywords: downloadKeywords,
        })
      );
    } catch {
      // ignore quota issues
    }
  }, [downloadDescription, downloadKeywords, downloadSubtitle, downloadTitle, metadataStorageReady]);

  const hasDownloadMetadata = useMemo(
    () =>
      Boolean(
        downloadTitle.trim() ||
          downloadSubtitle.trim() ||
          downloadDescription.trim() ||
          downloadKeywords.some((keyword) => keyword.trim())
      ),
    [downloadDescription, downloadKeywords, downloadSubtitle, downloadTitle]
  );

  const handleDownloadMetadata = useCallback(() => {
    const content = buildMetadataDownloadText({
      title: downloadTitle,
      subtitle: downloadSubtitle,
      description: downloadDescription,
      keywords: downloadKeywords,
    });
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildMetadataFileName(downloadTitle);
    anchor.click();
    window.URL.revokeObjectURL(url);
  }, [downloadDescription, downloadKeywords, downloadSubtitle, downloadTitle]);

  return (
    <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-zinc-900">Metadata</h2>
        <p className="text-sm text-zinc-600">Saved automatically in this browser and ready to export as TXT.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-700">Title</span>
          <input
            type="text"
            value={downloadTitle}
            onChange={(event) => setDownloadTitle(event.target.value)}
            spellCheck
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-700">Subtitle</span>
          <input
            type="text"
            value={downloadSubtitle}
            onChange={(event) => setDownloadSubtitle(event.target.value)}
            spellCheck
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="text-sm font-medium text-zinc-700">Description</span>
          <textarea
            value={downloadDescription}
            onChange={(event) => setDownloadDescription(event.target.value)}
            className="h-[300px] rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
          />
        </label>
        {downloadKeywords.map((keyword, index) => (
          <label key={`download-keyword-${index}`} className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700">Keyword {index + 1}</span>
            <input
              type="text"
              value={keyword}
              onChange={(event) =>
                setDownloadKeywords((current) =>
                  current.map((value, keywordIndex) => (keywordIndex === index ? event.target.value : value))
                )
              }
              spellCheck
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
            />
          </label>
        ))}
      </div>
      {hasDownloadMetadata ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDownloadMetadata}
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Download TXT
          </button>
        </div>
      ) : null}
    </section>
  );
}
