import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MAX_KEYWORDS } from "@/lib/image-search/constants";

const PROVIDERS = ["scraping-win", "google", "pixabay", "pexels", "brave"] as const;
type Provider = (typeof PROVIDERS)[number];

const requestSchema = z.object({
  query: z.string().optional(),
  keywords: z
    .array(z.string().min(1))
    .min(1, "Provide at least one keyword")
    .max(MAX_KEYWORDS, `Limit searches to ${MAX_KEYWORDS} keywords`)
    .optional(),
  limit: z.number().int().min(3).max(60).optional(),
  minSizeKb: z.number().int().min(0).max(200000).optional(),
  minPixels: z.number().int().min(0).max(10000).optional(),
  providers: z.array(z.enum(PROVIDERS)).min(1),
  keys: z
    .object({
      googleApiKey: z.string().optional(),
      googleCx: z.string().optional(),
      pixabayKey: z.string().optional(),
      pexelsKey: z.string().optional(),
      braveKey: z.string().optional(),
    })
    .optional(),
});

interface RemoteImageResult {
  id: string;
  previewUrl: string;
  fullsizeUrl: string;
  width?: number;
  height?: number;
  fileSize?: number;
  source: string;
  title?: string;
}

type ProviderKeys = {
  googleApiKey?: string;
  googleCx?: string;
  pixabayKey?: string;
  pexelsKey?: string;
  braveKey?: string;
};

interface SearchOptions {
  limit: number;
  minFileSizeBytes?: number;
  minPixels?: number;
  keys: ProviderKeys;
  uniqueProviders: Provider[];
  activeProviders: Provider[];
  keywords: string[];
}

interface ProviderBucket {
  provider: Provider;
  results: GroupedImageResult[];
  error: string | null;
}

interface KeywordGroup {
  keyword: string;
  providers: ProviderBucket[];
}

interface GroupedImageResult extends RemoteImageResult {
  provider: Provider;
  keyword: string;
}

interface ScrapingWinResult {
  url?: string;
  thumb?: string;
  image?: string;
  width?: number;
  height?: number;
  title?: string;
}

interface PixabayHit {
  id: number | string;
  previewURL: string;
  largeImageURL?: string;
  webformatURL?: string;
  imageSize?: number;
  imageWidth?: number;
  imageHeight?: number;
  tags?: string;
}

interface PexelsPhoto {
  id: number | string;
  width?: number;
  height?: number;
  alt?: string;
  src?: {
    original?: string;
    large2x?: string;
    medium?: string;
    small?: string;
  };
}

interface BraveResult {
  id?: string;
  thumbnail?: { src?: string } | string;
  url?: string;
  original?: string;
  properties?: { original_width?: number; original_height?: number; image_size?: number; content_length?: number };
  width?: number;
  height?: number;
  source?: string;
  title?: string;
  page_title?: string;
}

const SCRAPING_TOKEN = "DGir3Y/3jio3iwDOGjEjqQMv1OHC/DTasyq+FP1+mW0";
const DEFAULT_LIMIT = 18;
const FILTER_FETCH_MULTIPLIER = 3;
const SCRAPING_WIN_MAX_RESULTS = 35;
const ENV_PATH = path.resolve(process.cwd(), ".env");
let envCache: Record<string, string> | null = null;

export async function GET() {
  const defaults = getServerProviderKeys();
  return NextResponse.json({
    providers: {
      "scraping-win": true,
      google: Boolean(defaults.googleApiKey && defaults.googleCx),
      pixabay: Boolean(defaults.pixabayKey),
      pexels: Boolean(defaults.pexelsKey),
      brave: Boolean(defaults.braveKey),
    },
    defaults,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = requestSchema.parse(body);
    const options = buildSearchOptions(payload);
    if (!options.keywords.length) {
      return NextResponse.json({ error: "Provide at least one keyword" }, { status: 400 });
    }
    if (!options.activeProviders.length) {
      return NextResponse.json({ error: "No providers enabled. Check your API keys." }, { status: 400 });
    }

    const result = await runSearch(options);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildSearchOptions(payload: z.infer<typeof requestSchema>): SearchOptions {
  const limit = payload.limit ?? DEFAULT_LIMIT;
  const minSizeKb = typeof payload.minSizeKb === "number" ? payload.minSizeKb : undefined;
  const minFileSizeBytes = typeof minSizeKb === "number" && minSizeKb > 0 ? minSizeKb * 1024 : undefined;
  const minPixels = typeof payload.minPixels === "number" && payload.minPixels > 0 ? payload.minPixels : undefined;
  const envDefaults = getServerProviderKeys();
  const keys: ProviderKeys = {
    googleApiKey: payload.keys?.googleApiKey || envDefaults.googleApiKey,
    googleCx: payload.keys?.googleCx || envDefaults.googleCx,
    pixabayKey: payload.keys?.pixabayKey || envDefaults.pixabayKey,
    pexelsKey: payload.keys?.pexelsKey || envDefaults.pexelsKey,
    braveKey: payload.keys?.braveKey || envDefaults.braveKey,
  };
  const uniqueProviders = Array.from(new Set(payload.providers)) as Provider[];
  const activeProviders = uniqueProviders.filter((provider) => isProviderConfigured(provider, keys));
  return {
    limit,
    minFileSizeBytes,
    minPixels,
    keys,
    uniqueProviders,
    activeProviders,
    keywords: buildKeywordList(payload.keywords, payload.query),
  };
}

async function runSearch(options: SearchOptions) {
  const providerCounts = new Map<Provider, number>();
  const providerErrors = new Map<Provider, string | null>();
  for (const provider of options.uniqueProviders) {
    providerCounts.set(provider, 0);
    providerErrors.set(provider, null);
  }

  const keywordGroups: KeywordGroup[] = [];

  for (const keyword of options.keywords) {
    const providers = await Promise.all(
      options.activeProviders.map((provider) =>
        searchProviderForKeyword(provider, keyword, options.limit, options.minFileSizeBytes, options.minPixels, options.keys)
      )
    );

    for (const bucket of providers) {
      providerCounts.set(bucket.provider, (providerCounts.get(bucket.provider) ?? 0) + bucket.results.length);
      if (bucket.error && !providerErrors.get(bucket.provider)) {
        providerErrors.set(bucket.provider, bucket.error);
      }
    }

    keywordGroups.push({ keyword, providers });
  }

  const flattened = keywordGroups.flatMap((group) => group.providers.flatMap((bucket) => bucket.results));
  const sources = options.uniqueProviders.map((provider) => ({
    provider,
    count: providerCounts.get(provider) ?? 0,
    error: providerErrors.get(provider) ?? null,
  }));

  return { images: flattened, keywordGroups, sources };
}

async function searchProviderForKeyword(
  provider: Provider,
  keyword: string,
  limit: number,
  minFileSizeBytes: number | undefined,
  minPixels: number | undefined,
  keys: ProviderKeys
): Promise<ProviderBucket> {
  try {
    const providerMinPixels = provider === "scraping-win" ? undefined : minPixels;
    const providerLimit = shouldOverfetchForFilters(providerMinPixels) ? limit * FILTER_FETCH_MULTIPLIER : limit;
    const promise = buildProviderPromise(provider, keyword, providerLimit, keys);
    if (!promise) {
      throw new Error("Provider not configured");
    }
    const rawResults = await promise;
    const deduped = dedupeResults(rawResults);
    const withSizes = await fillMissingFileSizes(deduped);
    const filtered = applyDimensionFilter(applyFileSizeFilter(withSizes, minFileSizeBytes), providerMinPixels);
    const limited = filtered.slice(0, limit);
    return {
      provider,
      results: limited.map((image) => ({
        ...image,
        provider,
        keyword,
      })),
      error: null,
    };
  } catch (error) {
    return {
      provider,
      results: [],
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

function buildKeywordList(keywords?: string[], fallbackQuery?: string | null) {
  const list: string[] = [];
  const raw = keywords?.length ? keywords : fallbackQuery ? [fallbackQuery] : [];
  for (const entry of raw) {
    const trimmed = entry?.trim();
    if (trimmed) {
      list.push(trimmed);
    }
  }
  return list.slice(0, MAX_KEYWORDS);
}

function isProviderConfigured(provider: Provider, keys: ProviderKeys) {
  switch (provider) {
    case "scraping-win":
      return true;
    case "google":
      return Boolean(keys.googleApiKey && keys.googleCx);
    case "pixabay":
      return Boolean(keys.pixabayKey);
    case "pexels":
      return Boolean(keys.pexelsKey);
    case "brave":
      return Boolean(keys.braveKey);
    default:
      return false;
  }
}

function buildProviderPromise(provider: Provider, keyword: string, limit: number, keys: ProviderKeys) {
  switch (provider) {
    case "scraping-win":
      return searchScrapingWin(keyword, limit);
    case "google":
      if (keys.googleApiKey && keys.googleCx) {
        return searchGoogleImages(keyword, limit, keys.googleApiKey, keys.googleCx);
      }
      return null;
    case "pixabay":
      if (keys.pixabayKey) {
        return searchPixabay(keyword, limit, keys.pixabayKey);
      }
      return null;
    case "pexels":
      if (keys.pexelsKey) {
        return searchPexels(keyword, limit, keys.pexelsKey);
      }
      return null;
    case "brave":
      if (keys.braveKey) {
        return searchBrave(keyword, limit, keys.braveKey);
      }
      return null;
    default:
      return null;
  }
}

function dedupeResults(images: RemoteImageResult[]) {
  const seen = new Set<string>();
  const unique: RemoteImageResult[] = [];
  for (const image of images) {
    const key = image.fullsizeUrl || image.previewUrl;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(image);
  }
  return unique;
}

const FILE_SIZE_FETCH_CONCURRENCY = 5;
const FILE_SIZE_TIMEOUT_MS = 5000;

async function fillMissingFileSizes(images: RemoteImageResult[]) {
  const targets: RemoteImageResult[] = [];
  for (const image of images) {
    if (typeof image.fileSize === "number") {
      continue;
    }
    if (!image.fullsizeUrl) {
      continue;
    }
    targets.push(image);
  }
  await runLimitedConcurrency(targets, FILE_SIZE_FETCH_CONCURRENCY, async (image) => {
    if (typeof image.fileSize === "number") {
      return;
    }
    const resolvedSize = await fetchFileSize(image.fullsizeUrl!, FILE_SIZE_TIMEOUT_MS);
    if (typeof resolvedSize === "number") {
      image.fileSize = resolvedSize;
    }
  });
  return images;
}

function applyFileSizeFilter(images: RemoteImageResult[], minBytes?: number) {
  if (!minBytes) {
    return images;
  }
  return images.filter((image) => typeof image.fileSize === "number" && image.fileSize >= minBytes);
}

function applyDimensionFilter(images: RemoteImageResult[], minPixels?: number) {
  if (!minPixels) {
    return images;
  }
  return images.filter(
    (image) =>
      typeof image.width === "number" &&
      typeof image.height === "number" &&
      image.width >= minPixels &&
      image.height >= minPixels
  );
}

function shouldOverfetchForFilters(minPixels?: number) {
  return typeof minPixels === "number" && minPixels > 0;
}

async function fetchFileSize(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      return undefined;
    }
    const header = response.headers.get("content-length");
    if (!header) {
      return undefined;
    }
    const parsed = Number(header);
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function runLimitedConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  if (items.length === 0) {
    return;
  }
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        break;
      }
      try {
        await worker(next);
      } catch {
        // ignore individual HEAD failures
      }
    }
  });
  await Promise.all(runners);
}

async function searchScrapingWin(query: string, limit: number): Promise<RemoteImageResult[]> {
  // scraping.win starts returning 502 once max_results exceeds 35.
  const cappedLimit = Math.min(Math.max(limit, 1), SCRAPING_WIN_MAX_RESULTS);
  const response = await fetch("https://api.scraping.win/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SCRAPING_TOKEN}`,
    },
    body: JSON.stringify({ keywords: query, max_results: cappedLimit }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await readResponseError(response, "Image search failed");
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  const payload = await response.json();
  const results = Array.isArray(payload.results) ? payload.results : [];
  return results.slice(0, cappedLimit).flatMap((item: ScrapingWinResult, index: number) => {
    const bestImage = item.image || item.thumb;
    if (!bestImage) {
      return [];
    }
    return [
      {
        id: `scraping-${item.url ?? index}`,
        previewUrl: bestImage,
        fullsizeUrl: bestImage,
        width: item.width,
        height: item.height,
        source: "scraping.win",
        title: item.title,
      },
    ];
  });
}

async function readResponseError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      if (typeof payload?.error === "string" && payload.error.trim()) {
        return payload.error.trim();
      }
      if (typeof payload?.message === "string" && payload.message.trim()) {
        return payload.message.trim();
      }
    }
    const text = await response.text();
    return text.trim() ? text.trim().slice(0, 200) : fallback;
  } catch {
    return fallback;
  }
}

async function searchGoogleImages(query: string, limit: number, apiKey: string, cx: string): Promise<RemoteImageResult[]> {
  const results: RemoteImageResult[] = [];
  let start = 1;
  while (results.length < limit && start <= 90) {
    const batchSize = Math.min(10, limit - results.length);
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", cx);
    url.searchParams.set("q", query);
    url.searchParams.set("searchType", "image");
    url.searchParams.set("num", batchSize.toString());
    url.searchParams.set("start", start.toString());
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      break;
    }
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const [index, item] of items.entries()) {
      if (!item.link) {
        continue;
      }
      const byteSize = Number(item.image?.byteSize);
      const fullsizeUrl = item.link;
      const previewUrl = fullsizeUrl || item.image?.thumbnailLink;
      results.push({
        id: `google-${start}-${index}`,
        previewUrl: previewUrl || fullsizeUrl,
        fullsizeUrl: fullsizeUrl,
        width: Number(item.image?.width) || undefined,
        height: Number(item.image?.height) || undefined,
        fileSize: Number.isFinite(byteSize) ? byteSize : undefined,
        source: item.displayLink || "Google",
        title: item.title,
      });
      if (results.length >= limit) {
        break;
      }
    }
    if (items.length < batchSize) {
      break;
    }
    start += batchSize;
  }
  return results;
}

async function searchPixabay(query: string, limit: number, apiKey: string): Promise<RemoteImageResult[]> {
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("per_page", Math.min(limit, 200).toString());
  url.searchParams.set("safesearch", "true");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Pixabay search failed");
  }
  const payload = await response.json();
  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  return hits.slice(0, limit).map((hit: PixabayHit) => {
    const fullsizeUrl = hit.largeImageURL || hit.webformatURL || hit.previewURL;
    return {
      id: `pixabay-${hit.id}`,
      previewUrl: fullsizeUrl || hit.previewURL,
      fullsizeUrl: fullsizeUrl || hit.previewURL,
      width: hit.imageWidth,
      height: hit.imageHeight,
      fileSize: typeof hit.imageSize === "number" ? hit.imageSize : undefined,
      source: "Pixabay",
      title: hit.tags,
    };
  });
}

async function searchPexels(query: string, limit: number, apiKey: string): Promise<RemoteImageResult[]> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", Math.min(limit, 80).toString());
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: apiKey,
    },
  });
  if (!response.ok) {
    throw new Error("Pexels search failed");
  }
  const payload = await response.json();
  const photos = Array.isArray(payload.photos) ? payload.photos : [];
  return photos.slice(0, limit).flatMap((photo: PexelsPhoto) => {
    const fullsizeUrl = photo.src?.original || photo.src?.large2x || photo.src?.medium || photo.src?.small;
    if (!fullsizeUrl) {
      return [];
    }
    const previewUrl = fullsizeUrl || photo.src?.medium || photo.src?.small;
    return [
      {
        id: `pexels-${photo.id}`,
        previewUrl: previewUrl ?? fullsizeUrl,
        fullsizeUrl,
        width: photo.width,
        height: photo.height,
        source: "Pexels",
        title: photo.alt,
      },
    ];
  });
}

async function searchBrave(query: string, limit: number, apiKey: string): Promise<RemoteImageResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", Math.min(limit, 20).toString());
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "X-Subscription-Token": apiKey,
    },
  });
  if (!response.ok) {
    throw new Error("Brave search failed");
  }
  const payload = await response.json();
  const results = Array.isArray(payload.results)
    ? payload.results
    : Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.data)
    ? payload.data
    : [];
  return results.slice(0, limit).flatMap((item: BraveResult, index: number) => {
    const thumb = typeof item.thumbnail === "string" ? item.thumbnail : item.thumbnail?.src;
    const fullsizeUrl = item.original || item.url || thumb;
    if (!fullsizeUrl) {
      return [];
    }
    const previewUrl = fullsizeUrl || thumb;
    const rawSize = Number(item.properties?.image_size ?? item.properties?.content_length);
    return [
      {
        id: `brave-${item.id ?? index}`,
        previewUrl,
        fullsizeUrl,
        width: item.properties?.original_width || item.width,
        height: item.properties?.original_height || item.height,
        fileSize: Number.isFinite(rawSize) ? rawSize : undefined,
        source: item.source ?? "Brave",
        title: item.title || item.page_title,
      },
    ];
  });
}

function getServerProviderKeys(): ProviderKeys {
  return {
    googleApiKey: getSecretEnvValue("GOOGLE_CSE_KEY"),
    googleCx: getSecretEnvValue("GOOGLE_CSE_CX"),
    pixabayKey: getSecretEnvValue("PIXABAY_API_KEY"),
    pexelsKey: getSecretEnvValue("PEXELS_API_KEY"),
    braveKey: getSecretEnvValue("BRAVE_API_KEY"),
  };
}

function getSecretEnvValue(name: string) {
  if (process.env[name]) {
    return process.env[name];
  }
  const localEnv = readLocalEnv();
  return localEnv[name];
}

function readLocalEnv() {
  if (envCache) {
    return envCache;
  }
  envCache = {};
  try {
    const raw = fs.readFileSync(ENV_PATH, "utf-8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) {
        continue;
      }
      const [, key, valueRaw] = match;
      let value = valueRaw.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      envCache[key] = value;
    }
  } catch {
    // ignore missing env file
  }
  return envCache;
}
