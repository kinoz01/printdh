"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { importBrowserFontFile, listBrowserFonts } from "@/lib/book/browser-font-library";
import {
  DEFAULT_NUMBER_BADGE_COLOR,
  NUMBER_BADGE_COLOR_OPTIONS,
  type NumberBadgeColorKey,
} from "@/lib/book/number-badge-colors";
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
  {
    value: "described-pictures",
    label: "Described Pictures",
    description: "A centered caption box at the bottom of every image page.",
    accent: "from-stone-300 via-neutral-200 to-zinc-300",
  },
  {
    value: "even-described-pictures",
    label: "Even Described Pictures",
    description: "A centered caption box appears on even pages only.",
    accent: "from-sky-200 via-cyan-100 to-blue-100",
  },
  {
    value: "fully-described-images",
    label: "Fully Described Pictures",
    description: "A left-aligned title and description sit together inside each image caption box.",
    accent: "from-amber-200 via-orange-100 to-stone-100",
  },
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
  | "described-pictures"
  | "even-described-pictures"
  | "fully-described-images"
  | "image-only"
  | "full-fact"
  | "dictionary";

const DEFAULT_DESCRIBED_PICTURE_MAX_BOX_WIDTH = 6.2;
const DEFAULT_FULLY_DESCRIBED_MAX_BOX_WIDTH = 7;

function getDefaultDescribedPictureMaxBoxWidth(mode: ModeValue) {
  return mode === "fully-described-images"
    ? DEFAULT_FULLY_DESCRIBED_MAX_BOX_WIDTH
    : DEFAULT_DESCRIBED_PICTURE_MAX_BOX_WIDTH;
}

const PAGE_SIZES = [
  { value: "square", label: "Square", description: "8.64 × 8.76 in" },
  { value: "us-letter", label: "US Letter", description: "8.625 × 11.25 in" },
] as const;
type PageSizeValue = (typeof PAGE_SIZES)[number]["value"];

type WizardStep = 1 | 2 | 3 | 4;
type BookFontFormat = "truetype" | "opentype";
type DescribedPictureTextAlignment = "center" | "left";

interface BookFontOption {
  id: string;
  label: string;
  fileName: string;
  fullName: string;
  familyName: string;
  subfamilyName: string;
  format: BookFontFormat;
  mimeType: string;
  previewFamily: string;
  previewUrl: string;
  sourceLabel: string;
  sourceType: "file" | "zip";
  entryPath: string | null;
  storageScope: "server" | "browser";
  dataBase64?: string;
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
  mimeType: "font/ttf",
  previewFamily: '"Times New Roman", Georgia, serif',
  previewUrl: "",
  sourceLabel: "PDF built-in",
  sourceType: "file",
  entryPath: null,
  storageScope: "server",
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
const DESCRIBED_PICTURES_PLACEHOLDER = `[
  "1964 Pontiac GTO",
  "1965 Shelby GT350",
  "1966 Oldsmobile 442",
  "1967 Chevrolet Camaro Z/28",
  "1967 Pontiac Firebird",
  "1968 Dodge Charger R/T",
  "1968 Plymouth Road Runner",
  "1969 Ford Mustang Boss 429",
  "1969 Chevrolet Chevelle SS 396",
  "1969 Dodge Super Bee",
  "1969 AMC AMX",
  "1969 Pontiac GTO Judge",
  "1969 Mercury Cougar Eliminator",
  "1970 Plymouth Hemi 'Cuda",
  "1970 Dodge Challenger R/T",
  "1970 Buick GSX",
  "1970 Chevrolet Nova SS",
  "1970 Oldsmobile 442 W-30",
  "1970 Ford Torino Cobra",
  "1970 Pontiac Trans Am",
  "1970 AMC Rebel Machine",
  "1970 Plymouth Superbird",
  "1970 Dodge Charger Daytona",
  "1971 Plymouth GTX",
  "1971 Ford Mustang Mach 1",
  "1971 Chevrolet Monte Carlo SS",
  "1971 Dodge Demon 340",
  "1971 Pontiac GTO Judge",
  "1971 AMC Javelin AMX",
  "1972 Chevrolet Camaro SS",
  "1972 Dodge Challenger Rallye",
  "1972 Plymouth Duster 340",
  "1973 Pontiac Firebird Formula",
  "1973 Ford Mustang Mach 1",
  "1973 Chevrolet Chevelle Laguna",
  "1973 Dodge Charger SE",
  "1974 Pontiac Trans Am Super Duty",
  "1974 AMC Matador X",
  "1975 Chevrolet Camaro LT",
  "1976 Pontiac Firebird Formula",
  "1977 Dodge Charger Daytona",
  "1977 Pontiac Trans Am",
  "1978 Chevrolet Camaro Z28",
  "1978 Ford Mustang II King Cobra",
  "1979 Pontiac Trans Am 10th Anniversary",
  "1980 Chevrolet Camaro Z28",
  "1981 Pontiac Firebird Turbo Trans Am",
  "1982 Chevrolet Camaro Z28",
  "1984 Ford Mustang SVO",
  "1985 Chevrolet Camaro IROC-Z",
  "1987 Buick GNX",
  "1987 Ford Mustang GT",
  "1990 Chevrolet Corvette ZR-1",
  "1991 Ford Mustang LX 5.0",
  "1993 Chevrolet Camaro Z28",
  "1993 Ford Mustang SVT Cobra",
  "1996 Chevrolet Impala SS",
  "1997 Pontiac Firebird WS6",
  "1999 Ford Mustang SVT Cobra",
  "2000 Chevrolet Camaro SS"
]`;
const FULLY_DESCRIBED_IMAGES_PLACEHOLDER = `[
  {
    "title": "Espresso 🇮🇹",
    "description": "Hot water is pushed through finely ground coffee under pressure, creating a small, bold shot with a golden crema."
  },
  {
    "title": "Americano 🇮🇹",
    "description": "A shot of espresso is stretched with hot water, giving it a smoother taste while keeping the espresso character."
  },
  {
    "title": "Cappuccino 🇮🇹",
    "description": "Espresso is topped with steamed milk and a thick layer of foam for a creamy coffee with a light finish."
  },
  {
    "title": "Latte 🇮🇹",
    "description": "Espresso blends with plenty of warm steamed milk, creating a soft and mellow coffee drink."
  },
  {
    "title": "Flat White 🇦🇺",
    "description": "A strong espresso base is covered with silky microfoam, giving a smooth texture and rich coffee taste."
  },
  {
    "title": "Macchiato 🇮🇹",
    "description": "A sharp espresso shot is finished with just a small touch of milk foam on top."
  },
  {
    "title": "Mocha 🇮🇹",
    "description": "Espresso, chocolate, and steamed milk come together for a warm coffee drink with a sweet cocoa flavor."
  },
  {
    "title": "Cortado 🇪🇸",
    "description": "Espresso is softened with an equal amount of warm milk, keeping the drink small, smooth, and balanced."
  },
  {
    "title": "Ristretto 🇮🇹",
    "description": "This shorter espresso uses less water, giving a thicker, sweeter, and more intense coffee shot."
  },
  {
    "title": "Lungo 🇮🇹",
    "description": "An espresso shot is pulled longer with extra water, creating a larger cup with a lighter but deeper taste."
  },
  {
    "title": "Turkish Coffee 🇹🇷",
    "description": "Very fine coffee is slowly heated with water in a cezve until a rich foam rises to the top."
  },
  {
    "title": "Arabic Coffee 🇸🇦",
    "description": "Light-roast coffee is gently boiled with cardamom, then served in small cups with a fragrant taste."
  },
  {
    "title": "Moroccan Spiced Coffee 🇲🇦",
    "description": "Coffee is brewed with spices like cinnamon, cardamom, ginger, and nutmeg for a warm aromatic flavor."
  },
  {
    "title": "Vietnamese Iced Coffee 🇻🇳",
    "description": "Strong coffee drips slowly over sweetened condensed milk, then gets poured over ice for a rich cold drink."
  },
  {
    "title": "Vietnamese Egg Coffee 🇻🇳",
    "description": "Strong coffee is topped with whipped egg yolk and condensed milk, creating a creamy dessert-like cup."
  },
  {
    "title": "Cafe au Lait 🇫🇷",
    "description": "Strong brewed coffee is mixed with hot milk for a simple, smooth, and comforting French-style drink."
  },
  {
    "title": "Cafe de Olla 🇲🇽",
    "description": "Coffee is simmered with cinnamon and piloncillo or brown sugar, often in a clay pot for a rustic taste."
  },
  {
    "title": "Cuban Coffee 🇨🇺",
    "description": "Strong espresso is mixed with whipped sugar foam, giving it a bold body and sweet creamy top."
  },
  {
    "title": "Cafe Bombon 🇪🇸",
    "description": "Espresso is poured over sweetened condensed milk, forming beautiful layers in a small glass."
  },
  {
    "title": "Irish Coffee 🇮🇪",
    "description": "Hot coffee is mixed with sugar and Irish whiskey, then finished with a soft layer of cream."
  },
  {
    "title": "Affogato 🇮🇹",
    "description": "A hot espresso shot is poured over vanilla ice cream or gelato, melting it into a simple coffee dessert."
  },
  {
    "title": "Moka Pot Coffee 🇮🇹",
    "description": "Ground coffee brews on the stove as steam pressure pushes water upward through a moka pot."
  },
  {
    "title": "French Press Coffee 🇫🇷",
    "description": "Coarse coffee grounds steep in hot water before being pressed down with a metal filter for a full-bodied cup."
  },
  {
    "title": "Pour Over Coffee 🇯🇵",
    "description": "Hot water is poured slowly over ground coffee in a filter, giving a clean cup with delicate flavor."
  },
  {
    "title": "Cold Brew 🇳🇱",
    "description": "Coarse coffee grounds steep in cold water for many hours, creating a smooth drink with low bitterness."
  },
  {
    "title": "Nitro Cold Brew 🇺🇸",
    "description": "Cold brew is infused with nitrogen, giving it a creamy texture and a foamy top without adding milk."
  },
  {
    "title": "Greek Frappe 🇬🇷",
    "description": "Instant coffee, sugar, and a little water are shaken into foam, then served cold with ice."
  },
  {
    "title": "Dalgona Coffee 🇰🇷",
    "description": "Instant coffee, sugar, and hot water are whipped into a thick cream and spooned over milk."
  },
  {
    "title": "Ethiopian Coffee 🇪🇹",
    "description": "Freshly roasted coffee is brewed slowly in a jebena pot and served in small cups with a deep aroma."
  },
  {
    "title": "South Indian Filter Coffee 🇮🇳",
    "description": "A strong coffee decoction from a metal filter is mixed with hot milk and sugar, then poured until frothy."
  },
  {
    "title": "Kopi Tubruk 🇮🇩",
    "description": "Ground coffee and hot water are stirred directly in the cup, then left to settle before drinking."
  },
  {
    "title": "Kopi Susu 🇮🇩",
    "description": "Strong coffee is mixed with sweetened condensed milk for a sweet, creamy drink served hot or iced."
  },
  {
    "title": "Kopi Luwak 🇮🇩",
    "description": "These specially processed Indonesian beans are usually brewed simply and served black to highlight their smooth taste."
  },
  {
    "title": "Pharisaer Coffee 🇩🇪",
    "description": "Strong coffee is combined with rum and sugar, then covered with whipped cream instead of being stirred."
  },
  {
    "title": "Mazagran 🇵🇹",
    "description": "Strong coffee is cooled over ice and often brightened with sugar and lemon for a refreshing drink."
  },
  {
    "title": "Cafezinho 🇧🇷",
    "description": "Finely ground coffee is brewed with sugar and served strong in small cups as a quick Brazilian favorite."
  },
  {
    "title": "Cafe Touba 🇸🇳",
    "description": "Coffee roasted with grains of Selim or cloves is brewed into a spicy and fragrant Senegalese drink."
  },
  {
    "title": "Qahwa 🇦🇪",
    "description": "Light-roast coffee is simmered with cardamom, and sometimes saffron or cloves, then served in tiny cups."
  },
  {
    "title": "Red Eye Coffee 🇺🇸",
    "description": "Regular brewed coffee gets an espresso shot added to it for extra strength and a stronger caffeine kick."
  },
  {
    "title": "Breve 🇺🇸",
    "description": "Espresso is blended with steamed half-and-half, making the drink thicker, richer, and creamier than a latte."
  }
]`;

export function GeneratorApp(props: GeneratorAppProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [mode, setMode] = useState<ModeValue>("full-fact");
  const [facts, setFacts] = useState(props.initialFacts?.trim() ? props.initialFacts : STACKED_EVEN_FACTS_PLACEHOLDER);
  const [list, setList] = useState(props.initialList ?? "");
  const [listDescription, setListDescription] = useState(props.initialListDescription ?? "");
  const [imageLibrary] = useState(props.defaultImageLibrary ?? "../images");
  const [pageSize, setPageSize] = useState<PageSizeValue>("square");
  const [pageCount, setPageCount] = useState(40);
  const [overlayOpacity, setOverlayOpacity] = useState(0.9);
  const [numberBadgeColor, setNumberBadgeColor] = useState<NumberBadgeColorKey>(DEFAULT_NUMBER_BADGE_COLOR);
  const [describedPictureTextAlignment, setDescribedPictureTextAlignment] =
    useState<DescribedPictureTextAlignment>("center");
  const [describedPictureMaxBoxWidth, setDescribedPictureMaxBoxWidth] = useState(
    getDefaultDescribedPictureMaxBoxWidth("full-fact")
  );
  const [fullFactOpacity, setFullFactOpacity] = useState(0.9);
  const [factsPerPage, setFactsPerPage] = useState(4);
  const [targetImageSize, setTargetImageSize] = useState(7.7);
  const [serverFonts, setServerFonts] = useState<BookFontOption[]>([]);
  const [browserFonts, setBrowserFonts] = useState<BookFontOption[]>([]);
  const [loadingFonts, setLoadingFonts] = useState(false);
  const [fontsError, setFontsError] = useState<string | null>(null);
  const [fullFactFontSourceKey, setFullFactFontSourceKey] = useState(DEFAULT_FULL_FACT_FONT_SOURCE_KEY);
  const [fullFactFontSourceSearch, setFullFactFontSourceSearch] = useState(DEFAULT_FULL_FACT_FONT_SOURCE_LABEL);
  const [isFullFactFontSourceMenuOpen, setIsFullFactFontSourceMenuOpen] = useState(false);
  const [isFullFactFontSourceFiltering, setIsFullFactFontSourceFiltering] = useState(false);
  const [fullFactBoxFontId, setFullFactBoxFontId] = useState(DEFAULT_FULL_FACT_FONT_ID);
  const [fullyDescribedTitleFontSourceKey, setFullyDescribedTitleFontSourceKey] =
    useState(DEFAULT_FULL_FACT_FONT_SOURCE_KEY);
  const [fullyDescribedTitleFontSourceSearch, setFullyDescribedTitleFontSourceSearch] =
    useState(DEFAULT_FULL_FACT_FONT_SOURCE_LABEL);
  const [isFullyDescribedTitleFontSourceMenuOpen, setIsFullyDescribedTitleFontSourceMenuOpen] = useState(false);
  const [isFullyDescribedTitleFontSourceFiltering, setIsFullyDescribedTitleFontSourceFiltering] = useState(false);
  const [fullyDescribedTitleFontId, setFullyDescribedTitleFontId] = useState(DEFAULT_FULL_FACT_FONT_ID);
  const [fullFactFontVariantSearch, setFullFactFontVariantSearch] = useState(
    formatFontVariantLabel(DEFAULT_FULL_FACT_FONT_OPTION, DEFAULT_FULL_FACT_FONT_SOURCE_LABEL)
  );
  const [isFullFactFontVariantMenuOpen, setIsFullFactFontVariantMenuOpen] = useState(false);
  const [isFullFactFontVariantFiltering, setIsFullFactFontVariantFiltering] = useState(false);
  const [fullyDescribedTitleFontVariantSearch, setFullyDescribedTitleFontVariantSearch] = useState(
    formatFontVariantLabel(DEFAULT_FULL_FACT_FONT_OPTION, DEFAULT_FULL_FACT_FONT_SOURCE_LABEL)
  );
  const [isFullyDescribedTitleFontVariantMenuOpen, setIsFullyDescribedTitleFontVariantMenuOpen] = useState(false);
  const [isFullyDescribedTitleFontVariantFiltering, setIsFullyDescribedTitleFontVariantFiltering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const browserFontFileInputRef = useRef<HTMLInputElement | null>(null);
  const fullFactFontSourceInputRef = useRef<HTMLInputElement | null>(null);
  const fullFactFontVariantInputRef = useRef<HTMLInputElement | null>(null);
  const fullyDescribedTitleFontSourceInputRef = useRef<HTMLInputElement | null>(null);
  const fullyDescribedTitleFontVariantInputRef = useRef<HTMLInputElement | null>(null);
  const searchParams = useSearchParams();

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

  const handleModeSelect = useCallback((nextMode: ModeValue) => {
    setMode(nextMode);
    if (
      nextMode === "described-pictures" ||
      nextMode === "even-described-pictures" ||
      nextMode === "fully-described-images"
    ) {
      setDescribedPictureMaxBoxWidth(getDefaultDescribedPictureMaxBoxWidth(nextMode));
    }
  }, []);

  useEffect(() => {
    setStep(parseWizardStep(searchParams.get("step")));
  }, [searchParams]);

  const loadBrowserStoredFonts = useCallback(async () => {
    const fonts = await listBrowserFonts();
    setBrowserFonts(fonts);
    return fonts;
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadBookFonts() {
      try {
        setLoadingFonts(true);
        setFontsError(null);
        const [serverResult, browserResult] = await Promise.allSettled([
          fetch("/api/book-fonts", { cache: "no-store" }),
          listBrowserFonts(),
        ]);

        let nextError: string | null = null;

        if (!ignore) {
          if (serverResult.status === "fulfilled") {
            const response = serverResult.value;
            if (!response.ok) {
              const detail = (await response.json().catch(() => ({}))) as { error?: string };
              nextError = detail.error || "Unable to load fonts";
              setServerFonts([]);
            } else {
              const payload = (await response.json()) as { fonts?: Array<Omit<BookFontOption, "storageScope">> };
              setServerFonts((payload.fonts ?? []).map((font) => ({ ...font, storageScope: "server" })));
            }
          } else {
            nextError = serverResult.reason instanceof Error ? serverResult.reason.message : "Unable to load fonts";
            setServerFonts([]);
          }

          if (browserResult.status === "fulfilled") {
            setBrowserFonts(browserResult.value);
          } else {
            nextError = browserResult.reason instanceof Error ? browserResult.reason.message : nextError;
            setBrowserFonts([]);
          }

          setFontsError(nextError);
        } else if (browserResult.status === "fulfilled") {
          revokeFontPreviewUrls(browserResult.value);
        }
      } catch (err) {
        if (!ignore) {
          setServerFonts([]);
          setBrowserFonts([]);
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

  useEffect(() => {
    return () => {
      revokeFontPreviewUrls(browserFonts);
    };
  }, [browserFonts]);

  const needsOverlayOpacity = !["image-only", "dictionary"].includes(mode);
  const needsFacts = ["facts", "facts-both", "full-fact"].includes(mode);
  const isBasicDescribedPicturesMode = ["described-pictures", "even-described-pictures"].includes(mode);
  const isFullyDescribedImagesMode = mode === "fully-described-images";
  const isCaptionBoxMode = isBasicDescribedPicturesMode || isFullyDescribedImagesMode;
  const needsList = ["list", "described-pictures", "even-described-pictures"].includes(mode);
  const needsListDescription = ["list-description", "list-description-even", "fully-described-images"].includes(mode);
  const supportsCircleColor = !isCaptionBoxMode;
  const supportsTextFontSelection = mode === "full-fact" || isCaptionBoxMode;
  const supportsCaptionTextAlignment = isBasicDescribedPicturesMode;
  const opacityLabel = mode === "full-fact" ? "Fact Card Opacity" : "Overlay Opacity";
  const currentOpacity = mode === "full-fact" ? fullFactOpacity : overlayOpacity;
  const availableFonts = useMemo(() => [...serverFonts, ...browserFonts], [browserFonts, serverFonts]);
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
  const selectedFullyDescribedTitleFontSource = useMemo(
    () =>
      fullFactFontSourceMap.get(fullyDescribedTitleFontSourceKey) ?? fullFactFontSourceGroups[0] ?? null,
    [fullFactFontSourceGroups, fullFactFontSourceMap, fullyDescribedTitleFontSourceKey]
  );
  const selectedFullFactFont = useMemo(
    () =>
      selectedFullFactFontSource?.variants.find((variant) => variant.id === fullFactBoxFontId) ??
      selectedFullFactFontSource?.variants[0] ??
      DEFAULT_FULL_FACT_FONT_OPTION,
    [fullFactBoxFontId, selectedFullFactFontSource]
  );
  const selectedFullyDescribedTitleFont = useMemo(
    () =>
      selectedFullyDescribedTitleFontSource?.variants.find((variant) => variant.id === fullyDescribedTitleFontId) ??
      selectedFullyDescribedTitleFontSource?.variants[0] ??
      DEFAULT_FULL_FACT_FONT_OPTION,
    [fullyDescribedTitleFontId, selectedFullyDescribedTitleFontSource]
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
  const filteredFullFactFontSourceGroups = useMemo(() => {
    if (!isFullFactFontSourceFiltering) {
      return fullFactFontSourceGroups;
    }
    const query = fullFactFontSourceSearch.trim().toLowerCase();
    if (!query) {
      return fullFactFontSourceGroups;
    }
    return fullFactFontSourceGroups.filter((group) => group.searchText.includes(query));
  }, [fullFactFontSourceGroups, fullFactFontSourceSearch, isFullFactFontSourceFiltering]);
  const filteredFullyDescribedTitleFontSourceGroups = useMemo(() => {
    if (!isFullyDescribedTitleFontSourceFiltering) {
      return fullFactFontSourceGroups;
    }
    const query = fullyDescribedTitleFontSourceSearch.trim().toLowerCase();
    if (!query) {
      return fullFactFontSourceGroups;
    }
    return fullFactFontSourceGroups.filter((group) => group.searchText.includes(query));
  }, [
    fullFactFontSourceGroups,
    fullyDescribedTitleFontSourceSearch,
    isFullyDescribedTitleFontSourceFiltering,
  ]);
  const fullFactFontVariants = useMemo(
    () => selectedFullFactFontSource?.variants ?? [DEFAULT_FULL_FACT_FONT_OPTION],
    [selectedFullFactFontSource]
  );
  const fullyDescribedTitleFontVariants = useMemo(
    () => selectedFullyDescribedTitleFontSource?.variants ?? [DEFAULT_FULL_FACT_FONT_OPTION],
    [selectedFullyDescribedTitleFontSource]
  );
  const filteredFullFactFontVariants = useMemo(() => {
    if (!isFullFactFontVariantFiltering) {
      return fullFactFontVariants;
    }
    const query = fullFactFontVariantSearch.trim().toLowerCase();
    if (!query) {
      return fullFactFontVariants;
    }
    return fullFactFontVariants.filter((variant) =>
      buildFontVariantSearchText(variant, selectedFullFactFontSource?.label).includes(query)
    );
  }, [fullFactFontVariantSearch, fullFactFontVariants, isFullFactFontVariantFiltering, selectedFullFactFontSource]);
  const filteredFullyDescribedTitleFontVariants = useMemo(() => {
    if (!isFullyDescribedTitleFontVariantFiltering) {
      return fullyDescribedTitleFontVariants;
    }
    const query = fullyDescribedTitleFontVariantSearch.trim().toLowerCase();
    if (!query) {
      return fullyDescribedTitleFontVariants;
    }
    return fullyDescribedTitleFontVariants.filter((variant) =>
      buildFontVariantSearchText(variant, selectedFullyDescribedTitleFontSource?.label).includes(query)
    );
  }, [
    fullyDescribedTitleFontVariantSearch,
    fullyDescribedTitleFontVariants,
    isFullyDescribedTitleFontVariantFiltering,
    selectedFullyDescribedTitleFontSource,
  ]);

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

  useEffect(() => {
    const selectedSource = fullFactFontSourceMap.get(fullyDescribedTitleFontSourceKey);
    if (!selectedSource) {
      const fallback = fullFactFontSourceGroups[0] ?? null;
      if (!fallback) {
        return;
      }
      setFullyDescribedTitleFontSourceKey(fallback.key);
      setFullyDescribedTitleFontSourceSearch(fallback.label);
      setFullyDescribedTitleFontId(fallback.variants[0]?.id ?? DEFAULT_FULL_FACT_FONT_ID);
      return;
    }

    if (!selectedSource.variants.some((variant) => variant.id === fullyDescribedTitleFontId)) {
      setFullyDescribedTitleFontId(selectedSource.variants[0]?.id ?? DEFAULT_FULL_FACT_FONT_ID);
    }
  }, [
    fullFactFontSourceGroups,
    fullFactFontSourceMap,
    fullyDescribedTitleFontId,
    fullyDescribedTitleFontSourceKey,
  ]);

  useEffect(() => {
    if (isFullFactFontVariantMenuOpen || isFullFactFontVariantFiltering) {
      return;
    }
    setFullFactFontVariantSearch(formatFontVariantLabel(selectedFullFactFont, selectedFullFactFontSource?.label));
  }, [
    isFullFactFontVariantFiltering,
    isFullFactFontVariantMenuOpen,
    selectedFullFactFont,
    selectedFullFactFontSource,
  ]);

  useEffect(() => {
    if (isFullyDescribedTitleFontVariantMenuOpen || isFullyDescribedTitleFontVariantFiltering) {
      return;
    }
    setFullyDescribedTitleFontVariantSearch(
      formatFontVariantLabel(selectedFullyDescribedTitleFont, selectedFullyDescribedTitleFontSource?.label)
    );
  }, [
    isFullyDescribedTitleFontVariantFiltering,
    isFullyDescribedTitleFontVariantMenuOpen,
    selectedFullyDescribedTitleFont,
    selectedFullyDescribedTitleFontSource,
  ]);

  const selectFullFactFontSource = useCallback(
    (group: FontSourceGroup) => {
      const nextVariant =
        group.variants.find((variant) => variant.id === fullFactBoxFontId) ??
        group.variants[0] ??
        DEFAULT_FULL_FACT_FONT_OPTION;
      setFullFactFontSourceKey(group.key);
      setFullFactFontSourceSearch(group.label);
      setFullFactBoxFontId(nextVariant.id);
      setFullFactFontVariantSearch(formatFontVariantLabel(nextVariant, group.label));
      setIsFullFactFontSourceMenuOpen(false);
      setIsFullFactFontSourceFiltering(false);
      setIsFullFactFontVariantMenuOpen(false);
      setIsFullFactFontVariantFiltering(false);
    },
    [fullFactBoxFontId]
  );

  const selectFullFactFontVariant = useCallback(
    (variant: BookFontOption) => {
      setFullFactBoxFontId(variant.id);
      setFullFactFontVariantSearch(formatFontVariantLabel(variant, selectedFullFactFontSource?.label));
      setIsFullFactFontVariantMenuOpen(false);
      setIsFullFactFontVariantFiltering(false);
    },
    [selectedFullFactFontSource]
  );

  const handleFullFactFontSourceChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setFullFactFontSourceSearch(nextValue);
      setIsFullFactFontSourceMenuOpen(true);
      setIsFullFactFontSourceFiltering(true);
      const match = findFontSourceGroupByLabel(fullFactFontSourceGroups, nextValue);
      if (!match) {
        return;
      }
      selectFullFactFontSource(match);
    },
    [fullFactFontSourceGroups, selectFullFactFontSource]
  );

  const closeFullFactFontSourceMenu = useCallback(() => {
    setIsFullFactFontSourceMenuOpen(false);
    setIsFullFactFontSourceFiltering(false);
    const match = findFontSourceGroupByLabel(fullFactFontSourceGroups, fullFactFontSourceSearch);
    if (match) {
      selectFullFactFontSource(match);
      return;
    }

    const fallback = selectedFullFactFontSource ?? fullFactFontSourceGroups[0] ?? null;
    if (fallback) {
      setFullFactFontSourceSearch(fallback.label);
    }
  }, [
    fullFactFontSourceGroups,
    fullFactFontSourceSearch,
    selectFullFactFontSource,
    selectedFullFactFontSource,
  ]);

  const handleFullFactFontSourceBlur = useCallback(() => {
    window.setTimeout(() => {
      closeFullFactFontSourceMenu();
    }, 0);
  }, [closeFullFactFontSourceMenu]);

  const handleFullFactFontSourceToggle = useCallback(() => {
    if (isFullFactFontSourceMenuOpen) {
      closeFullFactFontSourceMenu();
      return;
    }
    setIsFullFactFontSourceMenuOpen(true);
    setIsFullFactFontSourceFiltering(false);
    fullFactFontSourceInputRef.current?.focus();
  }, [closeFullFactFontSourceMenu, isFullFactFontSourceMenuOpen]);

  const handleFullFactFontVariantFocus = useCallback(() => {
    setIsFullFactFontVariantMenuOpen(true);
    setIsFullFactFontVariantFiltering(false);
  }, []);

  const handleFullFactFontVariantChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setFullFactFontVariantSearch(nextValue);
      setIsFullFactFontVariantMenuOpen(true);
      setIsFullFactFontVariantFiltering(true);
      const match = findFontVariantByLabel(fullFactFontVariants, nextValue, selectedFullFactFontSource?.label);
      if (match) {
        selectFullFactFontVariant(match);
      }
    },
    [fullFactFontVariants, selectFullFactFontVariant, selectedFullFactFontSource]
  );

  const closeFullFactFontVariantMenu = useCallback(() => {
    setIsFullFactFontVariantMenuOpen(false);
    setIsFullFactFontVariantFiltering(false);
    const match = findFontVariantByLabel(
      fullFactFontVariants,
      fullFactFontVariantSearch,
      selectedFullFactFontSource?.label
    );
    if (match) {
      selectFullFactFontVariant(match);
      return;
    }
    setFullFactFontVariantSearch(formatFontVariantLabel(selectedFullFactFont, selectedFullFactFontSource?.label));
  }, [
    fullFactFontVariantSearch,
    fullFactFontVariants,
    selectFullFactFontVariant,
    selectedFullFactFont,
    selectedFullFactFontSource,
  ]);

  const handleFullFactFontVariantBlur = useCallback(() => {
    window.setTimeout(() => {
      closeFullFactFontVariantMenu();
    }, 0);
  }, [closeFullFactFontVariantMenu]);

  const handleFullFactFontVariantToggle = useCallback(() => {
    if (isFullFactFontVariantMenuOpen) {
      closeFullFactFontVariantMenu();
      return;
    }
    setIsFullFactFontVariantMenuOpen(true);
    setIsFullFactFontVariantFiltering(false);
    fullFactFontVariantInputRef.current?.focus();
  }, [closeFullFactFontVariantMenu, isFullFactFontVariantMenuOpen]);

  const selectFullyDescribedTitleFontSource = useCallback(
    (group: FontSourceGroup) => {
      const nextVariant =
        group.variants.find((variant) => variant.id === fullyDescribedTitleFontId) ??
        group.variants[0] ??
        DEFAULT_FULL_FACT_FONT_OPTION;
      setFullyDescribedTitleFontSourceKey(group.key);
      setFullyDescribedTitleFontSourceSearch(group.label);
      setFullyDescribedTitleFontId(nextVariant.id);
      setFullyDescribedTitleFontVariantSearch(formatFontVariantLabel(nextVariant, group.label));
      setIsFullyDescribedTitleFontSourceMenuOpen(false);
      setIsFullyDescribedTitleFontSourceFiltering(false);
      setIsFullyDescribedTitleFontVariantMenuOpen(false);
      setIsFullyDescribedTitleFontVariantFiltering(false);
    },
    [fullyDescribedTitleFontId]
  );

  const selectFullyDescribedTitleFontVariant = useCallback(
    (variant: BookFontOption) => {
      setFullyDescribedTitleFontId(variant.id);
      setFullyDescribedTitleFontVariantSearch(
        formatFontVariantLabel(variant, selectedFullyDescribedTitleFontSource?.label)
      );
      setIsFullyDescribedTitleFontVariantMenuOpen(false);
      setIsFullyDescribedTitleFontVariantFiltering(false);
    },
    [selectedFullyDescribedTitleFontSource]
  );

  const handleFullyDescribedTitleFontSourceChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setFullyDescribedTitleFontSourceSearch(nextValue);
      setIsFullyDescribedTitleFontSourceMenuOpen(true);
      setIsFullyDescribedTitleFontSourceFiltering(true);
      const match = findFontSourceGroupByLabel(fullFactFontSourceGroups, nextValue);
      if (!match) {
        return;
      }
      selectFullyDescribedTitleFontSource(match);
    },
    [fullFactFontSourceGroups, selectFullyDescribedTitleFontSource]
  );

  const closeFullyDescribedTitleFontSourceMenu = useCallback(() => {
    setIsFullyDescribedTitleFontSourceMenuOpen(false);
    setIsFullyDescribedTitleFontSourceFiltering(false);
    const match = findFontSourceGroupByLabel(
      fullFactFontSourceGroups,
      fullyDescribedTitleFontSourceSearch
    );
    if (match) {
      selectFullyDescribedTitleFontSource(match);
      return;
    }

    const fallback = selectedFullyDescribedTitleFontSource ?? fullFactFontSourceGroups[0] ?? null;
    if (fallback) {
      setFullyDescribedTitleFontSourceSearch(fallback.label);
    }
  }, [
    fullFactFontSourceGroups,
    fullyDescribedTitleFontSourceSearch,
    selectFullyDescribedTitleFontSource,
    selectedFullyDescribedTitleFontSource,
  ]);

  const handleFullyDescribedTitleFontSourceBlur = useCallback(() => {
    window.setTimeout(() => {
      closeFullyDescribedTitleFontSourceMenu();
    }, 0);
  }, [closeFullyDescribedTitleFontSourceMenu]);

  const handleFullyDescribedTitleFontSourceToggle = useCallback(() => {
    if (isFullyDescribedTitleFontSourceMenuOpen) {
      closeFullyDescribedTitleFontSourceMenu();
      return;
    }
    setIsFullyDescribedTitleFontSourceMenuOpen(true);
    setIsFullyDescribedTitleFontSourceFiltering(false);
    fullyDescribedTitleFontSourceInputRef.current?.focus();
  }, [closeFullyDescribedTitleFontSourceMenu, isFullyDescribedTitleFontSourceMenuOpen]);

  const handleFullyDescribedTitleFontVariantFocus = useCallback(() => {
    setIsFullyDescribedTitleFontVariantMenuOpen(true);
    setIsFullyDescribedTitleFontVariantFiltering(false);
  }, []);

  const handleFullyDescribedTitleFontVariantChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setFullyDescribedTitleFontVariantSearch(nextValue);
      setIsFullyDescribedTitleFontVariantMenuOpen(true);
      setIsFullyDescribedTitleFontVariantFiltering(true);
      const match = findFontVariantByLabel(
        fullyDescribedTitleFontVariants,
        nextValue,
        selectedFullyDescribedTitleFontSource?.label
      );
      if (match) {
        selectFullyDescribedTitleFontVariant(match);
      }
    },
    [
      fullyDescribedTitleFontVariants,
      selectFullyDescribedTitleFontVariant,
      selectedFullyDescribedTitleFontSource,
    ]
  );

  const closeFullyDescribedTitleFontVariantMenu = useCallback(() => {
    setIsFullyDescribedTitleFontVariantMenuOpen(false);
    setIsFullyDescribedTitleFontVariantFiltering(false);
    const match = findFontVariantByLabel(
      fullyDescribedTitleFontVariants,
      fullyDescribedTitleFontVariantSearch,
      selectedFullyDescribedTitleFontSource?.label
    );
    if (match) {
      selectFullyDescribedTitleFontVariant(match);
      return;
    }
    setFullyDescribedTitleFontVariantSearch(
      formatFontVariantLabel(selectedFullyDescribedTitleFont, selectedFullyDescribedTitleFontSource?.label)
    );
  }, [
    fullyDescribedTitleFontVariantSearch,
    fullyDescribedTitleFontVariants,
    selectFullyDescribedTitleFontVariant,
    selectedFullyDescribedTitleFont,
    selectedFullyDescribedTitleFontSource,
  ]);

  const handleFullyDescribedTitleFontVariantBlur = useCallback(() => {
    window.setTimeout(() => {
      closeFullyDescribedTitleFontVariantMenu();
    }, 0);
  }, [closeFullyDescribedTitleFontVariantMenu]);

  const handleFullyDescribedTitleFontVariantToggle = useCallback(() => {
    if (isFullyDescribedTitleFontVariantMenuOpen) {
      closeFullyDescribedTitleFontVariantMenu();
      return;
    }
    setIsFullyDescribedTitleFontVariantMenuOpen(true);
    setIsFullyDescribedTitleFontVariantFiltering(false);
    fullyDescribedTitleFontVariantInputRef.current?.focus();
  }, [closeFullyDescribedTitleFontVariantMenu, isFullyDescribedTitleFontVariantMenuOpen]);

  const handleBrowserFontUploadClick = useCallback(() => {
    browserFontFileInputRef.current?.click();
  }, []);

  const handleBrowserFontUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      try {
        setLoadingFonts(true);
        setFontsError(null);
        const importedFonts = await importBrowserFontFile(file);
        const refreshedBrowserFonts = await loadBrowserStoredFonts();
        const nextAvailableFonts = [...serverFonts, ...refreshedBrowserFonts];
        const importedFontKey = getFontSourceKey(importedFonts[0]);
        const importedSourceGroup = buildFontSourceGroups([DEFAULT_FULL_FACT_FONT_OPTION, ...nextAvailableFonts]).find(
          (group) => group.key === importedFontKey
        );

        if (importedSourceGroup) {
          const nextVariant = importedSourceGroup.variants[0] ?? DEFAULT_FULL_FACT_FONT_OPTION;
          setFullFactFontSourceKey(importedSourceGroup.key);
          setFullFactFontSourceSearch(importedSourceGroup.label);
          setFullFactBoxFontId(nextVariant.id);
          setFullFactFontVariantSearch(formatFontVariantLabel(nextVariant, importedSourceGroup.label));
        }
      } catch (err) {
        setFontsError(err instanceof Error ? err.message : "Unable to import the font pack.");
      } finally {
        setLoadingFonts(false);
      }
    },
    [loadBrowserStoredFonts, serverFonts]
  );

  const payload = useMemo(() => {
    const safePageCount = Number.isFinite(pageCount) ? pageCount : 59;
    const safeDescribedPictureMaxBoxWidth = Number.isFinite(describedPictureMaxBoxWidth)
      ? Math.min(7, Math.max(3, describedPictureMaxBoxWidth))
      : getDefaultDescribedPictureMaxBoxWidth(mode);
    const base: Record<string, unknown> = {
      mode,
      imageLibrary,
      pageSize,
      pageCount: Math.max(4, Math.min(200, safePageCount)),
      numberBadgeColor,
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
    }
    if (mode === "full-fact" || isCaptionBoxMode) {
      if (selectedFullFactFont.storageScope === "browser" && selectedFullFactFont.dataBase64) {
        base.fullFactUploadedFont = {
          bytesBase64: selectedFullFactFont.dataBase64,
          mimeType: selectedFullFactFont.mimeType,
          fileName: selectedFullFactFont.fileName,
        };
      } else if (fullFactBoxFontId !== DEFAULT_FULL_FACT_FONT_ID) {
        base.fullFactBoxFontId = fullFactBoxFontId;
      }
    }
    if (isFullyDescribedImagesMode) {
      if (selectedFullyDescribedTitleFont.storageScope === "browser" && selectedFullyDescribedTitleFont.dataBase64) {
        base.fullFactTitleUploadedFont = {
          bytesBase64: selectedFullyDescribedTitleFont.dataBase64,
          mimeType: selectedFullyDescribedTitleFont.mimeType,
          fileName: selectedFullyDescribedTitleFont.fileName,
        };
      } else if (fullyDescribedTitleFontId !== DEFAULT_FULL_FACT_FONT_ID) {
        base.fullFactTitleFontId = fullyDescribedTitleFontId;
      }
    }
    if (isCaptionBoxMode) {
      base.describedPictureTextAlignment = describedPictureTextAlignment;
      base.describedPictureMaxBoxWidth = safeDescribedPictureMaxBoxWidth * 72;
    }
    if (mode === "dictionary") {
      base.targetImageSize = targetImageSize * 72;
    }
    return base;
  }, [
    mode,
    isCaptionBoxMode,
    isFullyDescribedImagesMode,
    imageLibrary,
    numberBadgeColor,
    currentOpacity,
    needsOverlayOpacity,
    needsFacts,
    needsList,
    needsListDescription,
    facts,
    list,
    listDescription,
    describedPictureTextAlignment,
    describedPictureMaxBoxWidth,
    factsPerPage,
    fullFactBoxFontId,
    fullyDescribedTitleFontId,
    selectedFullFactFont,
    selectedFullyDescribedTitleFont,
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
  const stepFourTitle = mode === "full-fact" ? "Configure Facts" : `Configure ${selectedMode?.label ?? "the layout"}`;
  return (
    <div className="flex flex-col gap-8">
      {step === 1 && (
        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Step 1</p>
            <h2 className="text-xl font-semibold text-zinc-900">Choose a Layout</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MODES.map((item) => {
              const isActive = item.value === mode;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleModeSelect(item.value)}
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
          {supportsCircleColor && (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-700">Select Circle Color</p>
                <p className="text-xs text-zinc-500">Used for numbered fact circles</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {NUMBER_BADGE_COLOR_OPTIONS.map((option) => {
                  const isActive = option.value === numberBadgeColor;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setNumberBadgeColor(option.value)}
                      aria-pressed={isActive}
                      className={`flex items-center justify-between rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-black ${
                        isActive ? "border-black ring-1 ring-black" : "border-zinc-200 hover:border-black/40"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm"
                          style={{ backgroundColor: option.hex }}
                        >
                          01
                        </span>
                        <span className="text-sm font-semibold text-zinc-900">{option.label}</span>
                      </span>
                      {isActive ? <span className="text-xs font-medium text-emerald-600">Selected</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {isCaptionBoxMode && (
            <div className="space-y-3">
              {supportsCaptionTextAlignment ? (
                <>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-zinc-700">Text Alignment</p>
                    <p className="text-xs text-zinc-500">Choose how the caption text sits inside the box.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      { value: "center", label: "Centered", description: "Balanced caption centered inside the box." },
                      { value: "left", label: "Left Aligned", description: "Caption text starts flush from the left edge." },
                    ] as const).map((option) => {
                      const isActive = option.value === describedPictureTextAlignment;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setDescribedPictureTextAlignment(option.value)}
                          aria-pressed={isActive}
                          className={`flex flex-col gap-1 rounded-2xl border bg-white p-4 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-black ${
                            isActive ? "border-black ring-1 ring-black" : "border-zinc-200 hover:border-black/40"
                          }`}
                        >
                          <span className="text-sm font-semibold text-zinc-900">{option.label}</span>
                          <span className="text-xs text-zinc-600">{option.description}</span>
                          {isActive ? <span className="text-xs font-medium text-emerald-600">Selected</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-700">Text Alignment</p>
                  <p className="text-xs text-zinc-500">This layout keeps the title and description left aligned.</p>
                </div>
              )}
              <label className="flex flex-col gap-2 sm:max-w-xs">
                <span className="text-sm font-semibold text-zinc-700">Wrap After Box Width (inches)</span>
                <input
                  type="number"
                  min={3}
                  max={7}
                  step={0.1}
                  value={describedPictureMaxBoxWidth}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setDescribedPictureMaxBoxWidth(
                      Number.isFinite(next) ? next : getDefaultDescribedPictureMaxBoxWidth(mode)
                    );
                  }}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                />
                <span className="text-xs text-zinc-500">
                  The caption stays on one line until the box reaches this width, then it wraps.
                </span>
              </label>
            </div>
          )}
          {supportsTextFontSelection && (
            <div className="space-y-3">
              {customFontPreviewCss ? <style>{customFontPreviewCss}</style> : null}
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-semibold text-zinc-700">
                  {isFullyDescribedImagesMode ? "Caption Fonts" : isCaptionBoxMode ? "Caption Font" : "Select Font"}
                </label>
                <button
                  type="button"
                  onClick={handleBrowserFontUploadClick}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500"
                >
                  Upload ZIP
                </button>
                <input
                  ref={browserFontFileInputRef}
                  type="file"
                  accept=".zip,.ttf,.otf"
                  onChange={handleBrowserFontUpload}
                  className="hidden"
                />
              </div>
              {fontsError && <p className="text-sm text-red-600">{fontsError}</p>}
              {isFullyDescribedImagesMode ? (
                <>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-zinc-900">Title Font</p>
                        <p className="text-xs text-zinc-500">Choose the family and subfont for the title line.</p>
                      </div>
                      <div className="mt-4 grid gap-4">
                        <label className="flex flex-col gap-2">
                          <span className="text-sm font-medium text-zinc-700">Font Family</span>
                          <div className="relative">
                            <input
                              ref={fullyDescribedTitleFontSourceInputRef}
                              type="text"
                              value={fullyDescribedTitleFontSourceSearch}
                              onChange={handleFullyDescribedTitleFontSourceChange}
                              onFocus={() => {
                                setIsFullyDescribedTitleFontSourceMenuOpen(true);
                                setIsFullyDescribedTitleFontSourceFiltering(false);
                              }}
                              onBlur={handleFullyDescribedTitleFontSourceBlur}
                              placeholder="Search font family..."
                              role="combobox"
                              aria-expanded={isFullyDescribedTitleFontSourceMenuOpen}
                              aria-controls="fully-described-title-font-source-menu"
                              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-11 text-sm text-zinc-900 hover:cursor-pointer focus:cursor-text focus:border-black focus:outline-none"
                            />
                            <button
                              type="button"
                              aria-label="Toggle title font family menu"
                              aria-expanded={isFullyDescribedTitleFontSourceMenuOpen}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={handleFullyDescribedTitleFontSourceToggle}
                              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-zinc-500 transition hover:cursor-pointer hover:text-zinc-900"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                className={`h-4 w-4 transition-transform ${isFullyDescribedTitleFontSourceMenuOpen ? "rotate-180" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="m5 7.5 5 5 5-5" />
                              </svg>
                            </button>
                            {isFullyDescribedTitleFontSourceMenuOpen && (
                              <div
                                id="fully-described-title-font-source-menu"
                                className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
                              >
                                {filteredFullyDescribedTitleFontSourceGroups.length > 0 ? (
                                  filteredFullyDescribedTitleFontSourceGroups.map((group) => {
                                    const isSelected = group.key === selectedFullyDescribedTitleFontSource?.key;
                                    return (
                                      <button
                                        key={group.key}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => selectFullyDescribedTitleFontSource(group)}
                                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                                          isSelected ? "bg-zinc-900 text-white" : "text-zinc-800 hover:bg-zinc-100"
                                        }`}
                                      >
                                        <span className="truncate">{group.label}</span>
                                        <span className={`ml-3 text-xs ${isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                                          {group.variants.length} {group.variants.length === 1 ? "style" : "styles"}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <p className="px-3 py-2 text-sm text-zinc-500">No font families match.</p>
                                )}
                              </div>
                            )}
                          </div>
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-sm font-medium text-zinc-700">Variety</span>
                          <div className="relative">
                            <input
                              ref={fullyDescribedTitleFontVariantInputRef}
                              type="text"
                              value={fullyDescribedTitleFontVariantSearch}
                              onChange={handleFullyDescribedTitleFontVariantChange}
                              onFocus={handleFullyDescribedTitleFontVariantFocus}
                              onBlur={handleFullyDescribedTitleFontVariantBlur}
                              placeholder="Search variety..."
                              role="combobox"
                              aria-expanded={isFullyDescribedTitleFontVariantMenuOpen}
                              aria-controls="fully-described-title-font-variant-menu"
                              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-11 text-sm text-zinc-900 hover:cursor-pointer focus:cursor-text focus:border-black focus:outline-none"
                            />
                            <button
                              type="button"
                              aria-label="Toggle title font variety menu"
                              aria-expanded={isFullyDescribedTitleFontVariantMenuOpen}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={handleFullyDescribedTitleFontVariantToggle}
                              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-zinc-500 transition hover:cursor-pointer hover:text-zinc-900"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                className={`h-4 w-4 transition-transform ${isFullyDescribedTitleFontVariantMenuOpen ? "rotate-180" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="m5 7.5 5 5 5-5" />
                              </svg>
                            </button>
                            {isFullyDescribedTitleFontVariantMenuOpen && (
                              <div
                                id="fully-described-title-font-variant-menu"
                                className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
                              >
                                {filteredFullyDescribedTitleFontVariants.length > 0 ? (
                                  filteredFullyDescribedTitleFontVariants.map((option) => {
                                    const label = formatFontVariantLabel(
                                      option,
                                      selectedFullyDescribedTitleFontSource?.label
                                    );
                                    const isSelected = option.id === selectedFullyDescribedTitleFont.id;
                                    return (
                                      <button
                                        key={option.id}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => selectFullyDescribedTitleFontVariant(option)}
                                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                                          isSelected ? "bg-zinc-900 text-white" : "text-zinc-800 hover:bg-zinc-100"
                                        }`}
                                      >
                                        <span className="truncate">{label}</span>
                                        <span className={`ml-3 text-xs ${isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                                          {option.format === "truetype" ? "TTF" : "OTF"}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <p className="px-3 py-2 text-sm text-zinc-500">No varieties match.</p>
                                )}
                              </div>
                            )}
                          </div>
                        </label>
                      </div>
                      <div className="mt-4 space-y-1">
                        <p className="text-sm font-semibold text-zinc-900">
                          {selectedFullyDescribedTitleFontSource?.label ?? DEFAULT_FULL_FACT_FONT_SOURCE_LABEL}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {formatFontVariantLabel(selectedFullyDescribedTitleFont, selectedFullyDescribedTitleFontSource?.label)}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-zinc-900">Description Font</p>
                        <p className="text-xs text-zinc-500">Choose the family and subfont for the description text.</p>
                      </div>
                      <div className="mt-4 grid gap-4">
                        <label className="flex flex-col gap-2">
                          <span className="text-sm font-medium text-zinc-700">Font Family</span>
                          <div className="relative">
                            <input
                              ref={fullFactFontSourceInputRef}
                              type="text"
                              value={fullFactFontSourceSearch}
                              onChange={handleFullFactFontSourceChange}
                              onFocus={() => {
                                setIsFullFactFontSourceMenuOpen(true);
                                setIsFullFactFontSourceFiltering(false);
                              }}
                              onBlur={handleFullFactFontSourceBlur}
                              placeholder="Search font family..."
                              role="combobox"
                              aria-expanded={isFullFactFontSourceMenuOpen}
                              aria-controls="full-fact-font-source-menu"
                              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-11 text-sm text-zinc-900 hover:cursor-pointer focus:cursor-text focus:border-black focus:outline-none"
                            />
                            <button
                              type="button"
                              aria-label="Toggle description font family menu"
                              aria-expanded={isFullFactFontSourceMenuOpen}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={handleFullFactFontSourceToggle}
                              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-zinc-500 transition hover:cursor-pointer hover:text-zinc-900"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                className={`h-4 w-4 transition-transform ${isFullFactFontSourceMenuOpen ? "rotate-180" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="m5 7.5 5 5 5-5" />
                              </svg>
                            </button>
                            {isFullFactFontSourceMenuOpen && (
                              <div
                                id="full-fact-font-source-menu"
                                className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
                              >
                                {filteredFullFactFontSourceGroups.length > 0 ? (
                                  filteredFullFactFontSourceGroups.map((group) => {
                                    const isSelected = group.key === selectedFullFactFontSource?.key;
                                    return (
                                      <button
                                        key={group.key}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => selectFullFactFontSource(group)}
                                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                                          isSelected ? "bg-zinc-900 text-white" : "text-zinc-800 hover:bg-zinc-100"
                                        }`}
                                      >
                                        <span className="truncate">{group.label}</span>
                                        <span className={`ml-3 text-xs ${isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                                          {group.variants.length} {group.variants.length === 1 ? "style" : "styles"}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <p className="px-3 py-2 text-sm text-zinc-500">No font families match.</p>
                                )}
                              </div>
                            )}
                          </div>
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-sm font-medium text-zinc-700">Variety</span>
                          <div className="relative">
                            <input
                              ref={fullFactFontVariantInputRef}
                              type="text"
                              value={fullFactFontVariantSearch}
                              onChange={handleFullFactFontVariantChange}
                              onFocus={handleFullFactFontVariantFocus}
                              onBlur={handleFullFactFontVariantBlur}
                              placeholder="Search variety..."
                              role="combobox"
                              aria-expanded={isFullFactFontVariantMenuOpen}
                              aria-controls="full-fact-font-variant-menu"
                              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-11 text-sm text-zinc-900 hover:cursor-pointer focus:cursor-text focus:border-black focus:outline-none"
                            />
                            <button
                              type="button"
                              aria-label="Toggle description font variety menu"
                              aria-expanded={isFullFactFontVariantMenuOpen}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={handleFullFactFontVariantToggle}
                              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-zinc-500 transition hover:cursor-pointer hover:text-zinc-900"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                className={`h-4 w-4 transition-transform ${isFullFactFontVariantMenuOpen ? "rotate-180" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="m5 7.5 5 5 5-5" />
                              </svg>
                            </button>
                            {isFullFactFontVariantMenuOpen && (
                              <div
                                id="full-fact-font-variant-menu"
                                className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
                              >
                                {filteredFullFactFontVariants.length > 0 ? (
                                  filteredFullFactFontVariants.map((option) => {
                                    const label = formatFontVariantLabel(option, selectedFullFactFontSource?.label);
                                    const isSelected = option.id === selectedFullFactFont.id;
                                    return (
                                      <button
                                        key={option.id}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => selectFullFactFontVariant(option)}
                                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                                          isSelected ? "bg-zinc-900 text-white" : "text-zinc-800 hover:bg-zinc-100"
                                        }`}
                                      >
                                        <span className="truncate">{label}</span>
                                        <span className={`ml-3 text-xs ${isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                                          {option.format === "truetype" ? "TTF" : "OTF"}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <p className="px-3 py-2 text-sm text-zinc-500">No varieties match.</p>
                                )}
                              </div>
                            )}
                          </div>
                        </label>
                      </div>
                      <div className="mt-4 space-y-1">
                        <p className="text-sm font-semibold text-zinc-900">
                          {selectedFullFactFontSource?.label ?? DEFAULT_FULL_FACT_FONT_SOURCE_LABEL}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {formatFontVariantLabel(selectedFullFactFont, selectedFullFactFontSource?.label)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-zinc-900">
                        Title: {formatFontOptionDisplayLabel(selectedFullyDescribedTitleFont)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Description: {formatFontOptionDisplayLabel(selectedFullFactFont)}
                      </p>
                    </div>
                    <div className="mt-3 flex justify-center">
                      <div
                        className="max-w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3"
                        style={{ maxWidth: `${Math.round(Math.min(7, Math.max(3, describedPictureMaxBoxWidth)) * 96)}px` }}
                      >
                        <div
                          className="text-lg leading-tight text-zinc-900"
                          style={{ fontFamily: selectedFullyDescribedTitleFont.previewFamily, textAlign: "left" }}
                        >
                          Espresso
                        </div>
                        <div
                          className="mt-2 text-base leading-snug text-zinc-700"
                          style={{ fontFamily: selectedFullFactFont.previewFamily, textAlign: "left" }}
                        >
                          Made by forcing hot water through finely ground coffee under high pressure to create a small,
                          strong shot with crema.
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-zinc-700">Font</span>
                      <div className="relative">
                        <input
                          ref={fullFactFontSourceInputRef}
                          type="text"
                          value={fullFactFontSourceSearch}
                          onChange={handleFullFactFontSourceChange}
                          onFocus={() => {
                            setIsFullFactFontSourceMenuOpen(true);
                            setIsFullFactFontSourceFiltering(false);
                          }}
                          onBlur={handleFullFactFontSourceBlur}
                          placeholder="Search font family..."
                          role="combobox"
                          aria-expanded={isFullFactFontSourceMenuOpen}
                          aria-controls="full-fact-font-source-menu"
                          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-11 text-sm text-zinc-900 hover:cursor-pointer focus:cursor-text focus:border-black focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Toggle font family menu"
                          aria-expanded={isFullFactFontSourceMenuOpen}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={handleFullFactFontSourceToggle}
                          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-zinc-500 transition hover:cursor-pointer hover:text-zinc-900"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            className={`h-4 w-4 transition-transform ${isFullFactFontSourceMenuOpen ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="m5 7.5 5 5 5-5" />
                          </svg>
                        </button>
                        {isFullFactFontSourceMenuOpen && (
                          <div
                            id="full-fact-font-source-menu"
                            className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
                          >
                            {filteredFullFactFontSourceGroups.length > 0 ? (
                              filteredFullFactFontSourceGroups.map((group) => {
                                const isSelected = group.key === selectedFullFactFontSource?.key;
                                return (
                                  <button
                                    key={group.key}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => selectFullFactFontSource(group)}
                                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                                      isSelected ? "bg-zinc-900 text-white" : "text-zinc-800 hover:bg-zinc-100"
                                    }`}
                                  >
                                    <span className="truncate">{group.label}</span>
                                    <span className={`ml-3 text-xs ${isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                                      {group.variants.length} {group.variants.length === 1 ? "style" : "styles"}
                                    </span>
                                  </button>
                                );
                              })
                            ) : (
                              <p className="px-3 py-2 text-sm text-zinc-500">No font families match.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-zinc-700">Variety</span>
                      <div className="relative">
                        <input
                          ref={fullFactFontVariantInputRef}
                          type="text"
                          value={fullFactFontVariantSearch}
                          onChange={handleFullFactFontVariantChange}
                          onFocus={handleFullFactFontVariantFocus}
                          onBlur={handleFullFactFontVariantBlur}
                          placeholder="Search variety..."
                          role="combobox"
                          aria-expanded={isFullFactFontVariantMenuOpen}
                          aria-controls="full-fact-font-variant-menu"
                          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-11 text-sm text-zinc-900 hover:cursor-pointer focus:cursor-text focus:border-black focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Toggle font variety menu"
                          aria-expanded={isFullFactFontVariantMenuOpen}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={handleFullFactFontVariantToggle}
                          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-zinc-500 transition hover:cursor-pointer hover:text-zinc-900"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            className={`h-4 w-4 transition-transform ${isFullFactFontVariantMenuOpen ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="m5 7.5 5 5 5-5" />
                          </svg>
                        </button>
                        {isFullFactFontVariantMenuOpen && (
                          <div
                            id="full-fact-font-variant-menu"
                            className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
                          >
                            {filteredFullFactFontVariants.length > 0 ? (
                              filteredFullFactFontVariants.map((option) => {
                                const label = formatFontVariantLabel(option, selectedFullFactFontSource?.label);
                                const isSelected = option.id === selectedFullFactFont.id;
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => selectFullFactFontVariant(option)}
                                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                                      isSelected ? "bg-zinc-900 text-white" : "text-zinc-800 hover:bg-zinc-100"
                                    }`}
                                  >
                                    <span className="truncate">{label}</span>
                                    <span className={`ml-3 text-xs ${isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                                      {option.format === "truetype" ? "TTF" : "OTF"}
                                    </span>
                                  </button>
                                );
                              })
                            ) : (
                              <p className="px-3 py-2 text-sm text-zinc-500">No varieties match.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-zinc-900">
                        {selectedFullFactFontSource?.label ?? DEFAULT_FULL_FACT_FONT_SOURCE_LABEL}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatFontVariantLabel(selectedFullFactFont, selectedFullFactFontSource?.label)}
                      </p>
                    </div>
                    <div
                      className={`mt-3 ${isCaptionBoxMode ? "flex" : ""}`}
                      style={{
                        justifyContent: isCaptionBoxMode && describedPictureTextAlignment === "left" ? "flex-start" : "center",
                      }}
                    >
                      <div
                        className={`text-2xl leading-snug text-zinc-800 ${isCaptionBoxMode ? "max-w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3" : ""}`}
                        style={{
                          fontFamily: selectedFullFactFont.previewFamily,
                          textAlign: isCaptionBoxMode ? describedPictureTextAlignment : "left",
                          maxWidth: isCaptionBoxMode ? `${Math.round(Math.min(7, Math.max(3, describedPictureMaxBoxWidth)) * 96)}px` : undefined,
                        }}
                      >
                        {isCaptionBoxMode ? "1970 Ford Torino Cobra" : FULL_FACT_FONT_PREVIEW_TEXT}
                      </div>
                    </div>
                  </div>
                </>
              )}
              {loadingFonts || availableFonts.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  {loadingFonts
                    ? "Loading font library..."
                    : "Use Upload ZIP or add .ttf, .otf, or zipped font families to ./fonts to unlock custom font choices."}
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
              className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Configure Content
            </button>
          </div>
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
            <h3 className="text-lg font-semibold text-zinc-900">{stepFourTitle}</h3>
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
              className="h-[500px] rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder={mode === "full-fact"
                ? "Paste facts here as JSON or one fact per line"
                : `[
  {"title": "Voyager 1 keeps flying", "fact": "Launched in 1977, it's now beyond 150 AU from Earth."},
  {"title": "Lightning is scorching", "fact": "Lightning channels can heat the air to 50,000°F."}
]`}
            />
          </div>
        )}

        {needsList && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label htmlFor="list-input" className="text-sm font-medium text-zinc-700">
                {isCaptionBoxMode ? "Picture Descriptions" : "List Entries"}
              </label>
              {isCaptionBoxMode && (
                <button
                  type="button"
                  onClick={() => setList(DESCRIBED_PICTURES_PLACEHOLDER)}
                  className="self-start rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500"
                >
                  Use sample JSON
                </button>
              )}
            </div>
            <textarea
              id="list-input"
              value={list}
              onChange={(event) => setList(event.target.value)}
              className="h-[500px] rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder={
                isCaptionBoxMode
                  ? DESCRIBED_PICTURES_PLACEHOLDER
                  : "Paste data/list.json or provide one item per line"
              }
            />
          </div>
        )}

        {needsListDescription && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-sm font-medium text-zinc-700">
                {isFullyDescribedImagesMode ? "Titles + Descriptions" : "Title + Description"}
              </label>
              {isFullyDescribedImagesMode ? (
                <button
                  type="button"
                  onClick={() => setListDescription(FULLY_DESCRIBED_IMAGES_PLACEHOLDER)}
                  className="self-start rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500"
                >
                  Use sample JSON
                </button>
              ) : null}
            </div>
            <textarea
              value={listDescription}
              onChange={(event) => setListDescription(event.target.value)}
              className="h-[500px] rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder={
                isFullyDescribedImagesMode
                  ? FULLY_DESCRIBED_IMAGES_PLACEHOLDER
                  : 'Supports [{"title": "...", "description": "..."}] or "Title | description" lines'
              }
            />
          </div>
        )}

        {mode === "full-fact" && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">Facts Per Page</label>
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
          src="/even-stacked-facts.webp"
          alt="Stacked Even Facts preview"
          fill
          priority
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover object-left-top"
        />
      </div>
    );
  }

  if (mode === "described-pictures") {
    return (
      <div aria-hidden="true" className="relative aspect-[1338/668] overflow-hidden rounded-t-2xl bg-zinc-100">
        <Image
          src="/described-images.webp"
          alt="Described Pictures preview"
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover object-center"
        />
      </div>
    );
  }

  if (mode === "even-described-pictures") {
    return (
      <div aria-hidden="true" className="relative aspect-[1364/679] overflow-hidden rounded-t-2xl bg-zinc-100">
        <Image
          src="/even-described-images.webp"
          alt="Even Described Pictures preview"
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover object-center"
        />
      </div>
    );
  }

  if (mode === "fully-described-images") {
    return (
      <div aria-hidden="true" className="relative aspect-[1338/668] overflow-hidden rounded-t-2xl bg-zinc-100">
        <Image
          src="/fully-described-images.webp"
          alt="Fully Described Pictures preview"
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover object-center"
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
  const groups = new Map<string, { key: string; variants: BookFontOption[] }>();
  for (const option of options) {
    const key = getFontSourceKey(option);
    const existing = groups.get(key);
    if (existing) {
      existing.variants.push(option);
      continue;
    }
    groups.set(key, {
      key,
      variants: [option],
    });
  }

  const sortedGroups = Array.from(groups.values()).map((group) => ({
    key: group.key,
    label: getFontSourceLabel(group.variants),
    searchText: buildFontSourceSearchText(group.variants, getFontSourceLabel(group.variants)),
    variants: [...group.variants].sort((left, right) =>
      formatFontVariantLabel(left, getFontSourceLabel(group.variants)).localeCompare(
        formatFontVariantLabel(right, getFontSourceLabel(group.variants)),
        undefined,
        { sensitivity: "base" }
      )
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

function getFontSourceKey(
  option: Pick<BookFontOption, "id" | "sourceType" | "sourceLabel"> & { storageScope?: BookFontOption["storageScope"] }
) {
  if (option.id === DEFAULT_FULL_FACT_FONT_ID) {
    return DEFAULT_FULL_FACT_FONT_SOURCE_KEY;
  }
  const scope = option.storageScope === "browser" || option.id.startsWith("browser:") ? "browser" : "server";
  return `${scope}:${option.sourceType}:${option.sourceLabel}`;
}

function getFontSourceLabel(options: BookFontOption[]) {
  const [firstOption] = options;
  if (!firstOption) {
    return "";
  }
  if (firstOption.id === DEFAULT_FULL_FACT_FONT_ID) {
    return DEFAULT_FULL_FACT_FONT_SOURCE_LABEL;
  }
  const sharedFamilyName = options.length > 1 ? getSharedFontFamilyName(options) : null;
  if (sharedFamilyName) {
    return sharedFamilyName;
  }
  if (firstOption.sourceType === "zip") {
    return stripExtension(firstOption.sourceLabel);
  }
  return firstOption.familyName || stripExtension(firstOption.fileName);
}

function formatFontVariantLabel(option: BookFontOption, sourceLabel?: string) {
  if (option.id === DEFAULT_FULL_FACT_FONT_ID) {
    return option.subfamilyName || "Regular";
  }
  const normalizedSubfamily = normalizeFontText(option.subfamilyName);
  if (normalizedSubfamily && normalizedSubfamily.toLowerCase() !== "regular") {
    return normalizedSubfamily;
  }
  const normalizedSourceLabel = normalizeFontText(sourceLabel ?? "");
  const derivedVariant =
    deriveFontVariantFromName(option.fullName, normalizedSourceLabel) ||
    deriveFontVariantFromName(option.familyName, normalizedSourceLabel) ||
    deriveFontVariantFromName(stripExtension(option.fileName), normalizedSourceLabel);
  if (derivedVariant) {
    return derivedVariant;
  }
  return normalizedSubfamily || "Regular";
}

function formatFontOptionDisplayLabel(option: BookFontOption) {
  if (option.id === DEFAULT_FULL_FACT_FONT_ID) {
    return DEFAULT_FULL_FACT_FONT_SOURCE_LABEL;
  }
  const familyLabel = normalizeFontText(option.familyName || option.fullName || stripExtension(option.fileName)) || option.label;
  const variantLabel = formatFontVariantLabel(option, familyLabel);
  return variantLabel && variantLabel !== "Regular" ? `${familyLabel} - ${variantLabel}` : familyLabel;
}

function findFontSourceGroupByLabel(groups: FontSourceGroup[], value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return groups.find((group) => group.label.toLowerCase() === normalized) ?? null;
}

function findFontVariantByLabel(options: BookFontOption[], value: string, sourceLabel?: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return (
    options.find((option) => formatFontVariantLabel(option, sourceLabel).toLowerCase() === normalized) ?? null
  );
}

function buildFontSourceSearchText(options: BookFontOption[], label: string) {
  return [
    label,
    ...options.flatMap((option) => [
      option.sourceLabel,
      option.fullName,
      option.familyName,
      option.subfamilyName,
      formatFontVariantLabel(option, label),
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

function buildFontVariantSearchText(option: BookFontOption, sourceLabel?: string) {
  return [
    formatFontVariantLabel(option, sourceLabel),
    option.fullName,
    option.familyName,
    option.subfamilyName,
    option.fileName,
  ]
    .join(" ")
    .toLowerCase();
}

function getSharedFontFamilyName(options: BookFontOption[]) {
  const familyWords = options
    .map((option) => normalizeFontText(option.familyName || option.fullName))
    .filter(Boolean)
    .map((name) => name.split(" "));
  if (familyWords.length < 2) {
    return null;
  }
  let prefix = familyWords[0];
  for (const words of familyWords.slice(1)) {
    let index = 0;
    while (
      index < prefix.length &&
      index < words.length &&
      prefix[index].localeCompare(words[index], undefined, { sensitivity: "base" }) === 0
    ) {
      index += 1;
    }
    prefix = prefix.slice(0, index);
    if (prefix.length === 0) {
      return null;
    }
  }
  return prefix.join(" ").trim() || null;
}

function deriveFontVariantFromName(value: string, sourceLabel: string) {
  const normalizedValue = normalizeFontText(value);
  if (!normalizedValue || !sourceLabel) {
    return "";
  }
  const sourcePattern = sourceLabel
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join("\\s+");
  const withoutPrefix = normalizedValue.replace(new RegExp(`^${sourcePattern}(?:\\s+|[-_]+)?`, "i"), "").trim();
  if (!withoutPrefix || withoutPrefix.localeCompare(normalizedValue, undefined, { sensitivity: "base" }) === 0) {
    return "";
  }
  return withoutPrefix;
}

function normalizeFontText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/, "");
}

function revokeFontPreviewUrls(fonts: BookFontOption[]) {
  for (const font of fonts) {
    if (font.storageScope === "browser" && font.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(font.previewUrl);
    }
  }
}
