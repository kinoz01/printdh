import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  addNicheEntry,
  deleteNicheEntry,
  isNicheSection,
  readNicheEntries,
  updateNicheEntry,
  type NicheEntry,
  type NichePreview,
  type NicheSection,
} from "@/lib/niches-store";

const PAGE_SIZE = 50;
const LINK_SECTIONS = new Set<NicheSection>(["books", "authors"]);
const COVER_MAX_BYTES = 5_000_000;
const COVER_DATA_MAX_CHARS = 7_000_000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section");
    if (!isNicheSection(section)) {
      return json({ error: "Invalid section" }, 400);
    }

    const query = (searchParams.get("q") ?? "").trim().toLowerCase();
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const entries = (await readNicheEntries())
      .filter((entry) => entry.section === section)
      .filter((entry) => matchesQuery(entry, query))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

    const total = entries.length;
    const start = (page - 1) * PAGE_SIZE;
    return json({
      entries: entries.slice(start, start + PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      total,
      hasMore: start + PAGE_SIZE < total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load niches";
    return json({ error: message }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      coverImageData?: unknown;
      authorName?: unknown;
      coverImageUrl?: unknown;
      section?: unknown;
      title?: unknown;
      value?: unknown;
    };
    if (!isNicheSection(body.section)) {
      return json({ error: "Invalid section" }, 400);
    }
    const value = typeof body.value === "string" ? body.value.trim() : "";
    if (!value) {
      return json({ error: "Add something before saving." }, 400);
    }
    const pageTitle = typeof body.title === "string" ? body.title.trim() : "";
    const authorName = typeof body.authorName === "string" ? body.authorName.trim() : "";
    const coverImageData = typeof body.coverImageData === "string" ? body.coverImageData.trim() : "";
    const coverImageUrl = typeof body.coverImageUrl === "string" ? body.coverImageUrl.trim() : "";

    let preview: NichePreview | undefined;
    if (LINK_SECTIONS.has(body.section)) {
      const normalizedUrl = normalizeUrl(value);
      if (!normalizedUrl) {
        return json({ error: "Paste a valid link." }, 400);
      }
      const duplicate = findDuplicateEntry(await readNicheEntries(), body.section, normalizedUrl, authorName);
      if (duplicate) {
        if (shouldRefreshDuplicatePreview(duplicate, body.section, authorName, coverImageData, coverImageUrl)) {
          const nextPreview = await buildLinkPreview(normalizedUrl, {
            authorName,
            coverImageData,
            coverImageUrl,
            pageTitle,
            section: body.section,
          });
          const updatedEntry = await updateNicheEntry(duplicate.id, {
            preview: mergePreview(duplicate.preview, nextPreview),
          });
          return json({ entry: updatedEntry ?? duplicate, duplicate: true, updated: Boolean(updatedEntry) });
        }
        return json({ entry: duplicate, duplicate: true });
      }
      preview = await buildLinkPreview(normalizedUrl, {
        authorName,
        coverImageData,
        coverImageUrl,
        pageTitle,
        section: body.section,
      });
    }

    const entry = await addNicheEntry({
      section: body.section,
      value,
      preview,
    });
    return json({ entry }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save entry";
    return json({ error: message }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return json({ error: "Missing id" }, 400);
    }
    const deleted = await deleteNicheEntry(id);
    return json({ deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete entry";
    return json({ error: message }, 500);
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function matchesQuery(entry: Awaited<ReturnType<typeof readNicheEntries>>[number], query: string) {
  if (!query) {
    return true;
  }
  const haystack = [
    entry.value,
    entry.preview?.title,
    entry.preview?.description,
    entry.preview?.siteName,
    entry.preview?.authorName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    try {
      const url = new URL(`https://${value}`);
      return url.toString();
    } catch {
      return null;
    }
  }
  return null;
}

async function buildLinkPreview(
  url: string,
  options: {
    authorName: string;
    coverImageData: string;
    coverImageUrl: string;
    pageTitle: string;
    section: NicheSection;
  }
): Promise<NichePreview> {
  const fallback = () => fallbackPreview(url, options.pageTitle, options.authorName);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return fallback();
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return fallback();
    }
    const html = (await response.text()).slice(0, 500_000);
    const authorName = options.authorName || readAmazonAuthorName(html) || "";
    const imageUrl =
      options.coverImageUrl || readAmazonCoverImage(html) || readMeta(html, "og:image") || readMeta(html, "twitter:image");
    const absoluteImageUrl = absolutizeUrl(imageUrl, url);
    const compressedImage =
      options.section === "books"
        ? await compressCoverImage({
            dataUrl: options.coverImageData,
            imageUrl: absoluteImageUrl,
            referer: url,
          })
        : undefined;

    return {
      url,
      title:
        (options.section === "authors" ? authorName : "") ||
        readMeta(html, "og:title") ||
        readTitle(html) ||
        cleanPageTitle(options.pageTitle) ||
        fallbackTitle(url),
      description: readMeta(html, "og:description") || readMeta(html, "description") || undefined,
      image: compressedImage || absoluteImageUrl,
      siteName: readMeta(html, "og:site_name") || new URL(url).hostname.replace(/^www\./, ""),
      authorName: authorName || undefined,
    };
  } catch {
    const preview = fallback();
    if (options.section === "books" && (options.coverImageData || options.coverImageUrl)) {
      const compressedImage = await compressCoverImage({
        dataUrl: options.coverImageData,
        imageUrl: options.coverImageUrl,
        referer: url,
      });
      return { ...preview, image: compressedImage || options.coverImageUrl };
    }
    return preview;
  }
}

function fallbackPreview(url: string, pageTitle = "", authorName = ""): NichePreview {
  return {
    url,
    title: authorName || cleanPageTitle(pageTitle) || fallbackTitle(url),
    siteName: new URL(url).hostname.replace(/^www\./, ""),
    authorName: authorName || undefined,
  };
}

function cleanPageTitle(value: string) {
  return value.replace(/\s*:\s*Amazon\.[^:]+$/i, "").replace(/\s+/g, " ").trim();
}

function fallbackTitle(url: string) {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./, "");
}

function findDuplicateEntry(entries: NicheEntry[], section: NicheSection, value: string, authorName: string) {
  if (!LINK_SECTIONS.has(section)) {
    return undefined;
  }
  const nextKey = duplicateKey(section, value, authorName);
  return entries.find((entry) => {
    if (entry.section !== section) {
      return false;
    }
    return duplicateKey(section, entry.preview?.url || entry.value, entry.preview?.authorName || "") === nextKey;
  });
}

function shouldRefreshDuplicatePreview(
  entry: NicheEntry,
  section: NicheSection,
  authorName: string,
  coverImageData: string,
  coverImageUrl: string
) {
  if (section === "books" && (coverImageData || coverImageUrl)) {
    return !entry.preview?.image || !entry.preview.image.startsWith("data:image/");
  }
  if (section === "authors" && authorName) {
    return !entry.preview?.authorName || entry.preview.title === fallbackTitle(entry.preview?.url || entry.value);
  }
  return false;
}

function mergePreview(current: NichePreview | undefined, next: NichePreview): NichePreview {
  if (!current) {
    return next;
  }
  return {
    ...next,
    ...current,
    authorName: current.authorName || next.authorName,
    description: current.description || next.description,
    image: next.image?.startsWith("data:image/") ? next.image : current.image || next.image,
    siteName: current.siteName || next.siteName,
    title: current.title || next.title,
    url: current.url || next.url,
  };
}

function duplicateKey(section: NicheSection, value: string, authorName = "") {
  const linkKey = canonicalLinkKey(section, value);
  if (linkKey) {
    return linkKey;
  }
  if (section === "authors" && authorName) {
    return `author-name:${normalizeDuplicateText(authorName)}`;
  }
  return `raw:${normalizeDuplicateText(value)}`;
}

function canonicalLinkKey(section: NicheSection, value: string) {
  try {
    const url = new URL(value);
    const amazonAsin = section === "books" ? readAmazonAsin(url) : "";
    if (amazonAsin) {
      return `amazon-book:${amazonAsin}`;
    }

    const amazonAuthorId = section === "authors" ? readAmazonAuthorId(url) : "";
    if (amazonAuthorId) {
      return `amazon-author:${amazonAuthorId}`;
    }

    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    const host = url.hostname.replace(/^(www|smile|m)\./, "").toLowerCase();
    return `${url.protocol}//${host}${url.pathname.toLowerCase()}`;
  } catch {
    return "";
  }
}

function readAmazonAsin(url: URL) {
  const path = url.pathname;
  const match =
    path.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})(?:[/?]|$)/i) ??
    path.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return (url.searchParams.get("asin") || match?.[1] || "").toUpperCase();
}

function readAmazonAuthorId(url: URL) {
  const path = url.pathname;
  const match =
    path.match(/\/stores\/[^/]+\/author\/([A-Z0-9_-]+)/i) ??
    path.match(/\/(?:stores\/author|author|e)\/([A-Z0-9_-]+)/i);
  return (match?.[1] || "").toUpperCase();
}

function normalizeDuplicateText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function readTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1].trim()) : "";
}

function readMeta(html: string, key: string) {
  const escapedKey = escapeRegExp(key);
  const propertyPattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const contentFirstPattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedKey}["'][^>]*>`,
    "i"
  );
  const match = html.match(propertyPattern) ?? html.match(contentFirstPattern);
  return match ? decodeHtml(match[1].trim()) : "";
}

function readAmazonAuthorName(html: string) {
  return (
    readElementText(html, "bylineInfo") ||
    readElementText(html, "authorFollowHeading") ||
    readMeta(html, "books:author") ||
    ""
  )
    .replace(/^by\s+/i, "")
    .trim();
}

function readAmazonCoverImage(html: string) {
  const wrapperImage = readImageTagInsideElementById(html, "imgTagWrapperId");
  const landingImage = readImageTagById(html, "landingImage");
  const frontImage = readImageTagById(html, "imgBlkFront") || readImageTagById(html, "ebooksImgBlkFront");
  return (
    readAttribute(wrapperImage, "src") ||
    readAttribute(wrapperImage, "data-old-hires") ||
    readBestImageSource(landingImage) ||
    readBestImageSource(frontImage) ||
    readJsonStringProperty(html, "hiRes") ||
    readJsonStringProperty(html, "large") ||
    ""
  );
}

function readElementText(html: string, id: string) {
  const match = html.match(new RegExp(`<[^>]+id=["']${escapeRegExp(id)}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return match ? decodeHtml(stripTags(match[1])) : "";
}

function readImageTagById(html: string, id: string) {
  const match = html.match(new RegExp(`<img[^>]+id=["']${escapeRegExp(id)}["'][^>]*>`, "i"));
  return match?.[0] || "";
}

function readImageTagInsideElementById(html: string, id: string) {
  const wrapperMatch = html.match(
    new RegExp(`<[^>]+id=["']${escapeRegExp(id)}["'][^>]*>[\\s\\S]*?<img[^>]*>`, "i")
  );
  if (!wrapperMatch) {
    return "";
  }
  const imageMatch = wrapperMatch[0].match(/<img[^>]*>/i);
  return imageMatch?.[0] || "";
}

function readBestImageSource(imageTag: string) {
  if (!imageTag) {
    return "";
  }
  return (
    readLargestDynamicImage(readAttribute(imageTag, "data-a-dynamic-image")) ||
    readAttribute(imageTag, "data-old-hires") ||
    readLargestSrcSet(readAttribute(imageTag, "srcset")) ||
    readAttribute(imageTag, "src") ||
    ""
  );
}

function readAttribute(html: string, attribute: string) {
  const quotedMatch = html.match(new RegExp(`${escapeRegExp(attribute)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  if (quotedMatch) {
    return decodeHtml(quotedMatch[2].trim());
  }
  const unquotedMatch = html.match(new RegExp(`${escapeRegExp(attribute)}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquotedMatch ? decodeHtml(unquotedMatch[1].trim()) : "";
}

function readJsonStringProperty(html: string, property: string) {
  const match = html.match(new RegExp(`"${escapeRegExp(property)}"\\s*:\\s*"([^"]+)"`, "i"));
  return match ? decodeHtml(match[1].replace(/\\\//g, "/")) : "";
}

function readLargestDynamicImage(value: string) {
  if (!value) {
    return "";
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).reduce(
      (best, [url, dimensions]) => {
        const [width, height] = Array.isArray(dimensions) ? dimensions : [];
        const score = Number(width || 0) * Number(height || 0);
        return score > best.score ? { score, url } : best;
      },
      { score: 0, url: "" }
    ).url;
  } catch {
    const match = value.match(/https?:\/\/[^"']+/i);
    return match?.[0] || "";
  }
}

function readLargestSrcSet(value: string) {
  if (!value) {
    return "";
  }
  return value
    .split(",")
    .map((item) => {
      const [url = "", descriptor = ""] = item.trim().split(/\s+/, 2);
      const score = Number(descriptor.replace(/[^\d.]/g, "")) || 0;
      return { score, url };
    })
    .filter((item) => item.url)
    .sort((left, right) => right.score - left.score)[0]?.url || "";
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

async function compressCoverImage({ dataUrl, imageUrl, referer }: { dataUrl?: string; imageUrl?: string; referer: string }) {
  const compressedDataImage = dataUrl ? await compressDataImage(dataUrl) : undefined;
  if (compressedDataImage) {
    return compressedDataImage;
  }
  return imageUrl ? await compressRemoteImage(imageUrl, referer) : undefined;
}

async function compressDataImage(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i);
  if (!match || dataUrl.length > COVER_DATA_MAX_CHARS) {
    return undefined;
  }
  const bytes = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (bytes.length > COVER_MAX_BYTES) {
    return undefined;
  }
  return compressImageBytes(bytes);
}

async function compressRemoteImage(imageUrl: string, referer: string) {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: referer,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return undefined;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > COVER_MAX_BYTES) {
      return undefined;
    }
    return compressImageBytes(bytes);
  } catch {
    return undefined;
  }
}

async function compressImageBytes(bytes: Buffer) {
  try {
    const compressed = await sharp(bytes)
      .resize({ width: 180, height: 240, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 42, effort: 4 })
      .toBuffer();
    return `data:image/webp;base64,${compressed.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function absolutizeUrl(value: string, base: string) {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value, base).toString();
  } catch {
    return undefined;
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
