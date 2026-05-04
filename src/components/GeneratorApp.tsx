"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ImageStudio } from "./ImageStudio";

const MODES = [
  {
    value: "full-fact",
    label: "Stacked Even Facts",
    description: "Random pictures on the right and facts on the left page.",
    accent: "from-indigo-200 via-blue-100 to-slate-200",
  },
  // {
  //   value: "facts",
  //   label: "Facts (Even Pages)",
  //   description: "Classic alternating spreads with numbered callouts on even pages.",
  //   accent: "from-amber-200 via-orange-100 to-rose-200",
  // },
  // {
  //   value: "facts-both",
  //   label: "Facts (All Pages)",
  //   description: "Every spread receives fact overlays so copy density stays high.",
  //   accent: "from-sky-200 via-cyan-100 to-blue-200",
  // },
  // {
  //   value: "list",
  //   label: "Simple List",
  //   description: "Short bullet overlays on each page - great for quick captions.",
  //   accent: "from-purple-200 via-fuchsia-100 to-pink-200",
  // },
  // {
  //   value: "list-description",
  //   label: "Title + Description (All Pages)",
  //   description: "Title/description pairing on every spread.",
  //   accent: "from-lime-200 via-emerald-100 to-green-200",
  // },
  // {
  //   value: "list-description-even",
  //   label: "Title + Description (Even Pages)",
  //   description: "Let imagery breathe on odd pages and narrate on even pages.",
  //   accent: "from-rose-200 via-red-100 to-orange-200",
  // },
  // {
  //   value: "image-only",
  //   label: "Image Only",
  //   description: "Edge-to-edge imagery everywhere - perfect for mood boards.",
  //   accent: "from-zinc-200 via-neutral-100 to-stone-200",
  // },
  // {
  //   value: "dictionary",
  //   label: "Dictionary Style",
  //   description: "Centered squares on white for alphabet/dictionary layouts.",
  //   accent: "from-yellow-200 via-amber-100 to-lime-200",
  // },
] as const;

type ModeValue =
  | "facts"
  | "facts-both"
  | "list"
  | "list-description"
  | "list-description-even"
  | "image-only"
  | "full-fact"
  | "dictionary";
const PAGE_SIZES = [
  { value: "square", label: "Square", description: "8.64 × 8.76 in" },
  { value: "us-letter", label: "US Letter", description: "8.625 × 11.25 in" },
] as const;
type PageSizeValue = (typeof PAGE_SIZES)[number]["value"];

type WizardStep = 1 | 2 | 3 | 4;
type BookFontFormat = "truetype" | "opentype";

interface BookFontOption {
  id: string;
  label: string;
  fileName: string;
  fullName: string;
  familyName: string;
  subfamilyName: string;
  format: BookFontFormat;
  previewFamily: string;
  previewUrl: string;
  sourceLabel: string;
  sourceType: "file" | "zip";
  entryPath: string | null;
}

interface GeneratorAppProps {
  initialFacts?: string;
  initialList?: string;
  initialListDescription?: string;
  defaultImageLibrary?: string;
}

interface FontSourceGroup {
  key: string;
  label: string;
  searchText: string;
  variants: BookFontOption[];
}

const DEFAULT_FULL_FACT_FONT_ID = "__default__";
const DEFAULT_FULL_FACT_FONT_OPTION: BookFontOption = {
  id: DEFAULT_FULL_FACT_FONT_ID,
  label: "Default Serif",
  fileName: "Built into the PDF generator",
  fullName: "Default Serif",
  familyName: "Default Serif",
  subfamilyName: "Regular",
  format: "truetype",
  previewFamily: '"Times New Roman", Georgia, serif',
  previewUrl: "",
  sourceLabel: "PDF built-in",
  sourceType: "file",
  entryPath: null,
};
const DEFAULT_FULL_FACT_FONT_SOURCE_KEY = "__default_source__";
const DEFAULT_FULL_FACT_FONT_SOURCE_LABEL = "Default";
const FULL_FACT_FONT_PREVIEW_TEXT = "Cows remember familiar faces and build strong social bonds.";
const STACKED_EVEN_FACTS_PLACEHOLDER = `[
"Coffee beans are not actually beans; they are the pits (seeds) of bright red berries called coffee cherries.",
"The legend of coffee's discovery involves an Ethiopian goat herder named Kaldi, who noticed his goats became very energetic after eating certain berries.",
"There are two primary species of coffee beans: Arabica, which is smoother and sweeter, and Robusta, which is stronger and more bitter.",
"Brazil is the largest coffee producer in the world, a title it has held for over 150 years.",
"Coffee is one of the most traded commodities in the global market, often cited as being second only to crude oil.",
"The 'Bean Belt' is the name for the equatorial region between the Tropics of Cancer and Capricorn where almost all coffee is grown.",
"Finland is the world's top coffee-consuming nation per capita, with the average citizen drinking nearly 12kg of coffee per year.",
"Espresso is not a type of bean or roast; it is a brewing method that uses high pressure to force water through fine grounds.",
"Light roast coffee actually contains slightly more caffeine than dark roast coffee because the roasting process breaks down caffeine molecules.",
"A single coffee tree can live for up to 100 years, though they are usually most productive during their first two decades.",
"The word 'coffee' originates from the Arabic 'qahwah,' which was a term originally used for wine.",
"It takes about 37 gallons of water to grow the beans needed for just one cup of coffee.",
"Before coffee was brewed as a drink, some African tribes mixed coffee berries with animal fat to create energy-rich snack balls.",
"Kopi Luwak is the world's most expensive coffee, and it is made from beans that have been eaten and excreted by a palm civet.",
"The first webcam in history was created at the University of Cambridge specifically to monitor the status of a coffee pot.",
"Coffee was the first food ever to be freeze-dried, a process developed during World War II to preserve rations.",
"The majority of the world's coffee is grown by small-scale farmers rather than giant corporations.",
"There are over 120 species of coffee plants, but Arabica and Robusta make up nearly 100% of global commercial production.",
"Caffeine is a natural pesticide that protects coffee plants from being eaten by certain insects.",
"Decaf coffee is not 100% caffeine-free; a standard cup usually contains about 2 to 12 milligrams of caffeine.",
"The smell of coffee alone can help wake you up by altering the activity of certain genes in the brain.",
"Coffee cherries are usually picked by hand because they don't all ripen at the exact same time on the same branch.",
"In the 17th century, King Charles II of England tried to ban coffee houses because he feared they were places where people plotted against him.",
"The term 'Americano' comes from World War II, when American GIs diluted Italian espresso with hot water to make it taste more like the coffee back home.",
"Coffee is actually rich in antioxidants, and for many people, it is the primary source of antioxidants in their daily diet.",
"The most productive coffee trees can produce up to 10 pounds of coffee cherries per year.",
"In ancient Constantinople, a woman could legally divorce her husband if he failed to provide her with a daily quota of coffee.",
"Coffee stays warm about 20% longer when you add cream or milk compared to drinking it black.",
"The first coffee house in Europe opened in Venice in 1645.",
"Honolulu, Hawaii, is the only major city in the United States that grows coffee commercially due to its tropical climate.",
"A 'cup of joe' became a common term after Admiral Josephus Daniels banned alcohol on U.S. Navy ships, making coffee the strongest drink available.",
"Coffee beans are usually green when they are harvested and only turn brown after being roasted at high temperatures.",
"The Maillard reaction is the chemical process during roasting that gives coffee its complex flavors and dark color.",
"Bears and other wild animals in coffee-growing regions often avoid eating coffee cherries because the caffeine is toxic to them.",
"Turkish coffee is traditionaly brewed in a small pot called a 'cezve' and served unfiltered with the grounds at the bottom.",
"Instant coffee was invented in 1901 by a Japanese-American chemist named Satori Kato.",
"The 'French Press' was actually patented by an Italian designer named Attilio Calimani in 1929.",
"Drinking coffee may help improve physical performance by increasing adrenaline levels in the blood.",
"The average lifespan of a coffee bush is 25 to 30 years, though they can survive much longer in the wild.",
"Bees are attracted to coffee flowers because the nectar contains small amounts of caffeine, which helps them remember the flower's location.",
"A standard cup of black coffee contains only about two calories.",
"The global coffee industry provides a livelihood for over 100 million people worldwide.",
"In the 1600s, coffee was so popular in Turkey that it was called 'the milk of chess players and thinkers.'",
"The largest cup of coffee ever recorded was over 6,000 gallons and was held in a giant cup in South Korea.",
"The 'Flat White' coffee drink originated in either Australia or New Zealand during the 1980s, though both countries claim it.",
"Roasting coffee at home was common until the late 1800s when pre-roasted coffee became available in cans.",
"Coffee contains small amounts of magnesium and potassium, which help the body use insulin and regulate blood sugar.",
"The shelf life of roasted coffee beans is relatively short; they start to lose their flavor as soon as they are exposed to oxygen.",
"Vietnam is the world's leading producer of Robusta coffee, which is often used in instant coffee and espresso blends.",
"Johann Sebastian Bach was such a fan of coffee that he wrote a piece of music called the 'Coffee Cantata' in 1735.",
"In Italy, espresso is often served with a small slice of lemon peel, which is said to bring out the sweetness of the coffee.",
"The 'Crema' is the reddish-brown froth that sits on top of a well-made espresso, consisting of oils and proteins.",
"The United States is the largest importer of coffee in the world.",
"Some people use spent coffee grounds as a natural fertilizer in their gardens because they are rich in nitrogen.",
"The average American worker spends about $1,100 a year on coffee.",
"Coffee was once considered a 'revolutionary' drink because it replaced beer as the morning beverage of choice, leading to a more alert workforce.",
"The 'Moka Pot' is a classic stovetop coffee maker that was invented in Italy by Alfonso Bialetti in 1933.",
"Ethiopia is considered the botanical birthplace of Arabica coffee.",
"Ground coffee can absorb odors from its surroundings, which is why it should be stored in an airtight container.",
"The 'Cortado' is a popular Spanish coffee drink consisting of espresso mixed with a roughly equal amount of warm milk.",
"A coffee taster is professionally known as a 'cupper' and follows a strict protocol to evaluate the quality of beans.",
"The first automatic drip coffee maker for home use was called the 'Mr. Coffee' and was introduced in 1972.",
"Iced coffee is popular worldwide, but in Japan, it has been a common beverage since the 1920s.",
"The world's largest coffee shop is an Al Masaa Café in Riyadh, Saudi Arabia, which can seat over 1,000 people.",
"Coffee grounds can be used to scrub pots and pans because their texture is abrasive but not overly damaging.",
"The 'Red Eye' is a drink made by adding a shot of espresso to a regular cup of drip coffee.",
"In Scandinavia, it is a traditional practice to serve coffee with a side of sweets or pastries, known as 'fika' in Sweden.",
"The 'Cappuccino' is named after the Capuchin friars, whose brown robes matched the color of the coffee when mixed with milk.",
"Coffee trees produce white, fragrant flowers that smell very similar to jasmine.",
"The 'Macchiato' literally means 'stained' or 'spotted' in Italian, referring to the small amount of milk added to the espresso.",
"Coffee can be used to dye fabrics and paper, giving them a natural, vintage brown hue.",
"In the 18th century, Frederick the Great of Prussia tried to ban coffee to encourage people to drink beer instead.",
"A 'Barista' is the Italian word for 'bartender,' but it has become the global term for a professional coffee preparer.",
"Cold brew coffee is made by steeping grounds in room-temperature water for 12 to 24 hours, resulting in lower acidity.",
"The caffeine in coffee starts to take effect within about 20 minutes of consumption.",
"The 'Affogato' is a delicious Italian dessert made by pouring a shot of hot espresso over a scoop of vanilla gelato.",
"The Dutch were the first to bring coffee plants to Europe and eventually started plantations in their colonies in Indonesia.",
"Coffee contains small amounts of several B-vitamins, including riboflavin, pantothenic acid, and niacin.",
"The 'Long Black' is a style of coffee popular in Australia and New Zealand, made by pouring espresso over hot water.",
"Even today, some people use coffee grounds to predict the future, a practice known as tasseography."
]`;

export function GeneratorApp(props: GeneratorAppProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [mode, setMode] = useState<ModeValue>("full-fact");
  const [facts, setFacts] = useState(props.initialFacts ?? "");
  const [list, setList] = useState(props.initialList ?? "");
  const [listDescription, setListDescription] = useState(props.initialListDescription ?? "");
  const [imageLibrary, setImageLibrary] = useState(props.defaultImageLibrary ?? "../images");
  const [pageSize, setPageSize] = useState<PageSizeValue>("square");
  const [pageCount, setPageCount] = useState(40);
  const [overlayOpacity, setOverlayOpacity] = useState(0.9);
  const [fullFactOpacity, setFullFactOpacity] = useState(0.9);
  const [factsPerPage, setFactsPerPage] = useState(3);
  const [targetImageSize, setTargetImageSize] = useState(7.7);
  const [availableFonts, setAvailableFonts] = useState<BookFontOption[]>([]);
  const [loadingFonts, setLoadingFonts] = useState(false);
  const [fontsError, setFontsError] = useState<string | null>(null);
  const [fullFactFontSourceKey, setFullFactFontSourceKey] = useState(DEFAULT_FULL_FACT_FONT_SOURCE_KEY);
  const [fullFactFontSourceSearch, setFullFactFontSourceSearch] = useState(DEFAULT_FULL_FACT_FONT_SOURCE_LABEL);
  const [fullFactBoxFontId, setFullFactBoxFontId] = useState(DEFAULT_FULL_FACT_FONT_ID);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const syncStepFromLocation = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setStep(parseWizardStep(params.get("step")));
  }, []);

  const navigateToStep = useCallback((nextStep: WizardStep) => {
    if (typeof window === "undefined") {
      setStep(nextStep);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (nextStep === 1) {
      params.delete("step");
    } else {
      params.set("step", String(nextStep));
    }
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.pushState(null, "", nextUrl);
    setStep(nextStep);
  }, []);

  useEffect(() => {
    syncStepFromLocation();
    window.addEventListener("popstate", syncStepFromLocation);
    return () => {
      window.removeEventListener("popstate", syncStepFromLocation);
    };
  }, [syncStepFromLocation]);

  useEffect(() => {
    let ignore = false;
    async function loadBookFonts() {
      try {
        setLoadingFonts(true);
        setFontsError(null);
        const response = await fetch("/api/book-fonts", { cache: "no-store" });
        if (!response.ok) {
          const detail = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(detail.error || "Unable to load fonts");
        }
        const payload = (await response.json()) as { fonts?: BookFontOption[] };
        if (!ignore) {
          setAvailableFonts(payload.fonts ?? []);
        }
      } catch (err) {
        if (!ignore) {
          setAvailableFonts([]);
          setFontsError(err instanceof Error ? err.message : "Unable to load fonts");
        }
      } finally {
        if (!ignore) {
          setLoadingFonts(false);
        }
      }
    }

    void loadBookFonts();
    return () => {
      ignore = true;
    };
  }, []);

  const needsOverlayOpacity = !["image-only", "dictionary"].includes(mode);
  const needsFacts = ["facts", "facts-both", "full-fact"].includes(mode);
  const needsList = ["list"].includes(mode);
  const needsListDescription = ["list-description", "list-description-even"].includes(mode);
  const opacityLabel = mode === "full-fact" ? "Fact Card Opacity" : "Overlay Opacity";
  const currentOpacity = mode === "full-fact" ? fullFactOpacity : overlayOpacity;
  const fullFactFontChoices = useMemo(
    () => [DEFAULT_FULL_FACT_FONT_OPTION, ...availableFonts],
    [availableFonts]
  );
  const fullFactFontSourceGroups = useMemo(
    () => buildFontSourceGroups(fullFactFontChoices),
    [fullFactFontChoices]
  );
  const fullFactFontSourceMap = useMemo(
    () => new Map(fullFactFontSourceGroups.map((group) => [group.key, group])),
    [fullFactFontSourceGroups]
  );
  const selectedFullFactFontSource = useMemo(
    () => fullFactFontSourceMap.get(fullFactFontSourceKey) ?? fullFactFontSourceGroups[0] ?? null,
    [fullFactFontSourceGroups, fullFactFontSourceKey, fullFactFontSourceMap]
  );
  const selectedFullFactFont = useMemo(
    () =>
      selectedFullFactFontSource?.variants.find((variant) => variant.id === fullFactBoxFontId) ??
      selectedFullFactFontSource?.variants[0] ??
      DEFAULT_FULL_FACT_FONT_OPTION,
    [fullFactBoxFontId, selectedFullFactFontSource]
  );
  const customFontPreviewCss = useMemo(
    () =>
      availableFonts
        .map(
          (font) =>
            `@font-face { font-family: "${font.previewFamily}"; src: url("${font.previewUrl}") format("${font.format}"); font-display: swap; }`
        )
        .join("\n"),
    [availableFonts]
  );

  useEffect(() => {
    const selectedSource = fullFactFontSourceMap.get(fullFactFontSourceKey);
    if (!selectedSource) {
      const fallback = fullFactFontSourceGroups[0] ?? null;
      if (!fallback) {
        return;
      }
      setFullFactFontSourceKey(fallback.key);
      setFullFactFontSourceSearch(fallback.label);
      setFullFactBoxFontId(fallback.variants[0]?.id ?? DEFAULT_FULL_FACT_FONT_ID);
      return;
    }

    if (!selectedSource.variants.some((variant) => variant.id === fullFactBoxFontId)) {
      setFullFactBoxFontId(selectedSource.variants[0]?.id ?? DEFAULT_FULL_FACT_FONT_ID);
    }
  }, [
    fullFactBoxFontId,
    fullFactFontSourceGroups,
    fullFactFontSourceKey,
    fullFactFontSourceMap,
  ]);

  const handleFullFactFontSourceChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setFullFactFontSourceSearch(nextValue);
      const match = findFontSourceGroupByLabel(fullFactFontSourceGroups, nextValue);
      if (!match) {
        return;
      }
      setFullFactFontSourceKey(match.key);
      setFullFactBoxFontId(match.variants[0]?.id ?? DEFAULT_FULL_FACT_FONT_ID);
    },
    [fullFactFontSourceGroups]
  );

  const handleFullFactFontSourceBlur = useCallback(() => {
    const match = findFontSourceGroupByLabel(fullFactFontSourceGroups, fullFactFontSourceSearch);
    if (match) {
      setFullFactFontSourceKey(match.key);
      setFullFactFontSourceSearch(match.label);
      if (!match.variants.some((variant) => variant.id === fullFactBoxFontId)) {
        setFullFactBoxFontId(match.variants[0]?.id ?? DEFAULT_FULL_FACT_FONT_ID);
      }
      return;
    }

    const fallback = selectedFullFactFontSource ?? fullFactFontSourceGroups[0] ?? null;
    if (fallback) {
      setFullFactFontSourceSearch(fallback.label);
    }
  }, [
    fullFactBoxFontId,
    fullFactFontSourceGroups,
    fullFactFontSourceSearch,
    selectedFullFactFontSource,
  ]);

  const payload = useMemo(() => {
    const safePageCount = Number.isFinite(pageCount) ? pageCount : 59;
    const base: Record<string, unknown> = {
      mode,
      imageLibrary,
      pageSize,
      pageCount: Math.max(4, Math.min(200, safePageCount)),
    };
    if (needsOverlayOpacity) {
      base.overlayOpacity = currentOpacity;
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
      if (fullFactBoxFontId !== DEFAULT_FULL_FACT_FONT_ID) {
        base.fullFactBoxFontId = fullFactBoxFontId;
      }
    }
    if (mode === "dictionary") {
      base.targetImageSize = targetImageSize * 72;
    }
    return base;
  }, [
    mode,
    imageLibrary,
    currentOpacity,
    needsOverlayOpacity,
    needsFacts,
    needsList,
    needsListDescription,
    facts,
    list,
    listDescription,
    factsPerPage,
    fullFactBoxFontId,
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
            <h2 className="text-xl font-semibold text-zinc-900">Choose a layout</h2>
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
                  <TemplatePreview mode={item.value} accent={item.accent} />
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <span className="text-sm font-semibold text-zinc-900">{item.label}</span>
                    {item.description ? <p className="text-xs text-zinc-700">{item.description}</p> : null}
                    <span
                      className={`mt-auto text-xs font-medium ${
                        isActive ? "text-emerald-600" : "invisible"
                      }`}
                    >
                      Selected
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigateToStep(2)}
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
            <p className="text-sm text-zinc-700">Pick a trim size and how many pages to include in the PDF.</p>
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
          </div>
          {mode === "full-fact" && (
            <div className="space-y-3">
              {customFontPreviewCss ? <style>{customFontPreviewCss}</style> : null}
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Select Font</label>
              </div>
              {fontsError && <p className="text-sm text-red-600">{fontsError}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-zinc-700">Font</span>
                  <input
                    type="text"
                    list="full-fact-font-source-options"
                    value={fullFactFontSourceSearch}
                    onChange={handleFullFactFontSourceChange}
                    onBlur={handleFullFactFontSourceBlur}
                    placeholder="Search font pack..."
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
                  />
                  <datalist id="full-fact-font-source-options">
                    {fullFactFontSourceGroups.map((group) => (
                      <option key={group.key} value={group.label} />
                    ))}
                  </datalist>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-zinc-700">Variety</span>
                  <select
                    value={selectedFullFactFont.id}
                    onChange={(event) => setFullFactBoxFontId(event.target.value)}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
                  >
                    {(selectedFullFactFontSource?.variants ?? [DEFAULT_FULL_FACT_FONT_OPTION]).map((option) => (
                      <option key={option.id} value={option.id}>
                        {formatFontVariantLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-900">
                    {selectedFullFactFontSource?.label ?? DEFAULT_FULL_FACT_FONT_SOURCE_LABEL}
                  </p>
                  <p className="text-xs text-zinc-500">{formatFontVariantLabel(selectedFullFactFont)}</p>
                </div>
                <p className="mt-3 text-2xl leading-snug text-zinc-800" style={{ fontFamily: selectedFullFactFont.previewFamily }}>
                  {FULL_FACT_FONT_PREVIEW_TEXT}
                </p>
              </div>
              {loadingFonts || availableFonts.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  {loadingFonts
                    ? "Loading fonts from ./fonts..."
                    : "Add .ttf, .otf, or zipped font families to ./fonts to unlock custom font choices."}
                </p>
              ) : null}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => navigateToStep(1)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
            >
              Back to templates
            </button>
            <button
              type="button"
              onClick={() => navigateToStep(3)}
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
              onClick={() => navigateToStep(2)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
            >
              Back: Page specs
            </button>
            <button
              type="button"
              onClick={() => navigateToStep(4)}
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
              <span>{opacityLabel}</span>
              <span className="text-xs text-zinc-700">{currentOpacity.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={currentOpacity}
              onChange={(event) => {
                const nextOpacity = Number(event.target.value);
                if (mode === "full-fact") {
                  setFullFactOpacity(nextOpacity);
                } else {
                  setOverlayOpacity(nextOpacity);
                }
              }}
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
              placeholder={mode === "full-fact"
                ? STACKED_EVEN_FACTS_PLACEHOLDER
                : `[
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
              onClick={() => navigateToStep(3)}
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

function parseWizardStep(value: string | null): WizardStep {
  switch (value) {
    case "2":
      return 2;
    case "3":
      return 3;
    case "4":
      return 4;
    default:
      return 1;
  }
}

function TemplatePreview({ mode, accent }: { mode: ModeValue; accent: string }) {
  if (mode === "full-fact") {
    return (
      <div aria-hidden="true" className="relative aspect-[1595/821] overflow-hidden rounded-t-2xl bg-zinc-100">
        <Image
          src="/even-stacked-facts.png"
          alt="Stacked Even Facts preview"
          fill
          priority
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover object-left-top"
        />
      </div>
    );
  }

  return (
    <div className={`relative aspect-[4/3] overflow-hidden rounded-t-2xl bg-gradient-to-br ${accent}`}>
      <div className="absolute inset-4 rounded-xl bg-white/70 backdrop-blur-sm" />
      <div className="absolute inset-4 flex items-center justify-center rounded-xl border border-dashed border-white/60 text-sm font-medium text-white/90">
        Preview
      </div>
    </div>
  );
}

function buildFontSourceGroups(options: BookFontOption[]) {
  const groups = new Map<string, FontSourceGroup>();
  for (const option of options) {
    const key = getFontSourceKey(option);
    const existing = groups.get(key);
    if (existing) {
      existing.variants.push(option);
      existing.searchText = `${existing.searchText} ${option.fullName} ${option.subfamilyName}`.trim();
      continue;
    }
    groups.set(key, {
      key,
      label: getFontSourceLabel(option),
      searchText: `${getFontSourceLabel(option)} ${option.sourceLabel} ${option.fullName} ${option.familyName} ${option.subfamilyName}`.toLowerCase(),
      variants: [option],
    });
  }

  const sortedGroups = Array.from(groups.values()).map((group) => ({
    ...group,
    variants: [...group.variants].sort((left, right) =>
      formatFontVariantLabel(left).localeCompare(formatFontVariantLabel(right), undefined, { sensitivity: "base" })
    ),
  }));

  sortedGroups.sort((left, right) => {
    if (left.key === DEFAULT_FULL_FACT_FONT_SOURCE_KEY) {
      return -1;
    }
    if (right.key === DEFAULT_FULL_FACT_FONT_SOURCE_KEY) {
      return 1;
    }
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
  });

  return sortedGroups;
}

function getFontSourceKey(option: BookFontOption) {
  if (option.id === DEFAULT_FULL_FACT_FONT_ID) {
    return DEFAULT_FULL_FACT_FONT_SOURCE_KEY;
  }
  return option.sourceType === "zip" ? `zip:${option.sourceLabel}` : `file:${option.sourceLabel}`;
}

function getFontSourceLabel(option: BookFontOption) {
  if (option.id === DEFAULT_FULL_FACT_FONT_ID) {
    return DEFAULT_FULL_FACT_FONT_SOURCE_LABEL;
  }
  if (option.sourceType === "zip") {
    return stripExtension(option.sourceLabel);
  }
  return option.familyName || stripExtension(option.fileName);
}

function formatFontVariantLabel(option: BookFontOption) {
  if (option.id === DEFAULT_FULL_FACT_FONT_ID) {
    return option.subfamilyName || "Regular";
  }
  const variant = option.subfamilyName || "Regular";
  if (option.sourceType === "zip" && option.fullName && option.fullName !== option.label) {
    return `${option.fullName} - ${variant}`;
  }
  if (option.fullName && option.fullName !== option.familyName) {
    return option.fullName;
  }
  return variant;
}

function findFontSourceGroupByLabel(groups: FontSourceGroup[], value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return groups.find((group) => group.label.toLowerCase() === normalized) ?? null;
}

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/, "");
}
