"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NicheEntry, NicheSection } from "@/lib/niches-store";

interface SectionConfig {
  section: NicheSection;
  title: string;
  description: string;
  inputLabel: string;
  placeholder: string;
  multiline: boolean;
}

interface SectionState {
  entries: NicheEntry[];
  page: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  saving: boolean;
  deletingId: string | null;
  error: string | null;
  notice: string | null;
  query: string;
  draft: string;
}

interface ApiListResponse {
  entries: NicheEntry[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  error?: string;
}

interface ApiSaveResponse {
  entry: NicheEntry;
  duplicate?: boolean;
  error?: string;
}

const SECTION_CONFIGS: SectionConfig[] = [
  {
    section: "books",
    title: "Book Links",
    description: "Amazon product pages and other book pages worth revisiting.",
    inputLabel: "Book product link",
    placeholder: "https://www.amazon.com/dp/...",
    multiline: false,
  },
  {
    section: "authors",
    title: "Author Links",
    description: "Author pages, profiles, storefronts, and names to inspect later.",
    inputLabel: "Author link",
    placeholder: "https://www.amazon.com/stores/author/...",
    multiline: false,
  },
  {
    section: "searches",
    title: "Amazon Search Pages",
    description: "Saved Amazon search results pages for niche research and follow-up.",
    inputLabel: "Amazon search results link",
    placeholder: "https://www.amazon.com/s?k=...",
    multiline: false,
  },
  {
    section: "ideas",
    title: "Niches + Ideas",
    description: "Raw notes, niche angles, title seeds, and research ideas.",
    inputLabel: "Idea text",
    placeholder: "Paste niche ideas, bullets, or notes...",
    multiline: true,
  },
];

const EMPTY_SECTION_STATE: SectionState = {
  entries: [],
  page: 1,
  total: 0,
  hasMore: false,
  loading: false,
  saving: false,
  deletingId: null,
  error: null,
  notice: null,
  query: "",
  draft: "",
};

const ENTRY_ACCENT_COLORS = ["#93c5fd", "#a7f3d0", "#fcd34d", "#c4b5fd", "#fca5a5", "#67e8f9"];

function createInitialState(): Record<NicheSection, SectionState> {
  return {
    books: { ...EMPTY_SECTION_STATE },
    authors: { ...EMPTY_SECTION_STATE },
    searches: { ...EMPTY_SECTION_STATE },
    ideas: { ...EMPTY_SECTION_STATE },
  };
}

export function NichesBoard() {
  const [sections, setSections] = useState<Record<NicheSection, SectionState>>(() => createInitialState());
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    label: string;
    section: NicheSection;
  } | null>(null);

  const updateSection = useCallback((section: NicheSection, patch: Partial<SectionState>) => {
    setSections((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...patch,
      },
    }));
  }, []);

  const loadSection = useCallback(
    async (section: NicheSection, nextPage = 1, append = false, queryOverride?: string) => {
      const query = (queryOverride ?? sections[section].query).trim();
      updateSection(section, { loading: true, error: null, notice: null });
      try {
        const params = new URLSearchParams({
          section,
          page: String(nextPage),
        });
        if (query) {
          params.set("q", query);
        }
        const response = await fetch(`/api/niches?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as ApiListResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load entries");
        }
        setSections((current) => ({
          ...current,
          [section]: {
            ...current[section],
            entries: append ? [...current[section].entries, ...payload.entries] : payload.entries,
            page: payload.page,
            total: payload.total,
            hasMore: payload.hasMore,
            loading: false,
            error: null,
          },
        }));
      } catch (error) {
        updateSection(section, {
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load entries",
        });
      }
    },
    [sections, updateSection]
  );

  useEffect(() => {
    for (const config of SECTION_CONFIGS) {
      void loadSection(config.section);
    }
    // loadSection intentionally omitted so initial fetch does not rerun for every section state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingDelete) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingDelete(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pendingDelete]);

  async function handleSearch(section: NicheSection) {
    await loadSection(section);
  }

  async function handleSave(config: SectionConfig) {
    const current = sections[config.section];
    const value = current.draft.trim();
    if (!value) {
      updateSection(config.section, { error: "Add something before saving.", notice: null });
      return;
    }

    updateSection(config.section, { saving: true, error: null, notice: null });
    try {
      const response = await fetch("/api/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: config.section, value }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiSaveResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save entry");
      }
      if (payload.duplicate) {
        updateSection(config.section, {
          draft: "",
          saving: false,
          error: null,
          notice: "Already saved.",
        });
        return;
      }
      setSections((state) => {
        const sectionState = state[config.section];
        const matchesCurrentSearch = entryMatchesSearch(payload.entry, sectionState.query);
        const nextEntries = matchesCurrentSearch
          ? [payload.entry, ...sectionState.entries].slice(0, sectionState.page * 50)
          : sectionState.entries;
        const nextTotal = sectionState.total + (matchesCurrentSearch ? 1 : 0);
        return {
          ...state,
          [config.section]: {
            ...sectionState,
            draft: "",
            saving: false,
            error: null,
            notice: "Saved to disk.",
            entries: nextEntries,
            total: nextTotal,
            hasMore: nextEntries.length < nextTotal,
          },
        };
      });
    } catch (error) {
      updateSection(config.section, {
        saving: false,
        error: error instanceof Error ? error.message : "Unable to save entry",
      });
    }
  }

  function requestDelete(section: NicheSection, id: string) {
    const entry = sections[section].entries.find((candidate) => candidate.id === id);
    setPendingDelete({
      id,
      section,
      label: entry ? entryLabel(entry) : "this saved entry",
    });
  }

  async function handleDelete(section: NicheSection, id: string) {
    setPendingDelete(null);
    updateSection(section, { deletingId: id, error: null, notice: null });
    try {
      const response = await fetch(`/api/niches?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { deleted?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete entry");
      }
      setSections((current) => ({
        ...current,
        [section]: {
          ...current[section],
          deletingId: null,
          notice: payload.deleted ? "Removed." : "Entry was already removed.",
          entries: current[section].entries.filter((entry) => entry.id !== id),
          total: Math.max(0, current[section].total - (payload.deleted ? 1 : 0)),
        },
      }));
    } catch (error) {
      updateSection(section, {
        deletingId: null,
        error: error instanceof Error ? error.message : "Unable to delete entry",
      });
    }
  }

  return (
    <>
      <div className="grid gap-6">
        {SECTION_CONFIGS.map((config) => (
          <NicheSectionPanel
            key={config.section}
            config={config}
            state={sections[config.section]}
            onDraftChange={(draft) => updateSection(config.section, { draft, error: null, notice: null })}
            onQueryChange={(query) => updateSection(config.section, { query })}
            onSearch={() => void handleSearch(config.section)}
            onClearSearch={() => {
              updateSection(config.section, { query: "" });
              void loadSection(config.section, 1, false, "");
            }}
            onSave={() => void handleSave(config)}
            onLoadMore={() => void loadSection(config.section, sections[config.section].page + 1, true)}
            onDelete={(id) => requestDelete(config.section, id)}
          />
        ))}
      </div>

      {pendingDelete ? (
        <DeleteConfirmationModal
          label={pendingDelete.label}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void handleDelete(pendingDelete.section, pendingDelete.id)}
        />
      ) : null}
    </>
  );
}

interface NicheSectionPanelProps {
  config: SectionConfig;
  state: SectionState;
  onDraftChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  onSave: () => void;
  onLoadMore: () => void;
  onDelete: (id: string) => void;
}

function NicheSectionPanel({
  config,
  state,
  onDraftChange,
  onQueryChange,
  onSearch,
  onClearSearch,
  onSave,
  onLoadMore,
  onDelete,
}: NicheSectionPanelProps) {
  const isLinkSection = config.section !== "ideas";
  const savedLabel = useMemo(() => {
    if (state.total === 0) {
      return "No saved entries";
    }
    return `${state.total} saved ${state.total === 1 ? "entry" : "entries"}`;
  }, [state.total]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-zinc-900">{config.title}</h2>
            <p className="text-sm text-zinc-600">{config.description}</p>
          </div>
          <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
            {savedLabel}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700">{config.inputLabel}</span>
            {config.multiline ? (
              <textarea
                value={state.draft}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder={config.placeholder}
                className="h-28 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
              />
            ) : (
              <input
                type="url"
                value={state.draft}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder={config.placeholder}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
              />
            )}
          </label>
          <button
            type="button"
            onClick={onSave}
            disabled={state.saving}
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
          >
            {state.saving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
          <label className="min-w-0">
            <span className="sr-only">Search {config.title}</span>
            <input
              type="search"
              value={state.query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSearch();
                }
              }}
              placeholder={`Search ${config.title.toLowerCase()}...`}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={onSearch}
            disabled={state.loading}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-500 disabled:opacity-60"
          >
            Search
          </button>
          <button
            type="button"
            onClick={onClearSearch}
            disabled={state.loading || !state.query}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-500 disabled:opacity-60"
          >
            Clear
          </button>
        </div>

        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        {state.notice ? <p className="text-sm text-emerald-600">{state.notice}</p> : null}

        <div className="grid max-h-[800px] gap-3 overflow-y-auto pr-1">
          {state.entries.map((entry, index) =>
            isLinkSection ? (
              <LinkEntryCard
                key={entry.id}
                accentColor={ENTRY_ACCENT_COLORS[index % ENTRY_ACCENT_COLORS.length]}
                entry={entry}
                deleting={state.deletingId === entry.id}
                onDelete={() => onDelete(entry.id)}
              />
            ) : (
              <IdeaEntryCard
                key={entry.id}
                accentColor={ENTRY_ACCENT_COLORS[index % ENTRY_ACCENT_COLORS.length]}
                entry={entry}
                deleting={state.deletingId === entry.id}
                onDelete={() => onDelete(entry.id)}
              />
            )
          )}
          {!state.loading && state.entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
              Nothing saved here yet.
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            Showing {state.entries.length} of {state.total}.
          </p>
          {state.hasMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={state.loading}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-500 disabled:opacity-60"
            >
              {state.loading ? "Loading..." : "Load 50 more"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function LinkEntryCard({
  accentColor,
  entry,
  deleting,
  onDelete,
}: {
  accentColor: string;
  entry: NicheEntry;
  deleting: boolean;
  onDelete: () => void;
}) {
  const preview = entry.preview;
  return (
    <article
      className="grid min-w-0 gap-3 rounded-xl border border-l-[6px] border-zinc-200 bg-white p-3 shadow-sm sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]"
      style={{ borderLeftColor: accentColor }}
    >
      <a
        href={preview?.url ?? entry.value}
        target="_blank"
        rel="noreferrer"
        className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white"
      >
        {preview?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="px-2 text-center text-xs font-semibold text-zinc-400">No preview image</span>
        )}
      </a>
      <div className="min-w-0 space-y-2">
        <div className="space-y-1">
          <a
            href={preview?.url ?? entry.value}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-2 text-sm font-semibold text-zinc-950 hover:underline"
          >
            {preview?.title || entry.value}
          </a>
          {preview?.authorName ? <p className="truncate text-xs font-medium text-zinc-700">{preview.authorName}</p> : null}
          <p className="truncate text-xs text-zinc-500">{preview?.siteName || safeHost(entry.value)}</p>
        </div>
        <p className="text-xs text-zinc-400">{formatDate(entry.createdAt)}</p>
      </div>
      <DeleteButton deleting={deleting} onDelete={onDelete} />
    </article>
  );
}

function IdeaEntryCard({
  accentColor,
  entry,
  deleting,
  onDelete,
}: {
  accentColor: string;
  entry: NicheEntry;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <article
      className="grid gap-3 rounded-xl border border-l-[6px] border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto]"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="min-w-0 space-y-2">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800">
          <LinkedIdeaText value={entry.value} />
        </p>
        <p className="text-xs text-zinc-400">{formatDate(entry.createdAt)}</p>
      </div>
      <DeleteButton deleting={deleting} onDelete={onDelete} />
    </article>
  );
}

function LinkedIdeaText({ value }: { value: string }) {
  return value.split(/(https?:\/\/[^\s<>"']+)/gi).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) {
      return part;
    }

    const { url, trailingText } = splitTrailingUrlPunctuation(part);
    return (
      <span key={`${index}-${url}`}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
        >
          {url}
        </a>
        {trailingText}
      </span>
    );
  });
}

function splitTrailingUrlPunctuation(value: string) {
  const match = value.match(/[.,;:!?]+$/);
  if (!match) {
    return { url: value, trailingText: "" };
  }
  return {
    url: value.slice(0, -match[0].length),
    trailingText: match[0],
  };
}

function DeleteButton({ deleting, onDelete }: { deleting: boolean; onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={deleting}
      className="self-start rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
    >
      {deleting ? "Removing..." : "Remove"}
    </button>
  );
}

function DeleteConfirmationModal({
  label,
  onCancel,
  onConfirm,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-entry-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-2">
          <h3 id="delete-entry-title" className="text-base font-semibold text-zinc-950">
            Remove saved entry?
          </h3>
          <p className="text-sm leading-6 text-zinc-600">
            This will permanently remove the entry from disk. This action cannot be undone.
          </p>
          <p className="line-clamp-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800">
            {label}
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-500 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md border border-red-600 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:border-red-700 hover:bg-red-700"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function entryMatchesSearch(entry: NicheEntry, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return [entry.value, entry.preview?.title, entry.preview?.description, entry.preview?.siteName, entry.preview?.authorName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function entryLabel(entry: NicheEntry) {
  return entry.preview?.title || entry.preview?.authorName || entry.value;
}

function safeHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
