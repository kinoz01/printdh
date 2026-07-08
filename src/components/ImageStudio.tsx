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

import { resolvePageSettings, type PageSizePreset } from "@/lib/book/constants";
import { MAX_KEYWORDS } from "@/lib/image-search/constants";

const PROVIDERS = [
  {
    value: "scraping-win",
    label: "api.scraping.win",
    description: "Local DuckDuckGo scraper. No key required.",
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
] as const;

type ProviderValue = (typeof PROVIDERS)[number]["value"];

const DEFAULT_KEYS = {
  googleApiKey: "",
  googleCx: "",
  pixabayKey: "",
  pexelsKey: "",
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
  pageSize?: PageSizePreset;
}

type ResultsView = "keyword" | "provider";

interface ProviderStatus {
  provider: string;
  count: number;
  error?: string | null;
}

interface KeywordLibraryStatus {
  order: number;
  keyword: string;
  totalFetched: number;
  savedCount: number;
}

interface SaveImageResponse {
  savedAs: string;
  duplicate?: boolean;
  mappedUrls?: string[];
}

interface ImageLibraryPanelProps {
  cropPreviewAspectRatio: number;
  library: LibraryPayload | null;
  libraryError: string | null;
  libraryNotice: { text: string; tone: "success" | "error" } | null;
  loadingLibrary: boolean;
  uploadingLocal: boolean;
  downloadingRootZip: boolean;
  removingAll: boolean;
  deletingPath: string | null;
  onRefresh: () => Promise<void>;
  onDownloadRootZip: () => Promise<void>;
  onRemoveAll: () => Promise<boolean>;
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

type ResultsDialogAction = "clear-all" | "clear-fetched" | null;

const STORAGE_KEY = "image-provider-keys";
const SEARCH_CACHE_KEY = "image-search-cache-v1";
const MAX_RESULTS = 36;

export function ImageStudio({ defaultLimit = 10, pageSize = "square" }: ImageStudioProps) {
  const endOfImageryRef = useRef<HTMLDivElement | null>(null);
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
  const [downloadingRootZip, setDownloadingRootZip] = useState(false);
  const [minFileSizeInput, setMinFileSizeInput] = useState("");
  const [minPixelsInput, setMinPixelsInput] = useState("");
  const [resultsView, setResultsView] = useState<ResultsView>("keyword");
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [removingAll, setRemovingAll] = useState(false);
  const [serverProviderSupport, setServerProviderSupport] = useState<Record<ProviderValue, boolean> | null>(null);
  const [downloadingFetchedZip, setDownloadingFetchedZip] = useState(false);
  const [resultsDialogAction, setResultsDialogAction] = useState<ResultsDialogAction>(null);
  const [pendingResultsAction, setPendingResultsAction] = useState<Exclude<ResultsDialogAction, null> | null>(null);
  const cropPreviewAspectRatio = useMemo(() => {
    const { width, height } = resolvePageSettings(pageSize);
    return width / height;
  }, [pageSize]);

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
      const cached = window.localStorage.getItem(SEARCH_CACHE_KEY);
      if (!cached) {
        return;
      }
      const parsed = parseSearchCache(cached, defaultLimit);
      if (!parsed) {
        return;
      }
      setKeywordInput(parsed.keywordInput);
      setMaxResults(parsed.maxResults);
      setMinFileSizeInput(parsed.minFileSizeInput);
      setMinPixelsInput(parsed.minPixelsInput);
      setSelectedProviders(new Set(parsed.selectedProviders));
      setKeywordGroups(parsed.keywordGroups);
      setProviderStatus(parsed.providerStatus);
    } catch {
      // ignore corrupted payloads
    }
  }, [defaultLimit]);

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
    };
    const serverSupport: Record<ProviderValue, boolean> = {
      "scraping-win": Boolean(serverProviderSupport?.["scraping-win"]),
      google: Boolean(serverProviderSupport?.google),
      pixabay: Boolean(serverProviderSupport?.pixabay),
      pexels: Boolean(serverProviderSupport?.pexels),
    };
    const meta: Record<ProviderValue, { missingLocal: boolean; hasServer: boolean }> = {
      "scraping-win": { missingLocal: missingKeys["scraping-win"], hasServer: serverSupport["scraping-win"] },
      google: { missingLocal: missingKeys.google, hasServer: serverSupport.google },
      pixabay: { missingLocal: missingKeys.pixabay, hasServer: serverSupport.pixabay },
      pexels: { missingLocal: missingKeys.pexels, hasServer: serverSupport.pexels },
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
    try {
      const limit = Math.min(Math.max(maxResults, 3), MAX_RESULTS);
      const minSizeKb = parseFileSizeInput(minFileSizeInput);
      const minPixels = parsePixelInput(minPixelsInput);
      const selectedProviderValues = Array.from(selectedProviders);
      const response = await fetch("/api/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords,
          limit,
          minSizeKb,
          minPixels,
          providers: selectedProviderValues,
          keys: apiKeys,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Search failed");
      }
      const payload = await response.json();
      const groups = Array.isArray(payload.keywordGroups) ? (payload.keywordGroups as KeywordGroup[]) : [];
      const sources = Array.isArray(payload.sources) ? (payload.sources as ProviderStatus[]) : null;
      setKeywordGroups(groups);
      setProviderStatus(sources);
      persistSearchCache({
        keywordInput,
        maxResults: limit,
        minFileSizeInput,
        minPixelsInput,
        selectedProviders: selectedProviderValues,
        keywordGroups: groups,
        providerStatus: sources,
      });
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [apiKeys, keywordInput, keywords, maxResults, minFileSizeInput, minPixelsInput, selectedProviders]);

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
            fullsizeUrl: image.fullsizeUrl || undefined,
            previewUrl: image.previewUrl || undefined,
            title: image.title?.trim() || undefined,
          }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error || "Failed to save image");
        }
        const { savedAs, duplicate, mappedUrls } = (await response.json()) as SaveImageResponse;
        const sourceUrls = (mappedUrls?.length ? mappedUrls : [image.fullsizeUrl, image.previewUrl]).filter(
          (value): value is string => Boolean(value)
        );
        setLibrary((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            sourcesByUrl: {
              ...(current.sourcesByUrl ?? {}),
              ...Object.fromEntries(sourceUrls.map((url) => [url, savedAs])),
            },
          };
        });
        setSaveMessage({
          text: duplicate ? `Already saved as ${savedAs}` : `Saved to ${savedAs}`,
          tone: "success",
        });
        void refreshLibrary();
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
      return true;
    } catch (error) {
      setLibraryNotice({
        text: error instanceof Error ? error.message : "Failed to remove images",
        tone: "error",
      });
      return false;
    } finally {
      setRemovingAll(false);
    }
  }, [refreshLibrary]);

  const handleDownloadRootZip = useCallback(async () => {
    setDownloadingRootZip(true);
    setLibraryNotice(null);
    try {
      const response = await fetch("/api/images?download=zip", { cache: "no-store" });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Failed to download ZIP");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = getDownloadFileName(response.headers.get("content-disposition")) || "root-folder-images.zip";
      anchor.click();
      window.URL.revokeObjectURL(url);
      setLibraryNotice({ text: `Downloaded ${anchor.download}`, tone: "success" });
    } catch (error) {
      setLibraryNotice({
        text: error instanceof Error ? error.message : "Failed to download ZIP",
        tone: "error",
      });
    } finally {
      setDownloadingRootZip(false);
    }
  }, []);

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
  const keywordLibraryStatus = useMemo<KeywordLibraryStatus[]>(() => {
    const savedSources = new Set(Object.keys(library?.sourcesByUrl ?? {}));
    return keywordGroups.map((group, index) => {
      const results = group.providers.flatMap((bucket) => bucket.results);
      const savedCount = results.reduce((count, result) => {
        const sourceUrl = result.fullsizeUrl || result.previewUrl;
        return sourceUrl && savedSources.has(sourceUrl) ? count + 1 : count;
      }, 0);
      return {
        order: index + 1,
        keyword: group.keyword,
        totalFetched: results.length,
        savedCount,
      };
    });
  }, [keywordGroups, library?.sourcesByUrl]);
  const keywordsMissingLibraryImages = useMemo(
    () => keywordLibraryStatus.filter((entry) => entry.totalFetched > 0 && entry.savedCount === 0),
    [keywordLibraryStatus]
  );
  const isResultsActionBusy = downloadingFetchedZip || downloadingRootZip || pendingResultsAction !== null || removingAll;

  const persistCurrentSearchState = useCallback(
    (nextKeywordGroups: KeywordGroup[], nextProviderStatus: ProviderStatus[] | null) => {
      persistSearchCache({
        keywordInput,
        maxResults: clampResultLimit(maxResults, defaultLimit),
        minFileSizeInput,
        minPixelsInput,
        selectedProviders: Array.from(selectedProviders),
        keywordGroups: nextKeywordGroups,
        providerStatus: nextProviderStatus,
      });
    },
    [defaultLimit, keywordInput, maxResults, minFileSizeInput, minPixelsInput, selectedProviders]
  );

  const clearFetchedResults = useCallback(() => {
    setKeywordGroups([]);
    setProviderStatus(null);
    setSearchError(null);
    persistCurrentSearchState([], null);
  }, [persistCurrentSearchState]);

  const handleDownloadFetchedZip = useCallback(async () => {
    if (totalCandidates === 0) {
      return;
    }
    setDownloadingFetchedZip(true);
    setSaveMessage(null);
    try {
      const response = await fetch("/api/images/fetched-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordGroups }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Failed to build fetched images ZIP");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = getDownloadFileName(response.headers.get("content-disposition")) || "fetched-images-by-keyword.zip";
      anchor.click();
      window.URL.revokeObjectURL(url);
      setSaveMessage({
        text: `Downloaded ${totalCandidates} fetched image${totalCandidates === 1 ? "" : "s"} as ${anchor.download}`,
        tone: "success",
      });
    } catch (error) {
      setSaveMessage({
        text: error instanceof Error ? error.message : "Failed to download fetched images ZIP",
        tone: "error",
      });
    } finally {
      setDownloadingFetchedZip(false);
    }
  }, [keywordGroups, totalCandidates]);

  const handleClearFetchedResults = useCallback(async () => {
    const fetchedCount = totalCandidates;
    setPendingResultsAction("clear-fetched");
    setSaveMessage(null);
    try {
      clearFetchedResults();
      setSaveMessage({
        text: `Cleared ${fetchedCount} fetched image${fetchedCount === 1 ? "" : "s"} from the current results.`,
        tone: "success",
      });
    } finally {
      setPendingResultsAction(null);
      setResultsDialogAction(null);
    }
  }, [clearFetchedResults, totalCandidates]);

  const handleClearAllImages = useCallback(async () => {
    const fetchedCount = totalCandidates;
    const currentSavedImageCount = savedImageCount;
    setPendingResultsAction("clear-all");
    setSaveMessage(null);
    try {
      clearFetchedResults();
      const removedSavedImages = currentSavedImageCount > 0 ? await handleRemoveAll() : true;
      setSaveMessage({
        text: removedSavedImages
          ? `Cleared ${fetchedCount} fetched image${fetchedCount === 1 ? "" : "s"} and removed ${currentSavedImageCount} saved image${currentSavedImageCount === 1 ? "" : "s"}.`
          : `Cleared ${fetchedCount} fetched image${fetchedCount === 1 ? "" : "s"}, but saved images could not be removed.`,
        tone: removedSavedImages ? "success" : "error",
      });
    } finally {
      setPendingResultsAction(null);
      setResultsDialogAction(null);
    }
  }, [clearFetchedResults, handleRemoveAll, savedImageCount, totalCandidates]);

  useEffect(() => {
    if (!resultsDialogAction) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isResultsActionBusy) {
        setResultsDialogAction(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isResultsActionBusy, resultsDialogAction]);

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
        <div className="relative overflow-hidden bg-zinc-100" style={{ aspectRatio: cropPreviewAspectRatio }}>
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

  const resultsDialogConfig = resultsDialogAction
    ? {
        title: resultsDialogAction === "clear-all" ? "Delete fetched and saved images?" : "Delete fetched images?",
        description:
          resultsDialogAction === "clear-all"
            ? `This will clear ${totalCandidates} fetched image${totalCandidates === 1 ? "" : "s"} from the current results and permanently remove ${savedImageCount} saved image${savedImageCount === 1 ? "" : "s"} from your library. This action cannot be undone.`
            : `This will clear ${totalCandidates} fetched image${totalCandidates === 1 ? "" : "s"} from the current results. Saved images will stay in your library.`,
        confirmLabel: resultsDialogAction === "clear-all" ? "Delete everything" : "Delete fetched images",
      }
    : null;

  const handleScrollToImageryEnd = useCallback(() => {
    endOfImageryRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, []);

  return (
    <div className="space-y-8">
      <div className="fixed left-4 bottom-4 z-20 sm:left-6 sm:bottom-6">
        <button
          type="button"
          onClick={handleScrollToImageryEnd}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/95 px-4 py-2 text-xs font-semibold text-zinc-700 shadow-sm backdrop-blur transition hover:border-black hover:text-zinc-950"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 4.5v11" />
            <path d="m5.5 11 4.5 4.5 4.5-4.5" />
          </svg>
          Scroll To End
        </button>
      </div>
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
            const missingKeys = support.missingLocal && !support.hasServer;
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
                {support.missingLocal && !support.hasServer && (
                  <p className="text-xs font-medium text-amber-600">Add keys to enable</p>
                )}
                {support.missingLocal && support.hasServer && (
                  <p className="text-xs font-medium text-emerald-600">Server keys active</p>
                )}
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
            <span>
              {keywords.length} / {MAX_KEYWORDS} keywords ready
            </span>
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
        <div className="grid gap-3 md:grid-cols-3">
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
          <label className="text-sm font-medium text-zinc-700">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Min width & height (px)</span>
            <input
              type="number"
              min={0}
              max={10000}
              value={minPixelsInput}
              onChange={(event) => setMinPixelsInput(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="1000"
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
                    {status.error ? (
                      <span className="text-red-600">{label}: {status.error}</span>
                    ) : (
                      <>
                        <span>{label}</span>
                        <span className="text-zinc-500">{status.count} images</span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {totalCandidates > 0 && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-700">
                  Fetched {totalCandidates} candidates across {keywordGroups.length} keyword{keywordGroups.length === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-zinc-500">
                  Cards preview the centered page crop for the size selected in step 2.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="inline-flex w-fit rounded-lg border border-zinc-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setResultsView("keyword")}
                    aria-pressed={resultsView === "keyword"}
                    className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                      resultsView === "keyword" ? "bg-black text-white" : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    Grouped by keyword
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultsView("provider")}
                    aria-pressed={resultsView === "provider"}
                    className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                      resultsView === "provider" ? "bg-black text-white" : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    Grouped by provider
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDownloadFetchedZip()}
                    disabled={isResultsActionBusy || totalCandidates === 0}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-black disabled:opacity-60"
                  >
                    {downloadingFetchedZip ? "Preparing fetched ZIP…" : "Download fetched by keyword"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultsDialogAction("clear-all")}
                    disabled={isResultsActionBusy || (totalCandidates === 0 && savedImageCount === 0)}
                    className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:border-red-500 disabled:opacity-60"
                  >
                    {pendingResultsAction === "clear-all" ? "Deleting everything…" : "Delete fetched + saved"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadRootZip()}
                    disabled={isResultsActionBusy || downloadingRootZip || savedImageCount === 0}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-black disabled:opacity-60"
                  >
                    {downloadingRootZip ? "Preparing saved ZIP…" : "Download saved images"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultsDialogAction("clear-fetched")}
                    disabled={isResultsActionBusy || totalCandidates === 0}
                    className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:border-red-500 disabled:opacity-60"
                  >
                    {pendingResultsAction === "clear-fetched" ? "Deleting fetched…" : "Delete fetched only"}
                  </button>
                </div>
              </div>
            </div>
            {resultsView === "provider" ? (
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
                          {entry.error && <p className="text-xs text-red-600">Search error: {entry.error}</p>}
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
            ) : (
              <div className="space-y-3">
                <h5 className="text-sm font-semibold text-zinc-800">Grouped by keyword</h5>
                {keywordGroups.map((group, groupIndex) => {
                  const keywordTotal = group.providers.reduce((sum, bucket) => sum + bucket.results.length, 0);
                  return (
                    <div key={group.keyword} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="flex flex-col gap-1 text-sm">
                        <p className="font-semibold text-zinc-900">
                          {groupIndex + 1}. {group.keyword}
                        </p>
                        <p className="text-xs text-zinc-500">{keywordTotal} images</p>
                      </div>
                      {group.providers.map((bucket) => {
                        const providerLabel = getProviderLabel(bucket.provider);
                        return (
                          <div key={`${group.keyword}-${bucket.provider}`} className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between text-xs text-zinc-500">
                              <span className="font-medium text-zinc-800">{providerLabel}</span>
                              <span>{bucket.results.length} matches</span>
                            </div>
                            {bucket.error && <p className="text-xs text-red-600">{bucket.error}</p>}
                            {bucket.results.length > 0 ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                {bucket.results.map((result, index) =>
                                  renderResultCard(result, `${group.keyword}-${bucket.provider}-${index}`)
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-zinc-500">No images passed the filters.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {saveMessage && (
          <p className={`text-sm ${saveMessage.tone === "success" ? "text-emerald-600" : "text-red-600"}`}>
            {saveMessage.text}
          </p>
        )}
      </section>

      {keywordLibraryStatus.length > 0 && (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-amber-50/70 p-4">
          <div className="space-y-1">
            <h4 className="text-base font-semibold text-zinc-900">Keywords still missing a library image</h4>
            <p className="text-sm text-zinc-600">
              {keywordsMissingLibraryImages.length} of {keywordLibraryStatus.length} fetched keyword
              {keywordLibraryStatus.length === 1 ? "" : "s"} do not have any saved image in the library yet.
            </p>
          </div>
          {keywordsMissingLibraryImages.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {keywordsMissingLibraryImages.map((entry) => (
                <span
                  key={entry.keyword}
                  className="rounded-full border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800"
                >
                  {entry.order}. {entry.keyword} · {entry.totalFetched} fetched
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium text-emerald-700">
              Every fetched keyword already has at least one saved image in the library.
            </p>
          )}
        </section>
      )}
      <ImageLibraryPanel
        cropPreviewAspectRatio={cropPreviewAspectRatio}
        library={library}
        libraryError={libraryError}
        libraryNotice={libraryNotice}
        loadingLibrary={loadingLibrary}
        uploadingLocal={uploadingLocal}
        downloadingRootZip={downloadingRootZip}
        removingAll={removingAll}
        deletingPath={deletingPath}
        onRefresh={refreshLibrary}
        onDownloadRootZip={handleDownloadRootZip}
        onRemoveAll={handleRemoveAll}
        onDeleteFile={handleDeleteFile}
        onReorder={handleReorderLibrary}
        onUploadFiles={handleUploadFiles}
      />
      {resultsDialogConfig && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 px-4 backdrop-blur-sm"
          onClick={() => {
            if (!isResultsActionBusy) {
              setResultsDialogAction(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="results-images-dialog-title"
            aria-describedby="results-images-dialog-description"
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
              <h5 id="results-images-dialog-title" className="text-lg font-semibold text-zinc-950">
                {resultsDialogConfig.title}
              </h5>
              <p id="results-images-dialog-description" className="text-sm text-zinc-600">
                {resultsDialogConfig.description}
              </p>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setResultsDialogAction(null)}
                disabled={isResultsActionBusy}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-500 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void (resultsDialogAction === "clear-all" ? handleClearAllImages() : handleClearFetchedResults())}
                disabled={isResultsActionBusy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {pendingResultsAction === "clear-all"
                  ? "Deleting everything…"
                  : pendingResultsAction === "clear-fetched"
                    ? "Deleting fetched…"
                    : resultsDialogConfig.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      <div ref={endOfImageryRef} aria-hidden="true" />
    </div>
  );
}

function ImageLibraryPanel({
  cropPreviewAspectRatio,
  library,
  libraryError,
  libraryNotice,
  loadingLibrary,
  uploadingLocal,
  downloadingRootZip,
  removingAll,
  deletingPath,
  onRefresh,
  onDownloadRootZip,
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
  const fileOrderLookup = useMemo(
    () => new Map(displayFiles.map((file, index) => [file.relativePath, index + 1])),
    [displayFiles]
  );
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
            disabled={
              removingAll ||
              uploadingLocal ||
              downloadingRootZip ||
              reorderingFolder !== null ||
              !library ||
              displayFiles.length === 0
            }
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
                    const fileOrder = fileOrderLookup.get(file.relativePath);
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
                          <div
                            className="h-16 flex-shrink-0 overflow-hidden rounded-md bg-zinc-100"
                            style={{ aspectRatio: cropPreviewAspectRatio }}
                          >
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
                        <div className="flex items-center gap-2 sm:w-auto">
                          <span className="min-w-8 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                            {fileOrder ?? index + 1}
                          </span>
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
                return (
                  <div key="__root__" className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void onDownloadRootZip()}
                          disabled={uploadingLocal || downloadingRootZip || reorderingFolder !== null || section.files.length === 0}
                          className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-black disabled:opacity-60"
                        >
                          {downloadingRootZip ? "Preparing ZIP…" : "Download ZIP"}
                        </button>
                        <span className="text-xs text-zinc-500">
                          {section.files.length} image{section.files.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    {sectionList}
                  </div>
                );
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
    .slice(0, MAX_KEYWORDS);
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

function parsePixelInput(value: string) {
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

function parseSearchCache(raw: string, defaultLimit: number) {
  const parsed = JSON.parse(raw) as Partial<{
    keywordInput: unknown;
    maxResults: unknown;
    minFileSizeInput: unknown;
    minPixelsInput: unknown;
    selectedProviders: unknown;
    keywordGroups: unknown;
    providerStatus: unknown;
  }>;

  if (!Array.isArray(parsed.keywordGroups)) {
    return null;
  }

  return {
    keywordInput: typeof parsed.keywordInput === "string" ? parsed.keywordInput : "",
    maxResults: clampResultLimit(parsed.maxResults, defaultLimit),
    minFileSizeInput: typeof parsed.minFileSizeInput === "string" ? parsed.minFileSizeInput : "",
    minPixelsInput: typeof parsed.minPixelsInput === "string" ? parsed.minPixelsInput : "",
    selectedProviders: normalizeSelectedProviders(parsed.selectedProviders),
    keywordGroups: parsed.keywordGroups as KeywordGroup[],
    providerStatus: Array.isArray(parsed.providerStatus) ? (parsed.providerStatus as ProviderStatus[]) : null,
  };
}

function persistSearchCache(payload: {
  keywordInput: string;
  maxResults: number;
  minFileSizeInput: string;
  minPixelsInput: string;
  selectedProviders: ProviderValue[];
  keywordGroups: KeywordGroup[];
  providerStatus: ProviderStatus[] | null;
}) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota issues
  }
}

function clampResultLimit(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(MAX_RESULTS, Math.max(3, Math.round(value)));
}

function normalizeSelectedProviders(value: unknown) {
  const providers = new Set<ProviderValue>(["scraping-win"]);
  if (!Array.isArray(value)) {
    return Array.from(providers);
  }
  for (const item of value) {
    if (isProviderValue(item)) {
      providers.add(item);
    }
  }
  return Array.from(providers);
}

function isProviderValue(value: unknown): value is ProviderValue {
  return typeof value === "string" && PROVIDERS.some((provider) => provider.value === value);
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
