import { NextRequest, NextResponse } from "next/server";
import {
  addNicheEntry,
  deleteNicheEntry,
  isNicheSection,
  readNicheEntries,
  type NichePreview,
  type NicheSection,
} from "@/lib/niches-store";

const PAGE_SIZE = 50;
const LINK_SECTIONS = new Set<NicheSection>(["books", "authors"]);
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
    const body = (await request.json()) as { section?: unknown; title?: unknown; value?: unknown };
    if (!isNicheSection(body.section)) {
      return json({ error: "Invalid section" }, 400);
    }
    const value = typeof body.value === "string" ? body.value.trim() : "";
    if (!value) {
      return json({ error: "Add something before saving." }, 400);
    }
    const pageTitle = typeof body.title === "string" ? body.title.trim() : "";

    let preview: NichePreview | undefined;
    if (LINK_SECTIONS.has(body.section)) {
      const normalizedUrl = normalizeUrl(value);
      if (!normalizedUrl) {
        return json({ error: "Paste a valid link." }, 400);
      }
      preview = await buildLinkPreview(normalizedUrl, pageTitle);
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
  const haystack = [entry.value, entry.preview?.title, entry.preview?.description, entry.preview?.siteName]
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

async function buildLinkPreview(url: string, pageTitle = ""): Promise<NichePreview> {
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
      return fallbackPreview(url, pageTitle);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return fallbackPreview(url, pageTitle);
    }
    const html = (await response.text()).slice(0, 300_000);
    return {
      url,
      title: readMeta(html, "og:title") || readTitle(html) || cleanPageTitle(pageTitle) || fallbackTitle(url),
      description: readMeta(html, "og:description") || readMeta(html, "description") || undefined,
      image: absolutizeUrl(readMeta(html, "og:image") || readMeta(html, "twitter:image"), url),
      siteName: readMeta(html, "og:site_name") || new URL(url).hostname.replace(/^www\./, ""),
    };
  } catch {
    return fallbackPreview(url, pageTitle);
  }
}

function fallbackPreview(url: string, pageTitle = ""): NichePreview {
  return {
    url,
    title: cleanPageTitle(pageTitle) || fallbackTitle(url),
    siteName: new URL(url).hostname.replace(/^www\./, ""),
  };
}

function cleanPageTitle(value: string) {
  return value.replace(/\s*:\s*Amazon\.[^:]+$/i, "").replace(/\s+/g, " ").trim();
}

function fallbackTitle(url: string) {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./, "");
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
