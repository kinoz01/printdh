import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { unzipSync } from "fflate";

type Archive = Record<string, Uint8Array>;

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
};

export class MissingChromeError extends Error {
  constructor() {
    super("Google Chrome or Chromium is required for EPUB fallback conversion.");
    this.name = "MissingChromeError";
  }
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
].filter(Boolean) as string[];

const IMAGE_AND_FONT_MIME_TYPES = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".otf", "font/otf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const BASE_PRINT_CSS = `
  @page {
    size: Letter;
    margin: 0.75in;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #111111;
  }

  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 12pt;
    line-height: 1.48;
    overflow-wrap: anywhere;
  }

  .epub-chapter {
    break-before: page;
  }

  .epub-chapter:first-child {
    break-before: auto;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    break-after: avoid;
    line-height: 1.2;
    margin: 1.2em 0 0.5em;
  }

  p {
    margin: 0 0 0.8em;
    orphans: 3;
    widows: 3;
  }

  img,
  svg,
  video {
    display: block;
    max-width: 100%;
    height: auto;
    break-inside: avoid;
    margin: 0.75em auto;
  }

  table {
    border-collapse: collapse;
    max-width: 100%;
    break-inside: avoid;
  }

  td,
  th {
    border: 1px solid #d4d4d8;
    padding: 0.25em 0.4em;
    vertical-align: top;
  }

  pre,
  code {
    font-family: "Courier New", monospace;
    white-space: pre-wrap;
  }
`;

function execFileAsync(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        timeout: 2 * 60 * 1000,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });
}

async function findChromeExecutable() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Try the next known executable path.
    }
  }
  throw new MissingChromeError();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readArchiveText(archive: Archive, filename: string) {
  const bytes = archive[filename];
  if (!bytes) {
    throw new Error(`EPUB file is missing ${filename}`);
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodeUrlPath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripUrlDetails(value: string) {
  return value.split("#")[0].split("?")[0];
}

function isExternalUrl(value: string) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value.trim());
}

function normalizeArchivePath(value: string) {
  const normalized = path.posix.normalize(value).replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.startsWith("../")) {
    return null;
  }
  return normalized;
}

function resolveArchivePath(baseDir: string, href: string) {
  const cleanHref = stripUrlDetails(href.trim());
  if (!cleanHref || isExternalUrl(cleanHref)) {
    return null;
  }
  return normalizeArchivePath(path.posix.join(baseDir, decodeUrlPath(cleanHref)));
}

function findArchiveBytes(archive: Archive, filename: string | null) {
  if (!filename) {
    return null;
  }
  return archive[filename] ?? null;
}

function getDataUri(archive: Archive, filename: string | null) {
  const bytes = findArchiveBytes(archive, filename);
  if (!bytes || !filename) {
    return null;
  }

  const mimeType = IMAGE_AND_FONT_MIME_TYPES.get(path.extname(filename).toLowerCase());
  if (!mimeType) {
    return null;
  }

  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function rewriteCssUrls(archive: Archive, cssPath: string, css: string) {
  const cssDir = path.posix.dirname(cssPath);
  return css.replace(/url\(\s*(["']?)(?!data:|https?:|file:|#)([^"')]+)\1\s*\)/gi, (match, _quote, rawUrl) => {
    const dataUri = getDataUri(archive, resolveArchivePath(cssDir, rawUrl));
    return dataUri ? `url("${dataUri}")` : match;
  });
}

function getMetadataValue($opf: cheerio.CheerioAPI, selector: string) {
  return $opf(selector).first().text().trim();
}

function getManifestItems($opf: cheerio.CheerioAPI) {
  const manifest = new Map<string, ManifestItem>();

  $opf("manifest > item").each((_, element) => {
    const item = $opf(element);
    const id = item.attr("id")?.trim();
    const href = item.attr("href")?.trim();
    if (!id || !href) {
      return;
    }

    manifest.set(id, {
      id,
      href,
      mediaType: item.attr("media-type")?.trim().toLowerCase() || "",
      properties: item.attr("properties")?.trim().toLowerCase() || "",
    });
  });

  return manifest;
}

function getSpineItems($opf: cheerio.CheerioAPI, manifest: Map<string, ManifestItem>) {
  const items: ManifestItem[] = [];

  $opf("spine > itemref").each((_, element) => {
    const idref = $opf(element).attr("idref")?.trim();
    const item = idref ? manifest.get(idref) : null;
    if (item && (item.mediaType.includes("html") || /\.(?:xhtml|html?)$/i.test(item.href))) {
      items.push(item);
    }
  });

  return items;
}

function getCombinedStyles(archive: Archive, opfDir: string, manifest: Map<string, ManifestItem>) {
  const styles: string[] = [];

  for (const item of manifest.values()) {
    if (item.mediaType !== "text/css" && !item.href.toLowerCase().endsWith(".css")) {
      continue;
    }

    const cssPath = resolveArchivePath(opfDir, item.href);
    if (!cssPath || !archive[cssPath]) {
      continue;
    }

    styles.push(rewriteCssUrls(archive, cssPath, readArchiveText(archive, cssPath)));
  }

  return styles.join("\n\n");
}

function rewriteElementResource(
  archive: Archive,
  chapterDir: string,
  $chapter: cheerio.CheerioAPI,
  element: AnyNode,
  attributeName: string
) {
  const node = $chapter(element);
  const value = node.attr(attributeName);
  if (!value || isExternalUrl(value)) {
    return;
  }

  const dataUri = getDataUri(archive, resolveArchivePath(chapterDir, value));
  if (dataUri) {
    node.attr(attributeName, dataUri);
  }
}

function rewriteAnchorHref($chapter: cheerio.CheerioAPI, element: AnyNode) {
  const node = $chapter(element);
  const value = node.attr("href");
  if (!value || isExternalUrl(value)) {
    return;
  }

  const fragment = value.split("#")[1];
  if (fragment) {
    node.attr("href", `#${fragment}`);
    return;
  }

  node.removeAttr("href");
}

function renderChapterHtml(archive: Archive, chapterPath: string) {
  const chapterDir = path.posix.dirname(chapterPath);
  const $chapter = cheerio.load(readArchiveText(archive, chapterPath));

  $chapter("script, iframe, object, embed").remove();
  $chapter("link[rel='stylesheet']").remove();

  $chapter("style").each((_, element) => {
    const node = $chapter(element);
    node.text(rewriteCssUrls(archive, chapterPath, node.text()));
  });

  $chapter("[src]").each((_, element) => {
    rewriteElementResource(archive, chapterDir, $chapter, element, "src");
  });

  $chapter("image[href], [xlink\\:href]").each((_, element) => {
    rewriteElementResource(archive, chapterDir, $chapter, element, "href");
    rewriteElementResource(archive, chapterDir, $chapter, element, "xlink:href");
  });

  $chapter("a[href]").each((_, element) => {
    rewriteAnchorHref($chapter, element);
  });

  const body = $chapter("body").first();
  return body.length > 0 ? body.html() || "" : $chapter.root().html() || "";
}

function buildPrintableHtml(inputBytes: Uint8Array) {
  const archive = unzipSync(inputBytes);
  const container = cheerio.load(readArchiveText(archive, "META-INF/container.xml"), { xml: true });
  const opfPath = normalizeArchivePath(container("rootfile").first().attr("full-path") || "");

  if (!opfPath) {
    throw new Error("EPUB container does not point to a package document.");
  }

  const opfDir = path.posix.dirname(opfPath);
  const $opf = cheerio.load(readArchiveText(archive, opfPath), { xml: true });
  const manifest = getManifestItems($opf);
  const spineItems = getSpineItems($opf, manifest);

  if (spineItems.length === 0) {
    throw new Error("EPUB has no readable spine content.");
  }

  const title = getMetadataValue($opf, "metadata > dc\\:title") || "Ebook";
  const author = getMetadataValue($opf, "metadata > dc\\:creator");
  const stylesheet = getCombinedStyles(archive, opfDir, manifest);

  const chapters = spineItems
    .map((item) => resolveArchivePath(opfDir, item.href))
    .filter((chapterPath): chapterPath is string => Boolean(chapterPath && archive[chapterPath]))
    .map((chapterPath) => `<section class="epub-chapter">${renderChapterHtml(archive, chapterPath)}</section>`);

  if (chapters.length === 0) {
    throw new Error("EPUB spine references could not be read.");
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    ${author ? `<meta name="author" content="${escapeHtml(author)}">` : ""}
    <style>${BASE_PRINT_CSS}</style>
    ${stylesheet ? `<style>${stylesheet}</style>` : ""}
  </head>
  <body>
    <article>
      ${chapters.join("\n")}
    </article>
  </body>
</html>`;
}

async function printHtmlToPdf(htmlPath: string, outputPath: string) {
  const chromePath = await findChromeExecutable();
  await execFileAsync(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-pdf-header-footer",
    "--print-to-pdf-no-header",
    `--print-to-pdf=${outputPath}`,
    pathToFileURL(htmlPath).toString(),
  ]);
}

export async function convertEpubToPdfWithChrome(inputPath: string, outputPath: string, tmpDir: string) {
  const inputBytes = await fs.readFile(inputPath);
  const html = buildPrintableHtml(new Uint8Array(inputBytes));
  const htmlPath = path.join(tmpDir, "epub-print.html");

  await fs.writeFile(htmlPath, html, "utf8");
  await printHtmlToPdf(htmlPath, outputPath);
}
