import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MAX_KEYWORDS } from "@/lib/image-search/constants";

const PROVIDERS = ["scraping-win", "google", "pixabay", "pexels"] as const;
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

interface DdgImageResult {
  title?: string;
  image?: string;
  url?: string;
  width?: number;
  height?: number;
}

interface DdgImagePayload {
  results?: DdgImageResult[];
  next?: string;
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
    },
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

const DDG_BASE = "https://duckduckgo.com";
const DDG_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};
const DDG_VQD_RE = /vqd=(?:"|')?([\d-]+)/;

async function withRetries<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        const backoffMs = 150 * (attempt + 1) + Math.floor(Math.random() * 150);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
  throw lastError;
}

async function fetchDdgVqdToken(query: string): Promise<string> {
  const response = await fetch(`${DDG_BASE}/?q=${encodeURIComponent(query)}`, {
    headers: DDG_HEADERS,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo token request failed with status ${response.status}`);
  }
  const html = await response.text();
  const match = DDG_VQD_RE.exec(html);
  if (!match) {
    throw new Error("Unable to obtain DuckDuckGo search token");
  }
  return match[1];
}

function parseDdgNextOffset(next: string | undefined): number | null {
  if (!next) {
    return null;
  }
  const queryIndex = next.indexOf("?");
  if (queryIndex === -1) {
    return null;
  }
  const params = new URLSearchParams(next.slice(queryIndex + 1));
  const raw = params.get("s");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchDdgBatch(
  query: string,
  vqd: string,
  offset: number,
): Promise<{ results: DdgImageResult[]; nextOffset: number | null }> {
  const params = new URLSearchParams({
    l: "us-en",
    o: "json",
    q: query,
    vqd,
    f: "size:Large",
    p: "-1",
  });
  if (offset > 0) {
    params.set("s", String(offset));
  }
  const response = await fetch(`${DDG_BASE}/i.js?${params.toString()}`, {
    headers: { ...DDG_HEADERS, Referer: `${DDG_BASE}/` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo image search failed with status ${response.status}`);
  }
  let payload: DdgImagePayload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("DuckDuckGo returned an unexpected response");
  }
  return { results: payload.results ?? [], nextOffset: parseDdgNextOffset(payload.next) };
}

async function searchScrapingWin(query: string, limit: number): Promise<RemoteImageResult[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), SCRAPING_WIN_MAX_RESULTS);
  const results: RemoteImageResult[] = [];
  const seen = new Set<string>();

  let vqd = await withRetries(() => fetchDdgVqdToken(query));
  let offset = 0;

  while (results.length < cappedLimit) {
    const currentOffset = offset;
    const batch = await withRetries(async () => {
      try {
        return await fetchDdgBatch(query, vqd, currentOffset);
      } catch (error) {
        vqd = await fetchDdgVqdToken(query);
        throw error;
      }
    });

    if (!batch.results.length) {
      break;
    }

    for (const item of batch.results) {
      const bestImage = item.image;
      if (!bestImage || seen.has(bestImage)) {
        continue;
      }
      seen.add(bestImage);
      results.push({
        id: `scraping-${item.url ?? bestImage}`,
        previewUrl: bestImage,
        fullsizeUrl: bestImage,
        width: item.width,
        height: item.height,
        source: "duckduckgo",
        title: item.title,
      });
      if (results.length >= cappedLimit) {
        break;
      }
    }

    if (batch.nextOffset === null) {
      break;
    }
    offset = batch.nextOffset;
  }

  return results;
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

function getServerProviderKeys(): ProviderKeys {
  return {
    googleApiKey: getSecretEnvValue("GOOGLE_CSE_KEY"),
    googleCx: getSecretEnvValue("GOOGLE_CSE_CX"),
    pixabayKey: getSecretEnvValue("PIXABAY_API_KEY"),
    pexelsKey: getSecretEnvValue("PEXELS_API_KEY"),
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
