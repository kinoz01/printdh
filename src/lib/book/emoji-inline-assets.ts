import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const TWEMOJI_BASE_URLS = [
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg",
  "https://raw.githubusercontent.com/twitter/twemoji/v14.0.2/assets/svg",
  "https://raw.githubusercontent.com/twitter/twemoji/master/assets/svg",
] as const;
const FONTCONFIG_CACHE_DIR = path.resolve(process.cwd(), ".fontconfig-cache");
const EMOJI_CLUSTER_PATTERN = /[\p{Extended_Pictographic}\uFE0F\u200D]/u;
const FLAG_CODE_POINT_MIN = 0x1f1e6;
const FLAG_CODE_POINT_MAX = 0x1f1ff;

export interface InlineImageAsset {
  key: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: "image/png";
}

const emojiAssetCache = new Map<string, Promise<InlineImageAsset | null>>();
let fontconfigReady: Promise<void> | null = null;

export function shouldResolveInlineEmoji(grapheme: string) {
  return isFlagEmoji(grapheme) || EMOJI_CLUSTER_PATTERN.test(grapheme);
}

export async function resolveEmojiInlineAsset(grapheme: string): Promise<InlineImageAsset | null> {
  const cacheKey = grapheme.normalize("NFC");
  const cached = emojiAssetCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const pending = createEmojiInlineAsset(cacheKey);
  emojiAssetCache.set(cacheKey, pending);
  return pending;
}

async function createEmojiInlineAsset(grapheme: string): Promise<InlineImageAsset | null> {
  const twemoji = await loadTwemojiAsset(grapheme);
  if (twemoji) {
    return twemoji;
  }
  if (isFlagEmoji(grapheme)) {
    return buildCountryCodeBadge(grapheme);
  }
  return buildMonochromeEmojiFallback(grapheme);
}

async function loadTwemojiAsset(grapheme: string): Promise<InlineImageAsset | null> {
  const candidates = buildTwemojiCandidates(grapheme);
  for (const candidate of candidates) {
    for (const baseUrl of TWEMOJI_BASE_URLS) {
      try {
        const response = await fetch(`${baseUrl}/${candidate}.svg`, { cache: "force-cache" });
        if (!response.ok) {
          continue;
        }
        const svgBytes = new Uint8Array(await response.arrayBuffer());
        const pngBytes = await sharp(svgBytes).resize({ height: 160, fit: "inside" }).png().toBuffer();
        const metadata = await sharp(pngBytes).metadata();
        const width = metadata.width ?? 160;
        const height = metadata.height ?? 160;
        return {
          key: `twemoji:${candidate}`,
          bytes: new Uint8Array(pngBytes),
          width,
          height,
          mimeType: "image/png",
        };
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function buildCountryCodeBadge(grapheme: string): Promise<InlineImageAsset | null> {
  const countryCode = flagEmojiToCountryCode(grapheme);
  if (!countryCode) {
    return null;
  }
  await ensureFontconfigCache();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="184" height="120" viewBox="0 0 184 120">
  <rect x="4" y="10" width="176" height="100" rx="22" fill="#ffffff" stroke="#0f172a" stroke-width="8"/>
  <text x="92" y="77" text-anchor="middle" font-size="52" font-family="DejaVu Sans" font-weight="700" fill="#0f172a">${escapeXml(
    countryCode
  )}</text>
</svg>`;
  const pngBytes = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    key: `flag-badge:${countryCode}`,
    bytes: new Uint8Array(pngBytes),
    width: 184,
    height: 120,
    mimeType: "image/png",
  };
}

async function buildMonochromeEmojiFallback(grapheme: string): Promise<InlineImageAsset | null> {
  await ensureFontconfigCache();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <rect width="160" height="160" fill="transparent"/>
  <text x="80" y="114" text-anchor="middle" font-size="112" font-family="DejaVu Sans" fill="#000000">${escapeXml(
    grapheme
  )}</text>
</svg>`;
  const pngBytes = await sharp(Buffer.from(svg)).png().toBuffer();
  const metadata = await sharp(pngBytes).metadata();
  return {
    key: `emoji-fallback:${grapheme}`,
    bytes: new Uint8Array(pngBytes),
    width: metadata.width ?? 160,
    height: metadata.height ?? 160,
    mimeType: "image/png",
  };
}

function buildTwemojiCandidates(grapheme: string) {
  const normalized = grapheme.normalize("NFC");
  const original = codePointsToTwemojiId(normalized);
  const stripped = codePointsToTwemojiId(stripVariationSelectors(normalized));
  return [...new Set([original, stripped].filter(Boolean))];
}

function codePointsToTwemojiId(value: string) {
  return Array.from(value)
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter((codePoint): codePoint is string => Boolean(codePoint))
    .join("-");
}

function stripVariationSelectors(value: string) {
  return Array.from(value)
    .filter((char) => char.codePointAt(0) !== 0xfe0f)
    .join("");
}

function isFlagEmoji(value: string) {
  const codePoints = Array.from(value, (char) => char.codePointAt(0) ?? 0);
  return (
    codePoints.length === 2 &&
    codePoints.every((codePoint) => codePoint >= FLAG_CODE_POINT_MIN && codePoint <= FLAG_CODE_POINT_MAX)
  );
}

function flagEmojiToCountryCode(value: string) {
  if (!isFlagEmoji(value)) {
    return "";
  }
  return Array.from(value, (char) => {
    const codePoint = char.codePointAt(0) ?? FLAG_CODE_POINT_MIN;
    return String.fromCharCode(65 + codePoint - FLAG_CODE_POINT_MIN);
  }).join("");
}

async function ensureFontconfigCache() {
  if (!fontconfigReady) {
    fontconfigReady = fs
      .mkdir(FONTCONFIG_CACHE_DIR, { recursive: true })
      .then(() => {
        process.env.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || FONTCONFIG_CACHE_DIR;
      })
      .catch(() => undefined);
  }
  await fontconfigReady;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
