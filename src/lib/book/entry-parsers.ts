import type { TextEntry } from "./types";

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ensureArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value === null || value === undefined ? [] : [value];
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export function parseFactsInput(raw: string, limit = 30): TextEntry[] {
  const normalized = raw?.trim() ?? "";
  if (!normalized) {
    return [];
  }
  const parsed = safeJsonParse(normalized);
  const iterable = parsed ? ensureArray(parsed) : normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const entries: TextEntry[] = [];
  iterable.forEach((value, index) => {
    entries.push(normalizeFactEntry(value, index));
  });
  return entries.slice(0, limit);
}

export function parseListInput(raw: string): TextEntry[] {
  const normalized = raw?.trim() ?? "";
  if (!normalized) {
    return [];
  }
  const parsed = safeJsonParse(normalized);
  const iterable = parsed ? ensureArray(parsed) : normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return iterable.map((value, index) => {
    const text = normalizeText(value) || `List item #${index + 1}`;
    return { body: text };
  });
}

export function parseListDescriptionInput(raw: string): TextEntry[] {
  const normalized = raw?.trim() ?? "";
  if (!normalized) {
    return [];
  }
  const parsed = safeJsonParse(normalized);
  const iterable = parsed
    ? ensureArray(parsed)
    : parseDescriptionFallback(normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean));
  return iterable.map((value) => normalizeTitleDescription(value));
}

export function parseLooseFactsInput(raw: string): TextEntry[] {
  const normalized = raw?.trim() ?? "";
  if (!normalized) {
    return [];
  }
  const parsed = safeJsonParse(normalized);
  if (parsed) {
    return ensureArray(parsed).map((value, index) => normalizeFactEntry(value, index));
  }
  const entries: unknown[] = [];
  for (const line of normalized.split(/\n+/)) {
    let cleaned = line.trim();
    if (!cleaned || cleaned === "[" || cleaned === "]") {
      continue;
    }
    cleaned = cleaned.replace(/,+$/, "").trim();
    if (!cleaned) {
      continue;
    }
    try {
      entries.push(JSON.parse(cleaned));
      continue;
    } catch {
      // best effort fallback below
    }
    cleaned = cleaned.replace(/^\[+/, "").replace(/\]+$/, "").trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    if (cleaned) {
      entries.push(cleaned);
    }
  }
  return entries.map((value, index) => normalizeFactEntry(value, index));
}

function parseDescriptionFallback(lines: string[]): Array<Record<string, string>> {
  const entries: Array<Record<string, string>> = [];
  for (const line of lines) {
    if (!line) continue;
    const delimiter = ["|", ":", " - ", "-", "—"].find((token) => line.includes(token));
    if (delimiter) {
      const [title, ...rest] = line.split(delimiter);
      const description = rest.join(delimiter);
      entries.push({ title: title.trim(), description: description.trim() });
    } else {
      entries.push({ title: line.trim(), description: "" });
    }
  }
  return entries;
}

function normalizeTitleDescription(value: unknown): TextEntry {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { body: text } : { body: "", skipOverlay: true };
  }
  if (!value || typeof value !== "object") {
    return { body: "" };
  }
  const record = value as Record<string, unknown>;
  const title = normalizeText(record.title);
  const description = normalizeText(record.description ?? record.details ?? "");
  let normalizedTitle = title || undefined;
  let body = description;
  if (!body) {
    if (normalizedTitle) {
      body = normalizedTitle;
      normalizedTitle = undefined;
    } else {
      return { body: "", skipOverlay: true };
    }
  }
  return { body, title: normalizedTitle };
}

function normalizeFactEntry(value: unknown, index: number): TextEntry {
  const fallback = `Add your fact paragraph for slot ${index + 1}.`;
  if (typeof value === "string") {
    const text = value.trim();
    return { body: text || fallback };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const title = normalizeText(record.title);
    const summary = normalizeText(record.summary);
    const details = normalizeText(record.details ?? record.description);
    const bodyField = normalizeText(record.body);
    const pieces = [summary, details, bodyField].filter(Boolean);
    const body = pieces.join(" ").trim();
    if (!body && title) {
      return { body: title, title: undefined };
    }
    return { body: body || fallback, title: title || undefined };
  }
  return { body: fallback };
}
