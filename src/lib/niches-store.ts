import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";

export const NICHE_SECTIONS = ["books", "authors", "searches", "ideas"] as const;
export type NicheSection = (typeof NICHE_SECTIONS)[number];

export interface NichePreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  authorName?: string;
}

export interface NicheEntry {
  id: string;
  section: NicheSection;
  value: string;
  createdAt: string;
  preview?: NichePreview;
}

interface NicheStore {
  entries: NicheEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "niches-board.json");

export function isNicheSection(value: unknown): value is NicheSection {
  return typeof value === "string" && (NICHE_SECTIONS as readonly string[]).includes(value);
}

export async function readNicheEntries() {
  const store = await readStore();
  return store.entries;
}

export async function addNicheEntry(entry: Omit<NicheEntry, "id" | "createdAt">) {
  const store = await readStore();
  const nextEntry: NicheEntry = {
    ...entry,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  store.entries.push(nextEntry);
  await writeStore(store);
  return nextEntry;
}

export async function updateNicheEntry(id: string, patch: Partial<Pick<NicheEntry, "preview" | "value">>) {
  const store = await readStore();
  const index = store.entries.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return null;
  }
  const nextEntry = {
    ...store.entries[index],
    ...patch,
  };
  store.entries[index] = nextEntry;
  await writeStore(store);
  return nextEntry;
}

export async function deleteNicheEntry(id: string) {
  const store = await readStore();
  const nextEntries = store.entries.filter((entry) => entry.id !== id);
  if (nextEntries.length === store.entries.length) {
    return false;
  }
  await writeStore({ entries: nextEntries });
  return true;
}

async function readStore(): Promise<NicheStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<NicheStore>;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isNicheEntry) : [],
    };
  } catch {
    return { entries: [] };
  }
}

async function writeStore(store: NicheStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

function isNicheEntry(value: unknown): value is NicheEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<NicheEntry>;
  return (
    typeof candidate.id === "string" &&
    isNicheSection(candidate.section) &&
    typeof candidate.value === "string" &&
    typeof candidate.createdAt === "string"
  );
}
