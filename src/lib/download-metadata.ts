export const DEFAULT_DOWNLOAD_TITLE = "Sloths Picture Book with Fascinating Facts";
export const DEFAULT_DOWNLOAD_DESCRIPTION = `Sloths are fascinating because they've mastered a unique, slow-motion lifestyle. They evolved from giant ground sloths the size of elephants into the chill tree-climbers we know today. By hosting entire mini-ecosystems of bugs and algae in their fur, they play a vital role in the rainforest.

Inside, you'll find:

Premium color interior
Large print (8.5"x8.5")
Educational and fun facts about cozs
Wonderful real life sloths photographs that invoke awe and wonder`;
export const METADATA_STORAGE_KEY = "generator-metadata-v1";

const METADATA_KEYWORD_COUNT = 7;
const LOWERCASE_TITLE_WORDS = new Set(["for", "with", "to", "in", "or", "of", "the"]);

export interface DownloadMetadataFields {
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
}

export function createEmptyDownloadKeywords() {
  return Array.from({ length: METADATA_KEYWORD_COUNT }, () => "");
}

export function buildMetadataDownloadText({ title, subtitle, description, keywords }: DownloadMetadataFields) {
  const normalizedKeywords = keywords.map((keyword) => keyword.trim()).filter(Boolean);
  return [
    "Title:",
    formatMetadataHeading(title),
    "",
    "Subtitle:",
    formatMetadataHeading(subtitle),
    "",
    "Description:",
    description.trim(),
    "",
    "Keywords:",
    normalizedKeywords.join("\n"),
  ].join("\n");
}

export function buildMetadataFileName(title: string) {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return `${normalized || "book-details"}.txt`;
}

export function parseStoredMetadata(raw: string): DownloadMetadataFields {
  const parsed = JSON.parse(raw) as Partial<{
    title: unknown;
    subtitle: unknown;
    description: unknown;
    keywords: unknown;
  }>;

  return {
    title: typeof parsed.title === "string" ? parsed.title : DEFAULT_DOWNLOAD_TITLE,
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : "",
    description: typeof parsed.description === "string" ? parsed.description : DEFAULT_DOWNLOAD_DESCRIPTION,
    keywords: normalizeStoredMetadataKeywords(parsed.keywords),
  };
}

function normalizeStoredMetadataKeywords(value: unknown) {
  if (!Array.isArray(value)) {
    return createEmptyDownloadKeywords();
  }

  return Array.from(
    { length: METADATA_KEYWORD_COUNT },
    (_, index) => (typeof value[index] === "string" ? value[index] : "")
  );
}

function formatMetadataHeading(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/(^|[\s([{-])([a-z])/g, (_match, prefix: string, character: string) => `${prefix}${character.toUpperCase()}`)
    .replace(/\b([a-z]+)\b/g, (word: string, _captured: string, offset: number) => {
      if (offset === 0) {
        return word;
      }
      return LOWERCASE_TITLE_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word;
    });
}
