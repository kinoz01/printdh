"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const PROVIDERS = [
  {
    value: "scraping-win",
    label: "api.scraping.win",
    description: "Default free provider (token included).",
    requiresKeys: false,
  },
  {
    value: "google",
    label: "Google Custom Search",
    description: "Requires GOOGLE_CSE_KEY + GOOGLE_CSE_CX.",
    requiresKeys: true,
  },
  {
    value: "pixabay",
    label: "Pixabay",
    description: "Requires PIXABAY_API_KEY.",
    requiresKeys: true,
  },
  {
    value: "pexels",
    label: "Pexels",
    description: "Requires PEXELS_API_KEY.",
    requiresKeys: true,
  },
  {
    value: "brave",
    label: "Brave Search",
    description: "Requires BRAVE_API_KEY.",
    requiresKeys: true,
  },
] as const;

type ProviderValue = (typeof PROVIDERS)[number]["value"];

const DEFAULT_KEYS = {
  googleApiKey: "",
  googleCx: "",
  pixabayKey: "",
  pexelsKey: "",
  braveKey: "",
};

type ApiKeys = typeof DEFAULT_KEYS;

interface ImageResult {
  id: string;
  previewUrl: string;
  fullsizeUrl: string;
  width?: number;
  height?: number;
  fileSize?: number;
  source: string;
  title?: string;
  provider: ProviderValue;
  keyword: string;
}

interface KeywordProviderGroup {
  provider: ProviderValue;
  results: ImageResult[];
  error: string | null;
}

interface KeywordGroup {
  keyword: string;
  providers: KeywordProviderGroup[];
}

interface LibraryFile {
  name: string;
  relativePath: string;
  size: number;
  modified: number;
  previewUrl: string;
}

interface LibraryPayload {
  rootLabel: string;
  files: LibraryFile[];
  sourcesByUrl?: Record<string, string>;
}

interface LibrarySection {
  folderKey: string;
  label: string;
  files: LibraryFile[];
}

interface ImageStudioProps {
  defaultLimit?: number;
}

interface ProviderStatus {
  provider: string;
  count: number;
  error?: string | null;
}

interface SaveImageResponse {
  savedAs: string;
  duplicate?: boolean;
}

interface ImageLibraryPanelProps {
  library: LibraryPayload | null;
  libraryError: string | null;
  libraryNotice: { text: string; tone: "success" | "error" } | null;
  loadingLibrary: boolean;
  uploadingLocal: boolean;
  removingAll: boolean;
  deletingPath: string | null;
  onRefresh: () => Promise<void>;
  onRemoveAll: () => Promise<void>;
  onDeleteFile: (relativePath: string) => Promise<void>;
  onReorder: (folderKey: string, nextFiles: LibraryFile[]) => Promise<void>;
  onUploadFiles: (files: File[]) => Promise<void>;
}

interface DragState {
  activePath: string;
  folderKey: string;
  overIndex: number | null;
  pointerId: number;
}

const SCRAPING_TOKEN = "DGir3Y/3jio3iwDOGjEjqQMv1OHC/DTasyq+FP1+mW0";
const STORAGE_KEY = "image-provider-keys";
const MAX_RESULTS = 36;

export function ImageStudio({ defaultLimit = 18 }: ImageStudioProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeys>(DEFAULT_KEYS);
  const [selectedProviders, setSelectedProviders] = useState<Set<ProviderValue>>(new Set(["scraping-win"]));
  const [keywordInput, setKeywordInput] = useState("");
  const keywords = useMemo(() => parseKeywords(keywordInput), [keywordInput]);
  const [maxResults, setMaxResults] = useState(defaultLimit);
  const [keywordGroups, setKeywordGroups] = useState<KeywordGroup[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus[] | null>(null);
  const [library, setLibrary] = useState<LibraryPayload | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryNotice, setLibraryNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [uploadingLocal, setUploadingLocal] = useState(false);
  const [minFileSizeInput, setMinFileSizeInput] = useState("");
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [removingAll, setRemovingAll] = useState(false);
  const [serverProviderSupport, setServerProviderSupport] = useState<Record<ProviderValue, boolean> | null>(null);

  const refreshLibrary = useCallback(async () => {
    try {
      setLoadingLibrary(true);
      setLibraryError(null);
      const response = await fetch("/api/images", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Unable to read images folder");
      }
      const payload = (await response.json()) as LibraryPayload;
      setLibrary(payload);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Unable to load images folder");
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setApiKeys({ ...DEFAULT_KEYS, ...parsed });
      }
    } catch {
      // ignore corrupted payloads
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(apiKeys));
    } catch {
      // ignore quota issues
    }
  }, [apiKeys]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    let cancelled = false;
    async function fetchServerSupport() {
      try {
        const response = await fetch("/api/image-search", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to check provider status");
        }
        const payload = await response.json();
        if (!cancelled) {
          setServerProviderSupport(payload.providers ?? null);
          if (payload.defaults) {
            setApiKeys((current) => ({
              googleApiKey: current.googleApiKey || payload.defaults.googleApiKey || "",
              googleCx: current.googleCx || payload.defaults.googleCx || "",
              pixabayKey: current.pixabayKey || payload.defaults.pixabayKey || "",
              pexelsKey: current.pexelsKey || payload.defaults.pexelsKey || "",
              braveKey: current.braveKey || payload.defaults.braveKey || "",
            }));
          }
        }
      } catch {
        if (!cancelled) {
          setServerProviderSupport(null);
        }
      }
    }
    void fetchServerSupport();
    return () => {
      cancelled = true;
    };
  }, []);

  const providerMeta = useMemo(() => {
    const missingKeys: Record<ProviderValue, boolean> = {
      "scraping-win": false,
      google: !apiKeys.googleApiKey || !apiKeys.googleCx,
      pixabay: !apiKeys.pixabayKey,
      pexels: !apiKeys.pexelsKey,
      brave: !apiKeys.braveKey,
    };
    const serverSupport: Record<ProviderValue, boolean> = {
      "scraping-win": true,
      google: Boolean(serverProviderSupport?.google),
      pixabay: Boolean(serverProviderSupport?.pixabay),
      pexels: Boolean(serverProviderSupport?.pexels),
      brave: Boolean(serverProviderSupport?.brave),
    };
    const meta: Record<ProviderValue, { missingLocal: boolean; hasServer: boolean }> = {
      "scraping-win": { missingLocal: false, hasServer: true },
      google: { missingLocal: missingKeys.google, hasServer: serverSupport.google },
      pixabay: { missingLocal: missingKeys.pixabay, hasServer: serverSupport.pixabay },
      pexels: { missingLocal: missingKeys.pexels, hasServer: serverSupport.pexels },
      brave: { missingLocal: missingKeys.brave, hasServer: serverSupport.brave },
    };
    return meta;
  }, [apiKeys, serverProviderSupport]);

  const handleProviderToggle = useCallback(
    (value: ProviderValue) => {
      setSelectedProviders((current) => {
        const next = new Set(current);
        if (value === "scraping-win") {
          return next; // always active
        }
        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }
        return next;
      });
    },
    []
  );

  const handleSearch = useCallback(async () => {
    if (!keywords.length) {
      setSearchError("Add at least one keyword to search");
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setProviderStatus(null);
    setKeywordGroups([]);
    try {
      const limit = Math.min(Math.max(maxResults, 3), MAX_RESULTS);
      const minSizeKb = parseFileSizeInput(minFileSizeInput);
      const response = await fetch("/api/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords,
          limit,
          minSizeKb,
          providers: Array.from(selectedProviders),
          keys: apiKeys,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Search failed");
      }
      const payload = await response.json();
      const groups = Array.isArray(payload.keywordGroups) ? (payload.keywordGroups as KeywordGroup[]) : [];
      setKeywordGroups(groups);
      setProviderStatus(Array.isArray(payload.sources) ? payload.sources : null);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [apiKeys, keywords, maxResults, minFileSizeInput, selectedProviders]);

  const handleSave = useCallback(
    async (image: ImageResult) => {
      setSavingId(image.id);
      setSaveMessage(null);
      try {
        const response = await fetch("/api/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: image.fullsizeUrl || image.previewUrl,
            title: image.title,
          }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error || "Failed to save image");
        }
        const { savedAs, duplicate } = (await response.json()) as SaveImageResponse;
        setSaveMessage({
          text: duplicate ? `Already saved as ${savedAs}` : `Saved to ${savedAs}`,
          tone: "success",
        });
        await refreshLibrary();
      } catch (error) {
        setSaveMessage({
          text: error instanceof Error ? error.message : "Failed to save image",
          tone: "error",
        });
      } finally {
        setSavingId(null);
      }
    },
    [refreshLibrary]
  );

  const handleDeleteFile = useCallback(
    async (relativePath: string) => {
      if (!relativePath) {
        return;
      }
      setDeletingPath(relativePath);
      setLibraryNotice(null);
      try {
        const response = await fetch(`/api/images?path=${encodeURIComponent(relativePath)}`, { method: "DELETE" });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error || "Failed to remove image");
        }
        setLibraryNotice({ text: "Image removed", tone: "success" });
        await refreshLibrary();
      } catch (error) {
        setLibraryNotice({
          text: error instanceof Error ? error.message : "Failed to remove image",
          tone: "error",
        });
      } finally {
        setDeletingPath(null);
      }
    },
    [refreshLibrary]
  );

  const handleRemoveAll = useCallback(async () => {
    setRemovingAll(true);
    setLibraryNotice(null);
    try {
      const response = await fetch("/api/images?all=true", { method: "DELETE" });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Failed to remove images");
      }
      const result = await response.json().catch(() => null);
      const count = typeof result?.count === "number" ? result.count : undefined;
      setLibraryNotice({
        text: count !== undefined ? `Removed ${count} image${count === 1 ? "" : "s"}` : "All images removed",
        tone: "success",
      });
      await refreshLibrary();
    } catch (error) {
      setLibraryNotice({
        text: error instanceof Error ? error.message : "Failed to remove images",
        tone: "error",
      });
    } finally {
      setRemovingAll(false);
    }
  }, [refreshLibrary]);

  const providerBuckets = useMemo(() => {
    const map = new Map<ProviderValue, { provider: ProviderValue; keywords: Array<{ keyword: string; results: ImageResult[]; error: string | null }> }>();
    for (const group of keywordGroups) {
      for (const bucket of group.providers) {
        if (!map.has(bucket.provider)) {
          map.set(bucket.provider, { provider: bucket.provider, keywords: [] });
        }
        map.get(bucket.provider)!.keywords.push({
          keyword: group.keyword,
          results: bucket.results,
          error: bucket.error ?? null,
        });
      }
    }
    return Array.from(map.values());
  }, [keywordGroups]);

  const totalCandidates = useMemo(
    () => countImagesInKeywordGroups(keywordGroups),
    [keywordGroups]
  );
  const savedImageCount = library?.files.length ?? 0;

  const handleReorderLibrary = useCallback(
    async (folderKey: string, nextFiles: LibraryFile[]) => {
      const previousFiles = library?.files ?? [];
      setLibrary((current) => (current ? { ...current, files: nextFiles } : current));
      setLibraryNotice(null);
      try {
        const response = await fetch("/api/images", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            folder: folderKey || undefined,
            order: nextFiles
              .filter((file) => getFolderKeyFromRelativePath(file.relativePath) === folderKey)
              .map((file) => file.name),
          }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error || "Failed to save image order");
        }
        setLibraryNotice({
          text: folderKey ? `Saved image order for ${folderKey}` : "Saved image order",
          tone: "success",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save image order";
        setLibrary((current) => (current ? { ...current, files: previousFiles } : current));
        setLibraryNotice({
          text: message,
          tone: "error",
        });
        throw error instanceof Error ? error : new Error(message);
      }
    },
    [library]
  );

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      const supportedFiles = files.filter(isSupportedLocalImageFile);
      const ignoredCount = files.length - supportedFiles.length;
      if (supportedFiles.length === 0) {
        setLibraryNotice({
          text: ignoredCount > 0 ? "Only JPG, PNG, WEBP, and GIF images can be added." : "Choose at least one image to upload.",
          tone: "error",
        });
        return;
      }

      setUploadingLocal(true);
      setLibraryNotice(null);

      let addedCount = 0;
      let failedCount = 0;

      try {
        for (const file of supportedFiles) {
          const formData = new FormData();
          formData.append("file", file);
          const response = await fetch("/api/images", {
            method: "POST",
            body: formData,
          });
          if (!response.ok) {
            failedCount += 1;
            continue;
          }
          addedCount += 1;
        }

        if (addedCount > 0) {
          await refreshLibrary();
        }

        setLibraryNotice({
          text: buildUploadNotice({
            addedCount,
            failedCount,
            ignoredCount,
          }),
          tone: failedCount > 0 ? "error" : "success",
        });
      } catch (error) {
        setLibraryNotice({
          text: error instanceof Error ? error.message : "Failed to add images",
          tone: "error",
        });
      } finally {
        setUploadingLocal(false);
      }
    },
    [refreshLibrary]
  );

  const renderResultCard = (result: ImageResult, uniqueKey?: string) => {
    const sourceUrl = result.fullsizeUrl || result.previewUrl;
    const savedPath = sourceUrl && library?.sourcesByUrl ? library.sourcesByUrl[sourceUrl] : undefined;
    const isSaving = savingId === result.id;
    const isRemoving = savedPath ? deletingPath === savedPath : false;
    return (
      <article
        key={uniqueKey ?? `${result.id}-${result.keyword}-${result.provider}`}
        className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white"
      >
        <div className="relative aspect-square bg-zinc-100">
          <img
            src={result.previewUrl}
            alt={result.title || result.source}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {savedPath && (
            <span className="absolute right-2 top-2 rounded-full bg-emerald-600/95 px-2 py-1 text-xs font-semibold text-white">
              Saved
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3 text-sm">
          <div>
            <p className="font-semibold text-zinc-900">{result.title || "Untitled"}</p>
            <p className="text-xs text-zinc-500">
              {result.source} · {getProviderLabel(result.provider)} · {result.keyword}
            </p>
          </div>
          {result.width && result.height && (
            <p className="text-xs text-zinc-500">
              {result.width} × {result.height}px
            </p>
          )}
          {typeof result.fileSize === "number" && <p className="text-xs text-zinc-500">{formatFileSize(result.fileSize)}</p>}
          <button
            type="button"
            onClick={() => (savedPath ? handleDeleteFile(savedPath) : handleSave(result))}
            disabled={savedPath ? isRemoving : isSaving}
            className={`mt-auto rounded-md border px-3 py-2 text-xs font-semibold transition ${
              savedPath
                ? "border-red-200 text-red-600 hover:border-red-400"
                : "border-zinc-300 text-zinc-800 hover:border-black"
            } disabled:opacity-60`}
          >
            {savedPath ? (isRemoving ? "Removing…" : "Remove from images") : isSaving ? "Saving…" : "Add to images"}
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-8">
      <div className="fixed right-4 bottom-4 z-20 sm:right-6 sm:bottom-6">
        <div className="rounded-full border border-zinc-200 bg-white/95 px-4 py-2 text-xs font-semibold text-zinc-700 shadow-sm backdrop-blur">
          Images saved: {savedImageCount}
        </div>
      </div>
      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Step 3</p>
          <h3 className="text-lg font-semibold text-zinc-900">Set up image providers</h3>
          <p className="text-sm text-zinc-600">
            Paste your API keys once. They stay in localStorage so the next search can reuse them.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">GOOGLE_CSE_KEY</span>
            <input
              type="text"
              value={apiKeys.googleApiKey}
              onChange={(event) => setApiKeys((keys) => ({ ...keys, googleApiKey: event.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="AIza..."
            />
          </label>
          <label className="space-y-1 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">GOOGLE_CSE_CX</span>
            <input
              type="text"
              value={apiKeys.googleCx}
              onChange={(event) => setApiKeys((keys) => ({ ...keys, googleCx: event.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="d6aa9f..."
            />
          </label>
          <label className="space-y-1 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">PIXABAY_API_KEY</span>
            <input
              type="text"
              value={apiKeys.pixabayKey}
              onChange={(event) => setApiKeys((keys) => ({ ...keys, pixabayKey: event.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="Pixabay token"
            />
          </label>
          <label className="space-y-1 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">PEXELS_API_KEY</span>
            <input
              type="text"
              value={apiKeys.pexelsKey}
              onChange={(event) => setApiKeys((keys) => ({ ...keys, pexelsKey: event.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="Pexels token"
            />
          </label>
          <label className="space-y-1 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">BRAVE_API_KEY</span>
            <input
              type="text"
              value={apiKeys.braveKey}
              onChange={(event) => setApiKeys((keys) => ({ ...keys, braveKey: event.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="Brave subscription token"
            />
          </label>
          <label className="space-y-1 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">api.scraping.win token</span>
            <input
              type="text"
              value={SCRAPING_TOKEN}
              readOnly
              className="w-full rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm"
            />
            <span className="text-xs text-zinc-500">Always-on fallback provider.</span>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h4 className="text-base font-semibold text-zinc-900">Pick providers & search</h4>
          <p className="text-sm text-zinc-600">Enable every source with valid credentials to widen coverage.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.map((provider) => {
            const isChecked = selectedProviders.has(provider.value);
            const support = providerMeta[provider.value];
            const missingKeys = provider.requiresKeys && support.missingLocal && !support.hasServer;
            const disabled = provider.value === "scraping-win";
            return (
              <label
                key={provider.value}
                className={`flex cursor-pointer flex-col rounded-xl border p-4 text-sm transition ${
                  isChecked ? "border-black shadow-sm" : "border-zinc-200"
                } ${disabled ? "bg-zinc-50" : "bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-900">{provider.label}</span>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={disabled || missingKeys}
                    onChange={() => handleProviderToggle(provider.value)}
                  />
                </div>
                <p className="text-xs text-zinc-600">{provider.description}</p>
                {provider.requiresKeys && support.missingLocal && !support.hasServer && (
                  <p className="text-xs font-medium text-amber-600">Add keys to enable</p>
                )}
                {provider.requiresKeys && support.missingLocal && support.hasServer && (
                  <p className="text-xs font-medium text-emerald-600">Server keys active</p>
                )}
                {provider.value === "scraping-win" && <p className="text-xs text-emerald-600">Always active</p>}
              </label>
            );
          })}
        </div>
        <div className="space-y-3">
          <label className="text-sm font-medium text-zinc-700">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Keyword list</span>
            <textarea
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              className="h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder={"One keyword per line\n(ex: brave tigers)"}
            />
          </label>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{keywords.length} / 30 keywords ready</span>
            <span>They will be fetched top to bottom.</span>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-md border border-dashed border-zinc-200 bg-white/70 p-3 text-xs text-zinc-700">
              {keywords.map((word, index) => (
                <span key={`${word}-${index}`} className="rounded-full bg-zinc-100 px-2 py-1">
                  {index + 1}. {word}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Max per keyword</span>
            <input
              type="number"
              min={3}
              max={MAX_RESULTS}
              value={maxResults}
              onChange={(event) => setMaxResults(Number(event.target.value))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Min file size (KB)</span>
            <input
              type="number"
              min={0}
              value={minFileSizeInput}
              onChange={(event) => setMinFileSizeInput(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="500"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={isSearching}
          className="w-full rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {isSearching
            ? "Searching…"
            : keywords.length > 0
              ? `Fetch images for ${keywords.length} keyword${keywords.length === 1 ? "" : "s"}`
              : "Fetch images"}
        </button>
        {searchError && <p className="text-sm text-red-600">{searchError}</p>}
        {providerStatus && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
            <p className="text-sm font-semibold text-zinc-800">Provider status</p>
            <ul className="mt-2 space-y-1">
              {providerStatus.map((status) => {
                const label = PROVIDERS.find((provider) => provider.value === status.provider)?.label || status.provider;
                return (
                  <li key={status.provider} className="flex justify-between gap-2">
                    <span>{label}</span>
                    {status.error ? (
                      <span className="text-red-600">{status.error}</span>
                    ) : (
                      <span className="text-zinc-500">{status.count} images</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {totalCandidates > 0 && (
          <div className="space-y-6">
            <p className="text-sm font-medium text-zinc-700">
              Fetched {totalCandidates} candidates across {keywordGroups.length} keyword{keywordGroups.length === 1 ? "" : "s"}
            </p>
            <div className="space-y-6">
              <div className="space-y-3">
                <h5 className="text-sm font-semibold text-zinc-800">Grouped by provider</h5>
                {providerBuckets.length === 0 && <p className="text-xs text-zinc-500">No providers returned images yet.</p>}
                {providerBuckets.map((bucket) => {
                  const providerLabel = getProviderLabel(bucket.provider);
                  const providerTotal = bucket.keywords.reduce((sum, keyword) => sum + keyword.results.length, 0);
                  return (
                    <div key={bucket.provider} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="flex flex-col gap-1 text-sm">
                        <p className="font-semibold text-zinc-900">{providerLabel}</p>
                        <p className="text-xs text-zinc-500">{providerTotal} images</p>
                      </div>
                      {bucket.keywords.map((entry) => (
                        <div key={`${bucket.provider}-${entry.keyword}`} className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between text-xs text-zinc-500">
                            <span className="font-medium text-zinc-800">{entry.keyword}</span>
                            <span>{entry.results.length} matches</span>
                          </div>
                          {entry.error && <p className="text-xs text-red-600">{entry.error}</p>}
                          {entry.results.length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              {entry.results.map((result, index) =>
                                renderResultCard(result, `${bucket.provider}-${entry.keyword}-${index}`)
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500">No images passed the filters.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {saveMessage && (
          <p className={`text-sm ${saveMessage.tone === "success" ? "text-emerald-600" : "text-red-600"}`}>
            {saveMessage.text}
          </p>
        )}
      </section>

      <ImageLibraryPanel
        library={library}
        libraryError={libraryError}
        libraryNotice={libraryNotice}
        loadingLibrary={loadingLibrary}
        uploadingLocal={uploadingLocal}
        removingAll={removingAll}
        deletingPath={deletingPath}
        onRefresh={refreshLibrary}
        onRemoveAll={handleRemoveAll}
        onDeleteFile={handleDeleteFile}
        onReorder={handleReorderLibrary}
        onUploadFiles={handleUploadFiles}
      />
    </div>
  );
}

function ImageLibraryPanel({
  library,
  libraryError,
  libraryNotice,
  loadingLibrary,
  uploadingLocal,
  removingAll,
  deletingPath,
  onRefresh,
  onRemoveAll,
  onDeleteFile,
  onReorder,
  onUploadFiles,
}: ImageLibraryPanelProps) {
  const [displayFiles, setDisplayFiles] = useState<LibraryFile[]>(library?.files ?? []);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [reorderingFolder, setReorderingFolder] = useState<string | null>(null);
  const [isRemoveAllDialogOpen, setIsRemoveAllDialogOpen] = useState(false);
  const [isUploadTargetActive, setIsUploadTargetActive] = useState(false);
  const sectionRefs = useRef<Map<string, HTMLUListElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDisplayFiles(library?.files ?? []);
  }, [library]);

  useEffect(() => {
    if (!isRemoveAllDialogOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !removingAll) {
        setIsRemoveAllDialogOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRemoveAllDialogOpen, removingAll]);

  useEffect(() => {
    if (!dragState) {
      return;
    }
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragState]);

  const librarySections = useMemo<LibrarySection[]>(() => buildLibrarySections(displayFiles), [displayFiles]);
  const removeAllCount = displayFiles.length;

  const handleSectionRef = useCallback((folderKey: string, node: HTMLUListElement | null) => {
    if (node) {
      sectionRefs.current.set(folderKey, node);
      return;
    }
    sectionRefs.current.delete(folderKey);
  }, []);

  const handleDragPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, file: LibraryFile) => {
      if (reorderingFolder !== null) {
        return;
      }
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      const folderKey = getFolderKeyFromRelativePath(file.relativePath);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragState({
        activePath: file.relativePath,
        folderKey,
        overIndex: null,
        pointerId: event.pointerId,
      });
    },
    [reorderingFolder]
  );

  const handleDragPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      const section = sectionRefs.current.get(dragState.folderKey);
      if (!section) {
        return;
      }
      const overIndex = getDropIndexFromList(section, event.clientY);
      if (dragState.overIndex === overIndex) {
        return;
      }
      setDragState((current) => {
        if (!current || current.pointerId !== event.pointerId) {
          return current;
        }
        return {
          ...current,
          overIndex,
        };
      });
    },
    [dragState]
  );

  const handleDragPointerUp = useCallback(
    async (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragState || dragState.pointerId !== event.pointerId || !library) {
        setDragState(null);
        return;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const section = sectionRefs.current.get(dragState.folderKey);
      const targetIndex = section
        ? getDropIndexFromList(section, event.clientY)
        : dragState.overIndex ?? 0;
      const reorder = reorderLibraryFiles(displayFiles, dragState.activePath, dragState.folderKey, targetIndex);
      const previousFiles = displayFiles;
      setDragState(null);
      if (!reorder) {
        return;
      }
      setDisplayFiles(reorder.files);
      setReorderingFolder(dragState.folderKey);
      try {
        await onReorder(dragState.folderKey, reorder.files);
      } catch {
        setDisplayFiles(previousFiles);
      } finally {
        setReorderingFolder(null);
      }
    },
    [displayFiles, dragState, library, onReorder]
  );

  const handleDragPointerCancel = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragState(null);
  }, [dragState]);

  const handleOpenRemoveAllDialog = useCallback(() => {
    if (reorderingFolder !== null || removingAll || removeAllCount === 0) {
      return;
    }
    setIsRemoveAllDialogOpen(true);
  }, [removeAllCount, removingAll, reorderingFolder]);

  const handleCloseRemoveAllDialog = useCallback(() => {
    if (removingAll) {
      return;
    }
    setIsRemoveAllDialogOpen(false);
  }, [removingAll]);

  const handleConfirmRemoveAll = useCallback(async () => {
    await onRemoveAll();
    setIsRemoveAllDialogOpen(false);
  }, [onRemoveAll]);

  const handleOpenFilePicker = useCallback(() => {
    if (uploadingLocal || reorderingFolder !== null) {
      return;
    }
    fileInputRef.current?.click();
  }, [reorderingFolder, uploadingLocal]);

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length === 0) {
        return;
      }
      await onUploadFiles(files);
    },
    [onUploadFiles]
  );

  const handleUploadDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (uploadingLocal || reorderingFolder !== null) {
        return;
      }
      setIsUploadTargetActive(true);
    },
    [reorderingFolder, uploadingLocal]
  );

  const handleUploadDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsUploadTargetActive(false);
  }, []);

  const handleUploadDrop = useCallback(
    async (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (uploadingLocal || reorderingFolder !== null) {
        setIsUploadTargetActive(false);
        return;
      }
      setIsUploadTargetActive(false);
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length === 0) {
        return;
      }
      await onUploadFiles(files);
    },
    [onUploadFiles, reorderingFolder, uploadingLocal]
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h4 className="text-base font-semibold text-zinc-900">Image library</h4>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex flex-col gap-2 md:flex-row">
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-black"
            disabled={loadingLibrary || uploadingLocal || reorderingFolder !== null}
          >
            {loadingLibrary ? "Refreshing…" : uploadingLocal ? "Uploading…" : reorderingFolder !== null ? "Saving order…" : "Refresh library"}
          </button>
          <button
            type="button"
            onClick={handleOpenRemoveAllDialog}
            disabled={removingAll || uploadingLocal || reorderingFolder !== null || !library || displayFiles.length === 0}
            className="rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:border-red-500 disabled:opacity-60"
          >
            {removingAll ? "Removing…" : "Remove all images"}
          </button>
        </div>
      </div>
      {libraryNotice && (
        <p className={`text-sm ${libraryNotice.tone === "success" ? "text-emerald-600" : "text-red-600"}`}>{libraryNotice.text}</p>
      )}
      {libraryError && <p className="text-sm text-red-600">{libraryError}</p>}
      {!library && <p className="text-sm text-zinc-500">Loading library…</p>}
      {library && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="space-y-1">
              <p className="font-semibold text-zinc-900">Saved images</p>
              <p className="text-xs text-zinc-500">Drag and drop to reorder images.</p>
            </div>
            <span className="text-xs text-zinc-500">
              {displayFiles.length} image{displayFiles.length === 1 ? "" : "s"}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(event) => void handleFileInputChange(event)}
          />
          <div
            onDragOver={handleUploadDragOver}
            onDragLeave={handleUploadDragLeave}
            onDrop={(event) => void handleUploadDrop(event)}
            className={`mb-4 rounded-xl border border-dashed p-4 transition ${
              isUploadTargetActive ? "border-black bg-zinc-50" : "border-zinc-300 bg-white"
            } ${uploadingLocal ? "opacity-70" : ""}`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-900">Add images from your device</p>
                <p className="text-xs text-zinc-500">
                  Drop files here or use the button. Files with the same name and size can still be added.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenFilePicker}
                disabled={uploadingLocal || reorderingFolder !== null}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-black disabled:opacity-60"
              >
                {uploadingLocal ? "Uploading…" : "Add from device"}
              </button>
            </div>
          </div>
          {displayFiles.length > 0 && <div className="space-y-4">
            {librarySections.map((section) => {
              const activeInsertIndex = dragState?.folderKey === section.folderKey ? dragState.overIndex : null;
              const sectionList = (
                <ul
                  key={section.folderKey || "__root__"}
                  ref={(node) => handleSectionRef(section.folderKey, node)}
                  className="flex flex-col gap-2"
                >
                  {section.files.map((file, index) => {
                    const isDragging = dragState?.activePath === file.relativePath;
                    const topInsertActive = activeInsertIndex === index;
                    return (
                      <li
                        key={file.relativePath}
                        data-library-item="true"
                        className={`relative flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white/80 p-3 text-sm transition sm:flex-row sm:items-center ${
                          isDragging ? "scale-[0.99] opacity-45" : ""
                        } ${reorderingFolder !== null ? "opacity-70" : ""}`}
                      >
                        {topInsertActive && (
                          <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 -top-2">
                            <div className="h-1.5 rounded-full bg-zinc-900 shadow-sm" />
                          </div>
                        )}
                        <div className="flex items-center gap-3 sm:flex-1">
                          <button
                            type="button"
                            aria-label={`Reorder ${file.name}`}
                            onPointerDown={(event) => handleDragPointerDown(event, file)}
                            onPointerMove={handleDragPointerMove}
                            onPointerUp={(event) => void handleDragPointerUp(event)}
                            onPointerCancel={handleDragPointerCancel}
                            disabled={uploadingLocal || reorderingFolder !== null}
                            className={`flex h-16 w-8 flex-shrink-0 touch-none items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 transition ${
                              isDragging ? "cursor-grabbing border-zinc-500 bg-zinc-100" : "cursor-grab hover:border-zinc-500"
                            } disabled:opacity-60`}
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 20 20"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            >
                              <path d="M4 6.5h12" />
                              <path d="M4 10h12" />
                              <path d="M4 13.5h12" />
                            </svg>
                          </button>
                          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-zinc-100">
                            <img
                              src={file.previewUrl}
                              alt={file.name}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className="truncate font-medium text-zinc-900">{file.name}</p>
                            <p className="text-xs text-zinc-500">
                              {formatFileSize(file.size)} · {file.relativePath}
                            </p>
                          </div>
                        </div>
                        <div className="sm:w-32">
                          <button
                            type="button"
                            onClick={() => void onDeleteFile(file.relativePath)}
                            disabled={uploadingLocal || deletingPath === file.relativePath || reorderingFolder !== null}
                            className="w-full rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:border-red-400 disabled:opacity-60"
                          >
                            {deletingPath === file.relativePath ? "Removing…" : "Remove"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {activeInsertIndex === section.files.length && (
                    <li aria-hidden="true" className="list-none px-2">
                      <div className="h-1.5 rounded-full bg-zinc-900 shadow-sm" />
                    </li>
                  )}
                </ul>
              );
              if (!section.folderKey) {
                return sectionList;
              }
              return (
                <div key={section.folderKey} className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="space-y-1">
                      <p className="font-semibold text-zinc-900">{section.label}</p>
                      <p className="text-xs text-zinc-500">{section.folderKey}</p>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {section.files.length} image{section.files.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {sectionList}
                </div>
              );
            })}
          </div>}
          {displayFiles.length === 0 && <p className="text-sm text-zinc-500">No images saved yet.</p>}
        </div>
      )}
      {isRemoveAllDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 px-4 backdrop-blur-sm"
          onClick={handleCloseRemoveAllDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-all-images-title"
            aria-describedby="remove-all-images-description"
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
                <path d="M6.5 6l1 13a2 2 0 0 0 2 1.85h5a2 2 0 0 0 2-1.85l1-13" />
                <path d="M10 10.5v6" />
                <path d="M14 10.5v6" />
              </svg>
            </div>
            <div className="space-y-2">
              <h5 id="remove-all-images-title" className="text-lg font-semibold text-zinc-950">
                Remove all images?
              </h5>
              <p id="remove-all-images-description" className="text-sm text-zinc-600">
                This will permanently delete all {removeAllCount} image{removeAllCount === 1 ? "" : "s"} from your
                library. This action cannot be undone.
              </p>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleCloseRemoveAllDialog}
                disabled={removingAll}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-500 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRemoveAll()}
                disabled={removingAll}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {removingAll ? "Removing…" : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function parseKeywords(value: string) {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function parseFileSizeInput(value: string) {
  if (!value || !value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.round(parsed);
}

function countImagesInKeywordGroups(groups: KeywordGroup[]) {
  return groups.reduce((sum, group) => sum + group.providers.reduce((inner, bucket) => inner + bucket.results.length, 0), 0);
}

function getProviderLabel(value: ProviderValue) {
  return PROVIDERS.find((provider) => provider.value === value)?.label ?? value;
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

function isSupportedLocalImageFile(file: File) {
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
    return true;
  }
  const lowerName = file.name.toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((extension) => lowerName.endsWith(extension));
}

function buildUploadNotice({
  addedCount,
  failedCount,
  ignoredCount,
}: {
  addedCount: number;
  failedCount: number;
  ignoredCount: number;
}) {
  const parts: string[] = [];
  if (addedCount > 0) {
    parts.push(`Added ${addedCount} image${addedCount === 1 ? "" : "s"}`);
  }
  if (ignoredCount > 0) {
    parts.push(`Ignored ${ignoredCount} non-image file${ignoredCount === 1 ? "" : "s"}`);
  }
  if (failedCount > 0) {
    parts.push(`${failedCount} upload${failedCount === 1 ? "" : "s"} failed`);
  }
  return parts.length > 0 ? `${parts.join(". ")}.` : "No files were added.";
}

function getFolderKeyFromRelativePath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/").trim();
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "";
  }
  segments.pop();
  return segments.join("/");
}

function buildLibrarySections(files: LibraryFile[]) {
  const grouped = new Map<string, LibraryFile[]>();
  for (const file of files) {
    const folderKey = getFolderKeyFromRelativePath(file.relativePath);
    const existing = grouped.get(folderKey);
    if (existing) {
      existing.push(file);
    } else {
      grouped.set(folderKey, [file]);
    }
  }
  return Array.from(grouped.entries()).map(([folderKey, sectionFiles]) => ({
    folderKey,
    label: folderKey || "Root folder",
    files: sectionFiles,
  }));
}

function getDropIndexFromList(list: HTMLElement, clientY: number) {
  const items = Array.from(list.querySelectorAll<HTMLElement>("[data-library-item='true']"));
  if (items.length === 0) {
    return 0;
  }
  for (let index = 0; index < items.length; index += 1) {
    const rect = items[index].getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (clientY < midpoint) {
      return index;
    }
  }
  return items.length;
}

function reorderLibraryFiles(files: LibraryFile[], sourcePath: string, folderKey: string, targetIndex: number) {
  if (folderKey !== getFolderKeyFromRelativePath(sourcePath)) {
    return null;
  }
  const folderFiles = files.filter((file) => getFolderKeyFromRelativePath(file.relativePath) === folderKey);
  const movingFile = folderFiles.find((file) => file.relativePath === sourcePath);
  if (!movingFile) {
    return null;
  }
  const sourceIndex = folderFiles.findIndex((file) => file.relativePath === sourcePath);
  const remainingFiles = folderFiles.filter((file) => file.relativePath !== sourcePath);
  const boundedTargetIndex = Math.max(0, Math.min(targetIndex, folderFiles.length));
  const insertIndex = boundedTargetIndex > sourceIndex ? boundedTargetIndex - 1 : boundedTargetIndex;
  const reorderedFolderFiles = [
    ...remainingFiles.slice(0, insertIndex),
    movingFile,
    ...remainingFiles.slice(insertIndex),
  ];
  if (folderFiles.every((file, index) => file.relativePath === reorderedFolderFiles[index]?.relativePath)) {
    return null;
  }
  let reorderedIndex = 0;
  const nextFiles = files.map((file) => {
    if (getFolderKeyFromRelativePath(file.relativePath) !== folderKey) {
      return file;
    }
    const nextFile = reorderedFolderFiles[reorderedIndex];
    reorderedIndex += 1;
    return nextFile;
  });
  return {
    files: nextFiles,
    folderKey,
    folderFiles: reorderedFolderFiles,
  };
}
