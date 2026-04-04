"use client";

import { useMemo, useState } from "react";
import { ImageStudio } from "./ImageStudio";

const MODES = [
  {
    value: "facts",
    label: "Facts (Even Pages)",
    description: "Classic alternating spreads with numbered callouts on even pages.",
    accent: "from-amber-200 via-orange-100 to-rose-200",
  },
  {
    value: "facts-both",
    label: "Facts (All Pages)",
    description: "Every spread receives fact overlays so copy density stays high.",
    accent: "from-sky-200 via-cyan-100 to-blue-200",
  },
  {
    value: "list",
    label: "Simple List",
    description: "Short bullet overlays on each page – great for quick captions.",
    accent: "from-purple-200 via-fuchsia-100 to-pink-200",
  },
  {
    value: "list-description",
    label: "Title + Description (All Pages)",
    description: "Title/description pairing on every spread.",
    accent: "from-lime-200 via-emerald-100 to-green-200",
  },
  {
    value: "list-description-even",
    label: "Title + Description (Even Pages)",
    description: "Let imagery breathe on odd pages and narrate on even pages.",
    accent: "from-rose-200 via-red-100 to-orange-200",
  },
  {
    value: "image-only",
    label: "Image Only",
    description: "Edge-to-edge imagery everywhere – perfect for mood boards.",
    accent: "from-zinc-200 via-neutral-100 to-stone-200",
  },
  {
    value: "full-fact",
    label: "Stacked Facts",
    description: "Multi-card stacks on every even page for denser storytelling.",
    accent: "from-indigo-200 via-blue-100 to-slate-200",
  },
  {
    value: "dictionary",
    label: "Dictionary Style",
    description: "Centered squares on white for alphabet/dictionary layouts.",
    accent: "from-yellow-200 via-amber-100 to-lime-200",
  },
] as const;

type ModeValue = (typeof MODES)[number]["value"];
const PAGE_SIZES = [
  { value: "square", label: "Square", description: "8.64 × 8.76 in" },
  { value: "us-letter", label: "US Letter", description: "8.625 × 11.25 in" },
] as const;
type PageSizeValue = (typeof PAGE_SIZES)[number]["value"];

type WizardStep = 1 | 2 | 3 | 4;

interface GeneratorAppProps {
  initialFacts?: string;
  initialList?: string;
  initialListDescription?: string;
  defaultImageLibrary?: string;
}

export function GeneratorApp(props: GeneratorAppProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [mode, setMode] = useState<ModeValue>("facts");
  const [facts, setFacts] = useState(props.initialFacts ?? "");
  const [list, setList] = useState(props.initialList ?? "");
  const [listDescription, setListDescription] = useState(props.initialListDescription ?? "");
  const [imageLibrary, setImageLibrary] = useState(props.defaultImageLibrary ?? "../images");
  const [pageSize, setPageSize] = useState<PageSizeValue>("square");
  const [pageCount, setPageCount] = useState(59);
  const [overlayOpacity, setOverlayOpacity] = useState(0.75);
  const [factsPerPage, setFactsPerPage] = useState(3);
  const [targetImageSize, setTargetImageSize] = useState(7.7);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const needsOverlayOpacity = !["image-only", "dictionary", "full-fact"].includes(mode);
  const needsFacts = ["facts", "facts-both", "full-fact"].includes(mode);
  const needsList = ["list"].includes(mode);
  const needsListDescription = ["list-description", "list-description-even"].includes(mode);

  const payload = useMemo(() => {
    const safePageCount = Number.isFinite(pageCount) ? pageCount : 59;
    const base: Record<string, unknown> = {
      mode,
      imageLibrary,
      pageSize,
      pageCount: Math.max(4, Math.min(200, safePageCount)),
    };
    if (needsOverlayOpacity) {
      base.overlayOpacity = overlayOpacity;
    }
    if (needsFacts) {
      base.facts = facts;
    }
    if (needsList) {
      base.list = list;
    }
    if (needsListDescription) {
      base.listDescription = listDescription;
    }
    if (mode === "full-fact") {
      base.factsPerPage = factsPerPage;
    }
    if (mode === "dictionary") {
      base.targetImageSize = targetImageSize * 72;
    }
    return base;
  }, [
    mode,
    imageLibrary,
    overlayOpacity,
    needsOverlayOpacity,
    needsFacts,
    needsList,
    needsListDescription,
    facts,
    list,
    listDescription,
    factsPerPage,
    targetImageSize,
    pageSize,
    pageCount,
  ]);

  async function handleGenerate() {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Unable to generate PDF");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${mode}-book.pdf`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setSuccessMessage("PDF generated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsLoading(false);
    }
  }

  const selectedMode = useMemo(() => MODES.find((item) => item.value === mode), [mode]);

  return (
    <div className="flex flex-col gap-8">
      {step === 1 && (
        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Step 1</p>
            <h2 className="text-xl font-semibold text-zinc-900">Choose a layout recipe</h2>
            <p className="text-sm text-zinc-700">
              Pick the book flow you want to generate. Each card includes a placeholder preview—swap the imagery later.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MODES.map((item) => {
              const isActive = item.value === mode;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value)}
                  aria-pressed={isActive}
                  className={`flex h-full flex-col rounded-2xl border bg-white text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-black ${
                    isActive ? "border-black ring-1 ring-black" : "border-zinc-200 hover:border-black/40"
                  }`}
                >
                  <div className={`relative overflow-hidden rounded-t-2xl bg-gradient-to-br ${item.accent} aspect-[4/3]`}>
                    <div className="absolute inset-4 rounded-xl bg-white/70 backdrop-blur-sm" />
                    <div className="absolute inset-4 flex items-center justify-center rounded-xl border border-dashed border-white/60 text-sm font-medium text-white/90">
                      Preview
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <span className="text-sm font-semibold text-zinc-900">{item.label}</span>
                    <p className="text-xs text-zinc-700">{item.description}</p>
                    {isActive && <span className="mt-auto text-xs font-medium text-emerald-600">Selected</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Next: Book specs
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Step 2</p>
            <h3 className="text-lg font-semibold text-zinc-900">Select page size & length</h3>
            <p className="text-sm text-zinc-700">Pick a trim size and tell us how many pages to include in the PDF.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {PAGE_SIZES.map((option) => {
              const isActive = option.value === pageSize;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPageSize(option.value)}
                  className={`flex flex-col gap-1 rounded-2xl border bg-white p-4 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-black ${
                    isActive ? "border-black ring-1 ring-black" : "border-zinc-200 hover:border-black/40"
                  }`}
                >
                  <span className="text-sm font-semibold text-zinc-900">{option.label}</span>
                  <span className="text-xs text-zinc-700">{option.description}</span>
                  {isActive && <span className="text-xs font-medium text-emerald-600">Selected</span>}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">Number of pages</label>
            <input
              type="number"
              min={4}
              max={200}
              value={pageCount}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                setPageCount(Number.isNaN(nextValue) ? 0 : nextValue);
              }}
              className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
            />
            <p className="text-xs text-zinc-700">Odd numbers start/end on a single page spread; even counts give full pairs.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
            >
              Back to templates
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Next: Fetch imagery
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <ImageStudio />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
            >
              Back: Page specs
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="w-full rounded-md bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 sm:w-auto"
            >
              Next: Configure content
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Step 4</p>
            <h3 className="text-lg font-semibold text-zinc-900">
              Configure {selectedMode?.label ?? "the layout"}
            </h3>
            <p className="text-sm text-zinc-700">
              Point to your assets, drop in JSON/text, and fine-tune overlay settings before generating the PDF.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">Image Folder</label>
            <input
              type="text"
              value={imageLibrary}
              onChange={(event) => setImageLibrary(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
          <p className="text-xs text-zinc-700">
            Paths are resolved relative to the Next.js project. Point this to your curated ./images folder.
          </p>
          </div>

        {needsOverlayOpacity && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between text-sm font-medium text-zinc-700">
              <span>Overlay Opacity</span>
              <span className="text-xs text-zinc-700">{overlayOpacity.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={overlayOpacity}
              onChange={(event) => setOverlayOpacity(Number(event.target.value))}
            />
          </div>
        )}

        {needsFacts && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">Facts JSON / Text</label>
            <textarea
              value={facts}
              onChange={(event) => setFacts(event.target.value)}
              className="h-40 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder={`[
  {"title": "Voyager 1 keeps flying", "fact": "Launched in 1977, it's now beyond 150 AU from Earth."},
  {"title": "Lightning is scorching", "fact": "Lightning channels can heat the air to 50,000°F."}
]`}
            />
          </div>
        )}

        {needsList && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">List Entries</label>
            <textarea
              value={list}
              onChange={(event) => setList(event.target.value)}
              className="h-32 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="Paste data/list.json or provide one item per line"
            />
          </div>
        )}

        {needsListDescription && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">Title + Description</label>
            <textarea
              value={listDescription}
              onChange={(event) => setListDescription(event.target.value)}
              className="h-40 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder='Supports [{"title": "...", "description": "..."}] or "Title | description" lines'
            />
          </div>
        )}

        {mode === "full-fact" && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">Facts Per Even Page</label>
            <input
              type="number"
              min={1}
              max={6}
              value={factsPerPage}
              onChange={(event) => setFactsPerPage(Number(event.target.value))}
              className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          </div>
        )}

        {mode === "dictionary" && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">Target Square (inches)</label>
            <input
              type="number"
              min={4}
              max={8}
              step={0.1}
              value={targetImageSize}
              onChange={(event) => setTargetImageSize(Number(event.target.value))}
              className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          </div>
        )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
            >
              Back: Image studio
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full rounded-md bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60 sm:w-auto"
            >
              {isLoading ? "Generating…" : "Generate PDF"}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}
        </section>
      )}
    </div>
  );
}
