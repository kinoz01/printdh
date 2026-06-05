"use client";

/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
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
  {
    value: "even-full-page-text",
    label: "Even Full Page Text",
    description: "A centered 7 × 7 in text box appears on even pages with a title above the paragraph.",
    accent: "from-slate-200 via-stone-100 to-zinc-200",
  },
  {
    value: "image-only",
    label: "Image Only",
    description: "Edge-to-edge imagery on every page with no captions or text overlays.",
    accent: "from-zinc-200 via-neutral-100 to-stone-200",
  },
  {
    value: "uploaded-images",
    label: "Uploaded Image Pages",
    description: "Upload backgrounds and centered content images directly.",
    accent: "from-emerald-200 via-sky-100 to-stone-200",
  },
  // {
  //   value: "list-description-even",
  //   label: "Title + Description (Even Pages)",
  //   description: "Let imagery breathe on odd pages and narrate on even pages.",
  //   accent: "from-rose-200 via-red-100 to-orange-200",
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
  | "even-full-page-text"
  | "image-only"
  | "uploaded-images"
  | "full-fact"
  | "dictionary";

const DEFAULT_DESCRIBED_PICTURE_MAX_BOX_WIDTH = 6.2;
const DEFAULT_FULLY_DESCRIBED_MAX_BOX_WIDTH = 7;
const DEFAULT_EVEN_FULL_PAGE_TEXT_BOX_HEIGHT = 7;

function getDefaultDescribedPictureMaxBoxWidth(mode: ModeValue) {
  return mode === "fully-described-images" || mode === "even-full-page-text"
    ? DEFAULT_FULLY_DESCRIBED_MAX_BOX_WIDTH
    : DEFAULT_DESCRIBED_PICTURE_MAX_BOX_WIDTH;
}

function getDefaultEvenFullPageTextBoxHeight() {
  return DEFAULT_EVEN_FULL_PAGE_TEXT_BOX_HEIGHT;
}

function getSafeDescribedPictureMaxBoxWidth(value: number, mode: ModeValue) {
  const fallback = getDefaultDescribedPictureMaxBoxWidth(mode);
  const resolved = Number.isFinite(value) ? value : fallback;
  return mode === "even-full-page-text" ? Math.min(7.6, Math.max(4, resolved)) : Math.min(7, Math.max(3, resolved));
}

function getSafeEvenFullPageTextBoxHeight(value: number) {
  const resolved = Number.isFinite(value) ? value : getDefaultEvenFullPageTextBoxHeight();
  return Math.min(7.6, Math.max(4, resolved));
}

const PAGE_SIZES = [
  { value: "square", label: "Square", description: "8.64 × 8.76 in" },
  { value: "us-letter", label: "US Letter", description: "8.625 × 11.25 in" },
  { value: "hardcover", label: "Hardcover", description: "8.375 × 11.25 in" },
] as const;
type PageSizeValue = (typeof PAGE_SIZES)[number]["value"];

function getDefaultPageCount(pageSize: PageSizeValue) {
  return pageSize === "hardcover" ? 80 : 40;
}

type WizardStep = 1 | 2 | 3 | 4;
type BookFontFormat = "truetype" | "opentype";
type DescribedPictureTextAlignment = "center" | "left";
type UploadedPageNumberPosition = "alternating" | "center";

const UPLOAD_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/bmp,image/tiff,image/gif,image/avif,image/heic,image/heif";
const UPLOAD_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff", "gif", "avif", "heic", "heif"]);

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

const EVEN_FULL_PAGE_TEXT_SAMPLE_WINTER_SPORTS = JSON.stringify(
  [
    {
      title: "Alpine Skiing",
      description:
        "1. Alpine skiing, also known as downhill skiing, originated in the European Alps in the mid-19th century and has since become one of the most popular winter sports worldwide.\n2. The sport involves sliding down snow-covered slopes on skis with fixed-heel bindings, unlike other types of skiing where the heel is free.\n3. Alpine skiing made its Olympic debut at the 1936 Winter Games in Garmisch-Partenkirchen, Germany, featuring a combined event of downhill and slalom.\n4. Competitors leverage gravity to reach speeds exceeding 130 km/h (80 mph) in the downhill event, requiring immense physical strength and focus.\n5. The sport is divided into speed events (Downhill and Super-G) and technical events (Slalom and Giant Slalom), each requiring different skill sets.\n6. Ski bindings are designed to release the boot in the event of a fall to minimize injury, a crucial safety innovation developed over decades.\n7. Modern skis are shaped with a sidecut (hourglass shape) to facilitate easier turning, a revolution known as 'parabolic skis' introduced in the 1990s.\n8. The Hahnenkamm race in Kitzbuhel, Austria, is considered the most challenging and dangerous downhill course on the World Cup circuit.\n9. Alpine skiing requires significant leg strength, particularly in the quadriceps and hamstrings, to maintain control and absorb shocks from the terrain.\n10. Artificial snow is often used in major competitions to ensure a consistent and hard surface, which, while safer for racers, is much icier than recreational snow.\n11. Racers wear skin-tight suits to reduce aerodynamic drag, which can make a difference of hundredths of a second in race times.\n12. Gatekeepers are officials positioned along the course to ensure that skiers pass through all the gates correctly; missing a gate results in disqualification.\n13. The 'tuck' position constitutes the most aerodynamic stance in skiing, where the skier squats low and keeps arms close to the body.\n14. Alpine skiing has a rich culture of 'apres-ski,' referring to the socializing and nightlife that takes place at ski resorts after a day on the slopes.\n15. Climate change poses a significant threat to the future of alpine skiing, with receding glaciers and shorter winters impacting ski resorts globally.",
    },
    {
      title: "Biathlon",
      description:
        "1. Biathlon is a unique winter sport that combines cross-country skiing with rifle shooting, demanding both immense cardiovascular endurance and extreme precision.\n2. The sport has its roots in survival skills practiced by Scandinavian hunters and soldiers who skied with weapons to defend their territories.\n3. Biathletes must lower their heart rate rapidly upon entering the shooting range to steady their aim, despite just having skied at maximum effort.\n4. A standard biathlon rifle weighs at least 3.5 kg and uses .22 caliber ammunition, which is fired at targets 50 meters away.\n5. In the standing shooting position, the target size is 11.5 cm in diameter, while in the prone position, it shrinks to a tiny 4.5 cm.\n6. For every missed target, athletes usually face a penalty, such as skiing a 150-meter penalty loop or having one minute added to their total time.\n7. Biathlon was first included in the Winter Olympics in 1960 for men, while women's biathlon was not added until the 1992 Games in Albertville.\n8. The sport is particularly popular in Germany, Russia, Norway, and France, where top athletes are national celebrities.\n9. Wind conditions play a massive role in shooting accuracy; athletes must adjust their rifle sights ('clicks') to compensate for wind direction and speed.\n10. Rifles are carried on the athlete's back using a special harness that allows for skiing without significant hindrance.\n11. The rifle stock is often custom-made to fit the athlete's body perfectly, ensuring comfort and stability during the shooting phase.\n12. Biathletes do not use telescopic sights; they rely on aperture sights (peep sights) which require excellent vision and focus.\n13. The transition time between skiing and shooting is critical; athletes practice entering the range and getting into position to shave off seconds.\n14. There are several event formats, including Sprint, Pursuit, Individual, Mass Start, and Relays, each with different distances and shooting sequences.\n15. Biathlon training involves roller skiing in the summer months to maintain fitness and refine technique without snow.",
    },
    {
      title: "Bobsleigh",
      description:
        "1. Bobsleigh is a high-speed winter sport where teams of two or four make timed runs down narrow, twisting, banked, iced tracks in a gravity-powered sled.\n2. The sport originated in Switzerland in the late 19th century when hotel guests began racing sleds down icy roads in St. Moritz.\n3. Bobsleds can reach speeds of over 150 km/h (93 mph), and crews can experience G-forces up to 5G in tight curves.\n4. The start is the most critical part of the race; athletes must push the heavy sled in unison for about 50 meters before jumping in.\n5. The driver steers the sled using precise movements of a steering mechanism connected to the front runners, while the brakeman stops the sled after the finish line.\n6. In a four-man bobsleigh, the two middle crew members are primarily pushers who add weight and mass to the sled for higher speeds.\n7. Aerodynamics are crucial; sleds are wind-tunnel tested, and athletes wear sleek suits and helmets to minimize air resistance.\n8. The total weight of the sled and crew is strictly regulated; lighter teams often add lead weights to reach the maximum limit for competitive equality.\n9. Bobsleigh tracks are constructed of concrete and covered with ice; they must be maintained meticulously to ensure a smooth and safe surface.\n10. The 'death spiral' is a famous 360-degree turn found on some tracks, testing the crew's ability to withstand immense centrifugal force.\n11. Women's bobsleigh was introduced to the Winter Olympics in 2002 with a two-woman event, and a monobob (single person) event was added in 2022.\n12. The Jamaican bobsleigh team famously debuted at the 1988 Calgary Olympics, inspiring the popular film 'Cool Runnings'.\n13. Sled runners are made of steel and are polished to a mirror finish to reduce friction with the ice; their temperature is also regulated before races.\n14. Communication between the driver and brakeman is limited during the run due to the deafening noise and intense concentration required.\n15. Crashes in bobsleigh are dangerous and can result in the sled overturning and sliding on the athletes' helmets or shoulders at high speeds.",
    },
  ],
  null,
  2
);

const EVEN_FULL_PAGE_TEXT_SAMPLE_COFFEE = JSON.stringify(
  [
    {
      title: "Virgin Espresso Martini",
      description:
        "**Intro:** Virgin Espresso Martini keeps the elegant look and bold coffee flavor of the classic espresso martini, but uses espresso, cold brew concentrate, and syrup instead of alcohol. It is cold, frothy, rich, and ideal for a non-alcoholic after-dinner coffee drink.\n\n**Ingredients:**\n- 1 shot fresh espresso, cooled\n- 1 oz cold brew concentrate\n- 0.5 oz vanilla syrup\n- 0.5 oz simple syrup, optional\n- Ice\n- 3 whole coffee beans for garnish\n\n**Instructions:**\n1. Brew a fresh espresso shot and let it cool for a few minutes so it does not melt the ice too quickly.\n2. Add the cooled espresso, cold brew concentrate, vanilla syrup, simple syrup, and ice to a cocktail shaker.\n3. Shake hard for 15-20 seconds until the outside of the shaker feels cold and the drink becomes foamy.\n4. Double strain into a chilled coupe or martini glass to remove small ice pieces and create a smooth texture.\n5. Garnish with 3 whole coffee beans on the foam.\n\n**Serving note:** Use strong espresso and shake aggressively because the foam is what gives this drink its elegant cocktail-style finish.",
    },
    {
      title: "Creamy Irish Coffee Mocktail",
      description:
        "**Intro:** Creamy Irish Coffee Mocktail is a warm and comforting alcohol-free version of Irish coffee. It uses hot coffee, brown sugar, vanilla, and lightly whipped cream to create a rich layered drink without whiskey.\n\n**Ingredients:**\n- 1 cup freshly brewed hot coffee\n- 1-2 tsp brown sugar\n- 0.25 tsp vanilla extract\n- 1-2 tbsp lightly whipped heavy cream\n- Optional: small pinch of cinnamon\n\n**Instructions:**\n1. Warm the glass or mug by filling it with hot water for 30 seconds, then discard the water.\n2. Add brown sugar and vanilla extract to the warm glass.\n3. Pour in the hot coffee and stir until the sugar fully dissolves.\n4. Lightly whip the cream until it thickens but is still pourable.\n5. Pour the cream gently over the back of a spoon so it floats on top of the coffee.\n6. Add a small pinch of cinnamon if desired.\n\n**Serving note:** Do not stir the cream into the drink; sip the hot coffee through the cool cream for the traditional layered experience.",
    },
    {
      title: "Spanish Coffee Mocktail",
      description:
        "**Intro:** Spanish Coffee Mocktail is a warm, dramatic coffee drink with a sugared rim, caramel, cinnamon, orange zest, and strong brewed coffee. It keeps the cozy dessert feeling of Spanish coffee without rum, brandy, or liqueur.\n\n**Ingredients:**\n- 1 cup freshly brewed hot coffee\n- 1 tbsp granulated sugar for the rim\n- 0.5 oz caramel syrup\n- 0.25 tsp cinnamon\n- Orange zest for garnish\n- Optional: whipped cream\n\n**Instructions:**\n1. Choose a heatproof glass or mug.\n2. Moisten the rim with orange peel, orange juice, or a little water.\n3. Dip the rim into granulated sugar until evenly coated.\n4. Add caramel syrup and cinnamon to the glass.\n5. Pour in freshly brewed hot coffee and stir gently until the syrup blends into the coffee.\n6. Top with whipped cream if desired.\n7. Finish with orange zest for aroma and presentation.\n\n**Serving note:** The sugared rim gives the drink a dessert-like first sip, while orange zest adds brightness to the warm coffee.",
    },
    {
      title: "White Russian Coffee Mocktail",
      description:
        "**Intro:** White Russian Coffee Mocktail is creamy, cold, and dessert-like. It replaces vodka and coffee liqueur with cold brew, coffee syrup, and cream, giving the same smooth style without alcohol.\n\n**Ingredients:**\n- 3 oz cold brew coffee\n- 1 oz coffee syrup or strong sweetened espresso\n- 1 oz heavy cream or milk\n- Ice\n- Optional: chocolate shavings\n\n**Instructions:**\n1. Fill a rocks glass with ice cubes.\n2. Pour the cold brew coffee over the ice.\n3. Add coffee syrup or strong sweetened espresso for a deeper coffee flavor.\n4. Slowly pour the cream over the top to create a layered look.\n5. Stir gently if you prefer a fully mixed drink.\n6. Garnish with chocolate shavings if desired.\n\n**Serving note:** Heavy cream creates a richer drink, while milk makes it lighter and easier to sip.",
    },
    {
      title: "Black Russian Coffee Mocktail",
      description:
        "**Intro:** Black Russian Coffee Mocktail is a dark, simple, coffee-forward drink served over ice. It keeps the bold look of the original cocktail but uses cold brew and coffee syrup instead of vodka and liqueur.\n\n**Ingredients:**\n- 4 oz cold brew coffee\n- 1 oz coffee syrup\n- 0.25 oz simple syrup, optional\n- Ice\n- Optional: orange peel\n\n**Instructions:**\n1. Fill a rocks glass with fresh ice.\n2. Pour in the cold brew coffee.\n3. Add coffee syrup and stir gently.\n4. Taste the drink and add simple syrup only if you want more sweetness.\n5. Stir again for 10-15 seconds to chill and balance the drink.\n6. Garnish with orange peel for a light citrus aroma.\n\n**Taste note:** This drink is stronger and darker because it contains no milk or cream, making it a good option for people who like black coffee.",
    },
    {
      title: "Cold Brew Citrus Spritz",
      description:
        "**Intro:** Cold Brew Citrus Spritz is a refreshing coffee mocktail with cold brew, orange juice, lemon juice, syrup, and sparkling water. It is light, bright, and suitable for warm afternoons or brunch.\n\n**Ingredients:**\n- 2 oz cold brew coffee\n- 1 oz orange juice\n- 0.5 oz lemon juice\n- 0.5 oz simple syrup\n- Sparkling water to top\n- Ice\n- Orange slice for garnish\n\n**Instructions:**\n1. Fill a tall glass with ice.\n2. Add cold brew coffee, orange juice, lemon juice, and simple syrup.\n3. Stir gently for a few seconds so the citrus and coffee combine.\n4. Top with sparkling water to add fizz.\n5. Stir once more very lightly so the drink stays bubbly.\n6. Garnish with an orange slice.\n\n**Serving note:** A smooth cold brew works best because too much bitterness can clash with the citrus.",
    },
    {
      title: "Almond Coffee Cream",
      description:
        "**Intro:** Almond Coffee Cream is a warm and nutty alcohol-free coffee drink inspired by amaretto-style flavors. Almond extract, hot coffee, brown sugar, and whipped cream create a sweet cafe-style dessert drink.\n\n**Ingredients:**\n- 1 cup hot brewed coffee\n- 0.25 tsp almond extract\n- 1-2 tsp brown sugar or honey\n- Whipped cream for topping\n- Optional: sliced almonds or cocoa powder\n\n**Instructions:**\n1. Brew a fresh cup of hot coffee using a medium or dark roast.\n2. Add almond extract and brown sugar or honey to a mug.\n3. Pour the hot coffee into the mug and stir until the sweetener dissolves.\n4. Taste and adjust sweetness if needed.\n5. Top with whipped cream.\n6. Garnish with sliced almonds or a light dusting of cocoa powder.\n\n**Tip:** Almond extract is strong, so start with a small amount and add more only if needed.",
    },
    {
      title: "Coffee Old Fashioned Mocktail",
      description:
        "**Intro:** Coffee Old Fashioned Mocktail is a slow-sipping alcohol-free drink with cold brew, orange peel, demerara syrup, cinnamon, and ice. It gives a deep, aromatic flavor without using whiskey.\n\n**Ingredients:**\n- 3 oz cold brew coffee\n- 0.5 oz demerara syrup or brown sugar syrup\n- 1 small strip orange peel\n- 1 tiny pinch cinnamon\n- Ice\n- Coffee beans for garnish\n\n**Instructions:**\n1. Add demerara syrup, orange peel, and cinnamon to a rocks glass.\n2. Press the orange peel gently with a spoon to release its oils.\n3. Add one large ice cube or several smaller ice cubes.\n4. Pour the cold brew coffee over the ice.\n5. Stir slowly for 20-30 seconds to chill and slightly dilute the drink.\n6. Garnish with a few coffee beans.\n\n**Taste note:** Demerara syrup gives a deeper caramel-like flavor than plain simple syrup.",
    },
    {
      title: "Siciliano Coffee Spritz Mocktail",
      description:
        "**Intro:** Siciliano Coffee Spritz Mocktail is a light sparkling coffee drink with cold brew, white grape juice, lemon, coffee syrup, and club soda. It is designed to feel like an aperitif-style drink without alcohol.\n\n**Ingredients:**\n- 2 oz cold brew coffee\n- 1 oz white grape juice\n- 0.5 oz lemon juice\n- 0.5 oz coffee syrup\n- Club soda to top\n- Ice\n- Orange twist for garnish\n\n**Instructions:**\n1. Fill a rocks or highball glass with ice.\n2. Add cold brew coffee, white grape juice, lemon juice, and coffee syrup.\n3. Stir gently until the base is mixed.\n4. Top with club soda for a light sparkling finish.\n5. Stir once, carefully, to avoid losing too much fizz.\n6. Garnish with an orange twist.\n\n**Serving note:** White grape juice adds gentle sweetness and helps replace the fruit-like character usually found in aperitif drinks.",
    },
    {
      title: "Chocolate Mudslide Coffee",
      description:
        "**Intro:** Chocolate Mudslide Coffee is a rich frozen-style coffee dessert drink. It keeps the creamy mood of a mudslide but uses espresso, chocolate, milk, and ice cream instead of liqueurs.\n\n**Ingredients:**\n- 1 shot espresso, cooled\n- 0.5 cup milk\n- 1 scoop vanilla ice cream\n- 1 tbsp chocolate syrup\n- Ice\n- Optional: whipped cream\n\n**Instructions:**\n1. Brew espresso and let it cool completely.\n2. Add cooled espresso, milk, vanilla ice cream, chocolate syrup, and ice to a blender.\n3. Blend until smooth and creamy.\n4. If the drink is too thin, add more ice cream or ice and blend again.\n5. Pour into a chilled glass.\n6. Top with whipped cream and drizzle with extra chocolate syrup if desired.\n\n**Tip:** For a thicker dessert drink, use less milk and add an extra half scoop of ice cream.",
    },
    {
      title: "Mint Espresso Cooler",
      description:
        "**Intro:** Mint Espresso Cooler is a bright iced coffee drink with espresso, mint, syrup, and sparkling water. It is fresh, aromatic, and lighter than cream-based coffee drinks.\n\n**Ingredients:**\n- 1 shot espresso, cooled\n- 6-8 fresh mint leaves\n- 0.5 oz simple syrup\n- Sparkling water to top\n- Ice\n- Mint sprig for garnish\n\n**Instructions:**\n1. Place mint leaves and simple syrup in a glass.\n2. Press the mint gently with a spoon to release its aroma.\n3. Add ice to the glass.\n4. Pour in the cooled espresso.\n5. Top with sparkling water.\n6. Stir gently and garnish with a fresh mint sprig.\n\n**Flavor note:** Do not crush the mint too hard because broken mint leaves can make the drink taste bitter.",
    },
    {
      title: "Pineapple Cold Brew Cooler",
      description:
        "**Intro:** Pineapple Cold Brew Cooler is a tropical coffee mocktail with cold brew, pineapple juice, lime juice, and simple syrup. It is fruity, bright, and surprisingly balanced.\n\n**Ingredients:**\n- 2 oz cold brew coffee\n- 2 oz pineapple juice\n- 0.5 oz fresh lime juice\n- 0.5 oz simple syrup\n- Ice\n- Pineapple wedge or lime wheel for garnish\n\n**Instructions:**\n1. Add cold brew coffee, pineapple juice, lime juice, simple syrup, and ice to a shaker.\n2. Shake for 10-15 seconds until the mixture is cold.\n3. Strain into a rocks glass filled with fresh ice.\n4. Taste and add a little more lime if you want extra sharpness.\n5. Garnish with a pineapple wedge or lime wheel.\n6. Serve immediately while cold.\n\n**Taste note:** Pineapple adds sweetness while lime keeps the drink sharp and refreshing.",
    },
    {
      title: "Espresso Tonic",
      description:
        "**Intro:** Espresso Tonic is a crisp and modern coffee drink made with chilled tonic water and espresso. It is fizzy, slightly bitter, and refreshing, especially when served over plenty of ice.\n\n**Ingredients:**\n- 1 shot espresso, slightly cooled\n- 4 oz chilled tonic water\n- Ice\n- Lemon or orange wedge for garnish\n\n**Instructions:**\n1. Brew one shot of espresso and let it cool for a short time.\n2. Fill a tall glass with ice.\n3. Pour chilled tonic water into the glass first.\n4. Slowly pour the espresso over the tonic to create a layered effect.\n5. Garnish with a lemon or orange wedge.\n6. Stir gently before drinking if you prefer a blended flavor.\n\n**Tip:** Pour the espresso slowly over the ice or the back of a spoon to reduce foaming and keep the layers cleaner.",
    },
    {
      title: "Cherry Espresso Fizz",
      description:
        "**Intro:** Cherry Espresso Fizz is a fruity coffee mocktail with cherry juice, espresso, lemon, and sparkling water. It has a deep red color and a sweet-tart flavor that works well with roasted coffee notes.\n\n**Ingredients:**\n- 1 shot espresso, cooled\n- 2 oz cherry juice\n- 0.5 oz lemon juice\n- 0.5 oz simple syrup, optional\n- Sparkling water to top\n- Ice\n- Cherry or lemon peel for garnish\n\n**Instructions:**\n1. Fill a glass with ice.\n2. Add cherry juice, lemon juice, simple syrup, and cooled espresso.\n3. Stir gently until the coffee and fruit juice combine.\n4. Top with sparkling water.\n5. Stir once more very lightly.\n6. Garnish with a cherry or lemon peel.\n\n**Tip:** Use tart cherry juice if you want a sharper drink, or sweet cherry juice if you want a softer dessert-style flavor.",
    },
    {
      title: "Classic Affogato",
      description:
        "**Intro:** Classic Affogato is a simple Italian-style coffee dessert made with hot espresso poured over vanilla gelato or ice cream. It is creamy, bold, and ready in minutes.\n\n**Ingredients:**\n- 1 scoop vanilla gelato or ice cream\n- 1 shot hot espresso\n- Optional: shaved chocolate or crushed nuts\n\n**Instructions:**\n1. Place one scoop of vanilla gelato or ice cream in a small glass or dessert cup.\n2. Brew a fresh hot espresso shot.\n3. Pour the espresso directly over the gelato while it is still hot.\n4. Add shaved chocolate or crushed nuts if desired.\n5. Serve immediately with a spoon before the gelato melts completely.\n\n**Serving note:** The contrast between hot espresso and cold gelato is the main pleasure of this dessert.",
    },
    {
      title: "Orange Cinnamon Cold Brew Punch",
      description:
        "**Intro:** Orange Cinnamon Cold Brew Punch is a shareable alcohol-free coffee drink with cold brew, orange juice, cinnamon, citrus peel, and syrup. It works well for brunch, holidays, or family gatherings.\n\n**Ingredients:**\n- 2 cups cold brew coffee\n- 1 cup fresh orange juice\n- 0.5 cup simple syrup\n- 2 strips orange peel\n- 2 cinnamon sticks\n- Ice\n- Orange slices for garnish\n\n**Instructions:**\n1. Add orange peel, cinnamon sticks, and simple syrup to a pitcher.\n2. Let the mixture sit for 20-30 minutes so the syrup absorbs the citrus and cinnamon flavor.\n3. Add cold brew coffee and fresh orange juice.\n4. Stir well and taste for sweetness.\n5. Chill in the refrigerator until ready to serve.\n6. Serve over ice and garnish with orange slices.\n\n**Tip:** Prepare it shortly before serving so the orange juice keeps its fresh flavor.",
    },
    {
      title: "Espresso Milk Punch Mocktail",
      description:
        "**Intro:** Espresso Milk Punch Mocktail is a creamy chilled coffee drink with espresso, milk, syrup, vanilla, and nutmeg. It is smooth, comforting, and lightly frothy.\n\n**Ingredients:**\n- 1 shot espresso, cooled\n- 1 cup whole milk or half-and-half\n- 0.5 oz simple syrup\n- 0.25 tsp vanilla extract\n- Ice\n- Grated nutmeg or cocoa powder for garnish\n\n**Instructions:**\n1. Brew one shot of espresso and let it cool completely.\n2. Add cooled espresso, milk or half-and-half, simple syrup, vanilla, and ice to a shaker.\n3. Shake hard for about 15 seconds until chilled and lightly frothy.\n4. Strain into a rocks glass filled with fresh ice.\n5. Garnish with grated nutmeg or cocoa powder.\n6. Serve cold.\n\n**Tip:** Half-and-half makes the drink richer, while whole milk keeps it lighter and more drinkable.",
    },
    {
      title: "Basil Pineapple Coffee Fizz",
      description:
        "**Intro:** Basil Pineapple Coffee Fizz is a tropical alcohol-free coffee drink with coffee concentrate, pineapple juice, lime juice, basil, and club soda. It is unusual, bright, and refreshing.\n\n**Ingredients:**\n- 2 oz coffee concentrate or strong cold brew\n- 1 oz pineapple juice\n- 0.5 oz lime juice\n- 0.5 oz simple syrup\n- Club soda to top\n- Ice\n- 3 fresh basil leaves for garnish\n\n**Instructions:**\n1. Add coffee concentrate, pineapple juice, lime juice, simple syrup, and ice to a shaker.\n2. Shake for 10-15 seconds until the mixture is cold.\n3. Strain into a tall glass filled with fresh ice.\n4. Top with club soda.\n5. Gently clap the basil leaves between your hands to release aroma, then place them on top.\n6. Serve immediately.\n\n**Taste note:** Basil adds a fresh herbal aroma that works well with pineapple and coffee.",
    },
    {
      title: "Ginger Stout-Style Cold Brew",
      description:
        "**Intro:** Ginger Stout-Style Cold Brew is a dark and spicy alcohol-free coffee drink inspired by roasted stout flavors. Coffee, ginger syrup, brown sugar, cocoa, and sparkling water create depth without beer or whiskey.\n\n**Ingredients:**\n- 3 oz cold brew coffee\n- 0.75 oz ginger brown sugar syrup\n- 1 oz sparkling water\n- Ice\n- Optional: pinch of cocoa powder\n\n**Instructions:**\n1. Prepare ginger brown sugar syrup by mixing strong ginger tea or ginger juice with brown sugar.\n2. Fill a rocks glass with ice.\n3. Add cold brew coffee and ginger brown sugar syrup.\n4. Stir until the drink is chilled and balanced.\n5. Top with sparkling water.\n6. Add a tiny pinch of cocoa powder if desired.\n\n**Tip:** Cocoa powder adds a roasted note that gives the drink a darker, stout-like character without using beer.",
    },
    {
      title: "Affogato Cream Martini Mocktail",
      description:
        "**Intro:** Affogato Cream Martini Mocktail is a dessert-style drink served in a martini glass with espresso, cream, coffee syrup, and vanilla gelato. It feels elegant and special without any alcohol.\n\n**Ingredients:**\n- 1 shot espresso, cooled\n- 1 oz coffee syrup\n- 1 oz heavy cream or milk\n- 1 small scoop vanilla gelato\n- Ice\n- Coffee beans or cocoa powder for garnish\n\n**Instructions:**\n1. Place a small scoop of vanilla gelato in a chilled martini glass.\n2. Add cooled espresso, coffee syrup, cream, and ice to a shaker.\n3. Shake for a few seconds until the mixture is cold and lightly frothy.\n4. Strain the mixture over the gelato.\n5. Garnish with coffee beans or a light dusting of cocoa powder.\n6. Serve immediately before the gelato melts too much.\n\n**Serving note:** It works as both a mocktail and a small coffee dessert.",
    },
  ],
  null,
  2
);

const EVEN_FULL_PAGE_TEXT_SAMPLE_COFFEE_COCKTAILS = JSON.stringify(
  [
    {
      title: "Espresso Martini",
      description:
        "**Intro:** The Espresso Martini is a sleek coffee cocktail with a bold espresso base, smooth vodka, and sweet coffee liqueur. It is often served as a stylish evening drink, a dinner-party cocktail, or a rich after-dinner treat.\n\n**Ingredients:**\n- 1 shot fresh espresso, cooled slightly\n- 2 oz vodka\n- 1.5 oz coffee liqueur\n- 0.5 oz simple syrup, optional\n- Ice\n- 3 whole coffee beans for garnish\n\n**Instructions:**\n1. Brew a fresh shot of espresso and let it cool for a short moment so it does not melt the ice too quickly.\n2. Add vodka, coffee liqueur, espresso, and simple syrup to a cocktail shaker.\n3. Fill the shaker with ice and shake hard for 15-20 seconds until the drink becomes cold and frothy.\n4. Double strain into a chilled martini or coupe glass for a smooth finish.\n5. Garnish with 3 coffee beans on the foam.\n\n**Tip:** *A strong espresso gives the best foam and the richest coffee flavor.*",
    },
    {
      title: "Irish Coffee",
      description:
        "**Intro:** Irish Coffee is a warm classic made with hot coffee, Irish whiskey, brown sugar, and a soft cream layer. It is comforting, rich, and perfect for cold evenings or relaxed after-dinner moments.\n\n**Ingredients:**\n- 1 cup freshly brewed hot coffee\n- 1.5 oz Irish whiskey\n- 1-2 tsp brown sugar\n- 1-2 tbsp lightly whipped heavy cream\n\n**Instructions:**\n1. Warm the glass with hot water, then discard the water before building the drink.\n2. Add brown sugar and Irish whiskey to the warm glass.\n3. Stir until the sugar dissolves fully.\n4. Pour in the hot coffee, leaving space at the top for the cream.\n5. Float the lightly whipped cream over the back of a spoon.\n\n**Serving note:** *Do not stir the cream into the coffee; drink through the cream for the traditional texture.*",
    },
    {
      title: "Spanish Coffee",
      description:
        "**Intro:** Spanish Coffee is a dramatic warm cocktail with coffee, rum or brandy, coffee liqueur, and a sugared rim. Some versions are flambeed to caramelize the sugar and add a deeper toasted flavor.\n\n**Ingredients:**\n- 0.75 oz coffee liqueur\n- 0.5 oz dark rum or brandy\n- 1 cup freshly brewed hot coffee\n- 1 tbsp granulated sugar for the rim\n- Optional garnish: grated nutmeg, cinnamon, or orange zest\n\n**Instructions:**\n1. Use a heatproof glass or mug.\n2. Moisten the rim with citrus and dip it into granulated sugar.\n3. Add coffee liqueur and rum or brandy to the glass.\n4. Carefully flambe the spirits if desired, then extinguish by pouring in hot coffee.\n5. Garnish with nutmeg, cinnamon, or orange zest.\n\n**Safety note:** *Only flambe if you are comfortable handling flame and always use a heatproof glass.*",
    },
    {
      title: "White Russian",
      description:
        "**Intro:** The White Russian is a creamy coffee cocktail made with vodka, coffee liqueur, and cream. It has a dessert-like character and is usually served slowly over ice.\n\n**Ingredients:**\n- 1.5 oz vodka\n- 1 oz coffee liqueur\n- 1 oz heavy cream or milk\n- Ice\n\n**Instructions:**\n1. Fill a rocks glass with ice cubes.\n2. Pour vodka over the ice.\n3. Add coffee liqueur.\n4. Slowly pour cream over the top for a layered look.\n5. Stir gently if you prefer a fully mixed drink.\n\n**Tip:** *Heavy cream makes it richer, while milk gives a lighter version.*",
    },
    {
      title: "Black Russian",
      description:
        "**Intro:** The Black Russian is simple, bold, and coffee-forward. It uses only vodka and coffee liqueur, making it an easy cocktail for people who enjoy dark, strong flavors without cream.\n\n**Ingredients:**\n- 1.5 oz vodka\n- 1 oz coffee liqueur\n- Ice\n\n**Instructions:**\n1. Fill a rocks glass with ice.\n2. Pour vodka over the ice.\n3. Add coffee liqueur.\n4. Stir gently until the drink is well combined.\n5. Serve immediately.\n\n**Taste note:** *It is stronger and sharper than a White Russian because there is no cream to soften it.*",
    },
    {
      title: "Cold Brew Negroni",
      description:
        "**Intro:** The Cold Brew Negroni is a modern variation of the classic Negroni. Instead of gin, it uses cold brew coffee to create a bittersweet, smooth, and aromatic drink.\n\n**Ingredients:**\n- 1 oz cold brew coffee\n- 1 oz Campari\n- 1 oz sweet vermouth\n- Ice\n- Orange twist or orange slice for garnish\n\n**Instructions:**\n1. Fill a mixing glass with ice.\n2. Add cold brew coffee, Campari, and sweet vermouth.\n3. Stir for 20-30 seconds until chilled and lightly diluted.\n4. Strain into a rocks glass filled with fresh ice.\n5. Garnish with an orange twist or slice.\n\n**Tip:** *Use a smooth cold brew so the bitterness stays balanced rather than harsh.*",
    },
    {
      title: "Amaretto Coffee",
      description:
        "**Intro:** Amaretto Coffee is a warm, nutty, and sweet coffee cocktail. The almond flavor of amaretto blends well with hot coffee, making it a cozy dessert-style drink.\n\n**Ingredients:**\n- 1 cup hot brewed coffee\n- 1.5 oz amaretto liqueur\n- Whipped cream for topping\n- Optional garnish: sliced almonds, cocoa powder, or chocolate shavings\n\n**Instructions:**\n1. Brew a fresh cup of hot coffee.\n2. Pour amaretto into a heatproof mug or glass.\n3. Add the hot coffee and stir gently.\n4. Top with whipped cream.\n5. Garnish with almonds, cocoa powder, or chocolate shavings if desired.\n\n**Tip:** *A medium or dark roast works well because it balances the sweetness of the liqueur.*",
    },
    {
      title: "Coffee Old Fashioned",
      description:
        "**Intro:** The Coffee Old Fashioned gives the classic whiskey cocktail a caffeinated twist. Coffee adds depth, while bitters and syrup keep the drink balanced and aromatic.\n\n**Ingredients:**\n- 2 oz bourbon or rye whiskey\n- 1 oz cold brew coffee or cooled espresso\n- 0.25 oz simple syrup\n- 2 dashes Angostura bitters\n- Ice\n- Orange twist and coffee beans for garnish\n\n**Instructions:**\n1. Place a large ice cube in a rocks glass.\n2. Add whiskey, cold brew or espresso, simple syrup, and bitters.\n3. Stir for 20-30 seconds until chilled.\n4. Twist orange peel over the glass to release the oils.\n5. Garnish with the orange peel and a few coffee beans.\n\n**Taste note:** *Bourbon makes it rounder and sweeter, while rye gives a spicier finish.*",
    },
    {
      title: "Siciliano",
      description:
        "**Intro:** The Siciliano is a light and bittersweet coffee cocktail with cold brew, sweet vermouth, coffee liqueur, and sparkling water. It feels refreshing while still keeping a complex coffee flavor.\n\n**Ingredients:**\n- 2 oz cold brew coffee\n- 1.5 oz sweet vermouth\n- 0.5 oz coffee liqueur\n- 1 oz sparkling water or club soda\n- Ice\n- Orange twist for garnish\n\n**Instructions:**\n1. Fill a rocks or highball glass with ice.\n2. Add cold brew coffee, sweet vermouth, and coffee liqueur.\n3. Top with sparkling water or club soda.\n4. Stir gently so the fizz remains fresh.\n5. Garnish with an orange twist.\n\n**Tip:** *Serve it before dinner as a lighter coffee aperitif.*",
    },
    {
      title: "Mudslide",
      description:
        "**Intro:** The Mudslide is a creamy dessert cocktail that combines vodka, coffee liqueur, and Irish cream. It is rich, smooth, and often served as a sweet after-dinner drink.\n\n**Ingredients:**\n- 1 oz vodka\n- 1 oz coffee liqueur\n- 1 oz Irish cream liqueur\n- Ice\n- Optional: 1 oz heavy cream or milk\n\n**Instructions:**\n1. Add vodka, coffee liqueur, Irish cream, and ice to a cocktail shaker.\n2. Add heavy cream or milk if you want an extra creamy drink.\n3. Shake hard for 10-15 seconds.\n4. Strain into a glass filled with fresh ice.\n5. Serve cold.\n\n**Tip:** *For a dessert version, drizzle chocolate syrup inside the glass before pouring.*",
    },
    {
      title: "Death by Morning",
      description:
        "**Intro:** Death by Morning is a bold coffee cocktail inspired by absinthe-based classics. It combines espresso, absinthe, minty liqueur, bitters, salt, and citrus aroma for a complex drink.\n\n**Ingredients:**\n- 0.75 oz absinthe\n- 0.5 oz Branca Menta\n- 0.5 oz coffee liqueur\n- 1.5 oz cooled espresso or cold brew concentrate\n- 1 barspoon demerara sugar\n- 1 dash Angostura bitters\n- 1 pinch coarse sea salt\n- 1 orange twist\n- Ice\n- Mint sprig for garnish\n\n**Instructions:**\n1. Brew espresso and let it cool slightly.\n2. Add absinthe, Branca Menta, coffee liqueur, espresso, sugar, bitters, salt, and ice to a shaker.\n3. Shake vigorously until very cold.\n4. Double strain into a Nick and Nora glass.\n5. Express orange peel oils over the drink, discard the peel, and garnish with mint.\n\n**Flavor note:** *The absinthe adds an herbal anise flavor, while the coffee keeps the drink dark and rich.*",
    },
    {
      title: "Roman Holiday",
      description:
        "**Intro:** Roman Holiday is a refreshing coffee cocktail with amaro, Campari, cold brew, pineapple, lime, and demerara syrup. It has tropical brightness with a bitter coffee edge.\n\n**Ingredients:**\n- 1 oz amaro liqueur\n- 0.25 oz Campari\n- 1 oz cold brew coffee\n- 0.75 oz fresh pineapple juice\n- 0.75 oz fresh lime juice\n- 0.25 oz demerara syrup\n- 1 pinch sea salt\n- Crushed ice\n- Cinnamon stick or lime wedge for garnish\n\n**Instructions:**\n1. Add amaro, Campari, cold brew, pineapple juice, lime juice, demerara syrup, and salt to a shaker with ice.\n2. Shake for 10-15 seconds until chilled.\n3. Strain into a double rocks glass over crushed ice.\n4. Garnish with a cinnamon stick or lime wedge.\n5. Serve immediately.\n\n**Taste note:** *The pineapple and lime make it bright, while the coffee and amaro keep it deep and bittersweet.*",
    },
    {
      title: "Espresso Gin and Tonic",
      description:
        "**Intro:** Espresso Gin and Tonic is a modern drink that mixes gin, tonic water, and espresso. It is fizzy, bitter, botanical, and surprisingly refreshing.\n\n**Ingredients:**\n- 1 oz freshly brewed espresso, slightly cooled\n- 1.5 oz gin\n- 3-4 oz chilled tonic water\n- Ice\n- Lemon wedge, lime wedge, or rosemary sprig for garnish\n\n**Instructions:**\n1. Fill a highball or rocks glass with ice.\n2. Add gin to the glass.\n3. Pour in chilled tonic water, leaving room for espresso.\n4. Slowly pour cooled espresso over the tonic for a layered look.\n5. Garnish with citrus or rosemary.\n\n**Tip:** *Stir gently only if you want the espresso fully mixed into the tonic.*",
    },
    {
      title: "Kirsch au Cafe",
      description:
        "**Intro:** Kirsch au Cafe is a cherry and coffee cocktail with cognac, kirsch, Cherry Heering, egg white, and espresso. It is fruity, rich, and slightly creamy from the foam.\n\n**Ingredients:**\n- 1 oz cognac\n- 0.75 oz kirsch\n- 0.75 oz Cherry Heering\n- 0.5 oz simple syrup\n- 0.5 oz egg white\n- 1.5 oz espresso\n- Ice\n\n**Instructions:**\n1. Brew espresso and set it aside.\n2. Add cognac, kirsch, Cherry Heering, simple syrup, and egg white to a shaker.\n3. Dry shake without ice to build foam.\n4. Add espresso and ice, then shake again until chilled.\n5. Double strain into a cocktail glass.\n\n**Tip:** *A fruit-forward coffee works especially well because it supports the cherry notes.*",
    },
    {
      title: "Irish Affogato",
      description:
        "**Intro:** Irish Affogato is a boozy dessert drink where hot espresso and Irish whiskey melt into vanilla gelato or ice cream. It is simple, creamy, and elegant.\n\n**Ingredients:**\n- 1 scoop vanilla gelato or ice cream\n- 1 shot hot espresso\n- 1 oz Irish whiskey\n\n**Instructions:**\n1. Place one scoop of vanilla gelato in a clear glass or mug.\n2. Drizzle Irish whiskey over the gelato.\n3. Brew a fresh hot espresso.\n4. Pour the espresso over the gelato immediately.\n5. Serve at once with a spoon.\n\n**Serving note:** *The contrast of hot espresso and cold gelato is the main pleasure of this drink.*",
    },
    {
      title: "Cafe Correccion Ponche",
      description:
        "**Intro:** Cafe Correccion Ponche is a festive coffee rum punch made with cold brew, anejo rum, sweet vermouth, orange juice, syrup, and cinnamon. It is ideal for sharing with a group.\n\n**Ingredients:**\n- 1.5 tsp demerara sugar\n- 2 strips orange peel\n- 1.5 cups anejo rum\n- 0.5 cup sweet vermouth\n- 1 cup cold brew coffee\n- 0.5 cup fresh orange juice\n- 0.5 cup simple syrup\n- Cracked ice\n- Freshly ground cinnamon for garnish\n- 4 cinnamon sticks for garnish\n\n**Instructions:**\n1. Muddle demerara sugar with orange peels in a large bowl or pitcher to release the citrus oils.\n2. Let the mixture rest for about 1 hour.\n3. Add rum, sweet vermouth, cold brew coffee, orange juice, simple syrup, and cracked ice.\n4. Stir well, then strain into a punch bowl with a large ice block.\n5. Finish with ground cinnamon and serve with cinnamon sticks.\n\n**Tip:** *Make it shortly before serving so the citrus and coffee stay fresh.*",
    },
    {
      title: "Espresso Milk Punch",
      description:
        "**Intro:** Espresso Milk Punch is a creamy brunch-style cocktail with espresso, bourbon or rum, chicory liqueur, milk, and syrup. It is smooth, rich, and lightly frothy.\n\n**Ingredients:**\n- 1 oz freshly brewed and cooled espresso\n- 1.5 oz bourbon or dark rum\n- 0.16 oz chicory liqueur\n- 1 oz whole milk or half-and-half\n- 0.5 oz simple syrup\n- Ice\n- Grated nutmeg or cocoa powder for garnish\n\n**Instructions:**\n1. Add cooled espresso, bourbon or rum, chicory liqueur, milk, and simple syrup to a shaker.\n2. Fill the shaker with ice.\n3. Shake vigorously for about 15 seconds until chilled and frothy.\n4. Strain into a rocks glass filled with fresh ice.\n5. Garnish with grated nutmeg or cocoa powder.\n\n**Tip:** *Half-and-half makes the drink thicker and more dessert-like.*",
    },
    {
      title: "Spark and Stormy",
      description:
        "**Intro:** Spark and Stormy is a tropical coffee cocktail inspired by the Dark and Stormy. It combines Drambuie, mezcal, coffee concentrate, pineapple juice, and club soda.\n\n**Ingredients:**\n- 1 oz Drambuie\n- 0.5 oz mezcal\n- 2 oz coffee concentrate\n- 1 oz pineapple juice\n- Club soda to top\n- Ice\n- 3 fresh basil leaves for garnish\n\n**Instructions:**\n1. Add Drambuie, mezcal, coffee concentrate, pineapple juice, and ice to a shaker.\n2. Shake vigorously until chilled.\n3. Double strain over fresh ice in a tall glass.\n4. Top with club soda.\n5. Garnish with fresh basil leaves.\n\n**Taste note:** *Mezcal brings smoke, pineapple brings brightness, and coffee gives the drink a deep base.*",
    },
    {
      title: "Eye Opener",
      description:
        "**Intro:** Eye Opener is a strong coffee cocktail that brings together whiskey, ginger brown sugar syrup, cold brew, and stout beer. It is bold, dark, and full of layered flavor.\n\n**Ingredients:**\n- 1.5 oz whiskey\n- 0.75 oz ginger brown sugar syrup\n- 3 oz cold brew coffee\n- 1 oz stout beer\n\n**Instructions:**\n1. Prepare ginger brown sugar syrup by blending equal parts fresh ginger juice and dark brown sugar.\n2. Add whiskey, syrup, and cold brew coffee to a mixing glass with ice.\n3. Stir until well chilled.\n4. Strain into a rocks glass.\n5. Dry shake the stout and pour it on top.\n\n**Tip:** *Use a rich stout with roasted notes so it blends naturally with the cold brew.*",
    },
    {
      title: "Affogato Martini",
      description:
        "**Intro:** Affogato Martini is a dessert cocktail inspired by the Italian affogato. It combines espresso, vodka, coffee liqueur, Irish cream, and vanilla gelato for a creamy finish.\n\n**Ingredients:**\n- 1 shot fresh espresso, cooled\n- 1 oz vodka\n- 1 oz coffee liqueur\n- 1 oz Irish cream liqueur\n- 1 small scoop vanilla gelato\n- Ice\n\n**Instructions:**\n1. Place a small scoop of vanilla gelato in a chilled martini glass.\n2. Add cooled espresso, vodka, coffee liqueur, Irish cream, and ice to a shaker.\n3. Shake for a few seconds until chilled and frothy.\n4. Strain the cocktail over the gelato.\n5. Serve immediately.\n\n**Serving note:** *It works as both a cocktail and a small dessert.*",
    },
  ],
  null,
  2
);

const EVEN_FULL_PAGE_TEXT_SAMPLE_SPACE = JSON.stringify(
  [
    {
      title: "Voyager 1",
      description:
        "1. Voyager 1 launched in 1977 and is the farthest human-made object from Earth.\n2. It visited Jupiter and Saturn before continuing toward interstellar space.\n3. The spacecraft carries the Golden Record, a time capsule of sounds and images from Earth.\n4. Engineers still communicate with it across billions of miles, although the signal takes many hours to travel.\n5. Its journey has reshaped how we understand the outer solar system and the boundary of the Sun's influence.",
    },
    {
      title: "Europa",
      description:
        "1. Europa is one of Jupiter's largest moons and is covered by a bright shell of water ice.\n2. Scientists suspect a global liquid ocean may exist beneath that frozen crust.\n3. Cracks and streaks across the surface suggest the ice has shifted and refrozen many times.\n4. Because water, chemistry, and internal heat may all be present, Europa is one of the most promising places to search for life beyond Earth.\n5. Missions now focus on mapping the moon in detail and studying how thick the ice shell may be.",
    },
    {
      title: "Auroras",
      description:
        "1. Auroras appear when charged particles from the Sun interact with gases in a planet's atmosphere.\n2. On Earth, these events are most common near the polar regions where magnetic field lines guide the particles downward.\n3. Oxygen can glow green or red, while nitrogen often produces blue or purple tones.\n4. Strong solar storms can push auroras farther from the poles and make them visible in unusual places.\n5. Beyond Earth, giant planets like Jupiter and Saturn also have powerful auroras driven by their magnetic environments.",
    },
  ],
  null,
  2
);

const EVEN_FULL_PAGE_TEXT_SAMPLES = [
  { label: "Winter Sports", value: EVEN_FULL_PAGE_TEXT_SAMPLE_WINTER_SPORTS },
  { label: "Coffee Guide", value: EVEN_FULL_PAGE_TEXT_SAMPLE_COFFEE },
  { label: "Coffee Cocktails", value: EVEN_FULL_PAGE_TEXT_SAMPLE_COFFEE_COCKTAILS },
  { label: "Space Facts", value: EVEN_FULL_PAGE_TEXT_SAMPLE_SPACE },
] as const;

export function GeneratorApp(props: GeneratorAppProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [mode, setMode] = useState<ModeValue>("full-fact");
  const [facts, setFacts] = useState(props.initialFacts?.trim() ? props.initialFacts : STACKED_EVEN_FACTS_PLACEHOLDER);
  const [list, setList] = useState(props.initialList ?? "");
  const [listDescription, setListDescription] = useState(props.initialListDescription ?? "");
  const [imageLibrary] = useState(props.defaultImageLibrary ?? "../images");
  const [pageSize, setPageSize] = useState<PageSizeValue>("square");
  const [pageCount, setPageCount] = useState(getDefaultPageCount("square"));
  const [uploadedBackgroundFiles, setUploadedBackgroundFiles] = useState<File[]>([]);
  const [uploadedContentFiles, setUploadedContentFiles] = useState<File[]>([]);
  const [uploadedSequentialBackgroundImages, setUploadedSequentialBackgroundImages] = useState(false);
  const [uploadedShowPageNumbers, setUploadedShowPageNumbers] = useState(false);
  const [uploadedPageNumberPosition, setUploadedPageNumberPosition] =
    useState<UploadedPageNumberPosition>("alternating");
  const [uploadedContentPadding, setUploadedContentPadding] = useState(0.32);
  const [uploadedStretchContentImages, setUploadedStretchContentImages] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.9);
  const [numberBadgeColor, setNumberBadgeColor] = useState<NumberBadgeColorKey>(DEFAULT_NUMBER_BADGE_COLOR);
  const [describedPictureTextAlignment, setDescribedPictureTextAlignment] =
    useState<DescribedPictureTextAlignment>("center");
  const [describedPictureMaxBoxWidth, setDescribedPictureMaxBoxWidth] = useState(
    getDefaultDescribedPictureMaxBoxWidth("full-fact")
  );
  const [evenFullPageTextBoxHeight, setEvenFullPageTextBoxHeight] = useState(getDefaultEvenFullPageTextBoxHeight());
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
  const isUploadedImagesMode = mode === "uploaded-images";

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
      nextMode === "fully-described-images" ||
      nextMode === "even-full-page-text"
    ) {
      setDescribedPictureMaxBoxWidth(getDefaultDescribedPictureMaxBoxWidth(nextMode));
    }
    if (nextMode === "even-full-page-text") {
      setEvenFullPageTextBoxHeight(getDefaultEvenFullPageTextBoxHeight());
    }
  }, []);

  const handlePageSizeSelect = useCallback(
    (nextPageSize: PageSizeValue) => {
      const shouldResetPageCount = pageCount === getDefaultPageCount(pageSize);
      setPageSize(nextPageSize);
      if (!isUploadedImagesMode && shouldResetPageCount) {
        setPageCount(getDefaultPageCount(nextPageSize));
      }
    },
    [isUploadedImagesMode, pageCount, pageSize]
  );

  useEffect(() => {
    setStep(parseWizardStep(searchParams.get("step")));
  }, [searchParams]);

  useEffect(() => {
    if (isUploadedImagesMode && uploadedContentFiles.length > 0) {
      setPageCount(Math.min(200, Math.max(1, uploadedContentFiles.length)));
    }
  }, [isUploadedImagesMode, uploadedContentFiles.length]);

  useEffect(() => {
    if (isUploadedImagesMode && step > 2) {
      navigateToStep(2);
    }
  }, [isUploadedImagesMode, navigateToStep, step]);

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

  const needsOverlayOpacity = !["image-only", "dictionary", "uploaded-images"].includes(mode);
  const needsFacts = ["facts", "facts-both", "full-fact"].includes(mode);
  const isBasicDescribedPicturesMode = ["described-pictures", "even-described-pictures"].includes(mode);
  const isFullyDescribedImagesMode = mode === "fully-described-images";
  const isEvenFullPageTextMode = mode === "even-full-page-text";
  const supportsSplitTitleAndParagraphFonts = isFullyDescribedImagesMode || isEvenFullPageTextMode;
  const isCaptionBoxMode = isBasicDescribedPicturesMode || isFullyDescribedImagesMode;
  const needsList = ["list", "described-pictures", "even-described-pictures"].includes(mode);
  const needsListDescription = [
    "list-description",
    "list-description-even",
    "fully-described-images",
    "even-full-page-text",
  ].includes(mode);
  const supportsCircleColor = ["facts", "facts-both", "full-fact"].includes(mode);
  const supportsTextFontSelection = mode === "full-fact" || isCaptionBoxMode || isEvenFullPageTextMode;
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

  const handleFullFactFontSourceOpen = useCallback(() => {
    setIsFullFactFontSourceMenuOpen(true);
    setIsFullFactFontSourceFiltering(false);
    fullFactFontSourceInputRef.current?.focus();
  }, []);

  const handleFullFactFontSourceToggle = useCallback(() => {
    if (isFullFactFontSourceMenuOpen) {
      closeFullFactFontSourceMenu();
      return;
    }
    handleFullFactFontSourceOpen();
  }, [closeFullFactFontSourceMenu, handleFullFactFontSourceOpen, isFullFactFontSourceMenuOpen]);

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

  const handleFullFactFontVariantOpen = useCallback(() => {
    setIsFullFactFontVariantMenuOpen(true);
    setIsFullFactFontVariantFiltering(false);
    fullFactFontVariantInputRef.current?.focus();
  }, []);

  const handleFullFactFontVariantToggle = useCallback(() => {
    if (isFullFactFontVariantMenuOpen) {
      closeFullFactFontVariantMenu();
      return;
    }
    handleFullFactFontVariantOpen();
  }, [closeFullFactFontVariantMenu, handleFullFactFontVariantOpen, isFullFactFontVariantMenuOpen]);

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

  const handleFullyDescribedTitleFontSourceOpen = useCallback(() => {
    setIsFullyDescribedTitleFontSourceMenuOpen(true);
    setIsFullyDescribedTitleFontSourceFiltering(false);
    fullyDescribedTitleFontSourceInputRef.current?.focus();
  }, []);

  const handleFullyDescribedTitleFontSourceToggle = useCallback(() => {
    if (isFullyDescribedTitleFontSourceMenuOpen) {
      closeFullyDescribedTitleFontSourceMenu();
      return;
    }
    handleFullyDescribedTitleFontSourceOpen();
  }, [
    closeFullyDescribedTitleFontSourceMenu,
    handleFullyDescribedTitleFontSourceOpen,
    isFullyDescribedTitleFontSourceMenuOpen,
  ]);

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

  const handleFullyDescribedTitleFontVariantOpen = useCallback(() => {
    setIsFullyDescribedTitleFontVariantMenuOpen(true);
    setIsFullyDescribedTitleFontVariantFiltering(false);
    fullyDescribedTitleFontVariantInputRef.current?.focus();
  }, []);

  const handleFullyDescribedTitleFontVariantToggle = useCallback(() => {
    if (isFullyDescribedTitleFontVariantMenuOpen) {
      closeFullyDescribedTitleFontVariantMenu();
      return;
    }
    handleFullyDescribedTitleFontVariantOpen();
  }, [
    closeFullyDescribedTitleFontVariantMenu,
    handleFullyDescribedTitleFontVariantOpen,
    isFullyDescribedTitleFontVariantMenuOpen,
  ]);

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

  const addUploadedBackgroundFiles = useCallback((files: FileList | File[] | null | undefined) => {
    setUploadedBackgroundFiles((current) => appendUploadFiles(current, files));
  }, []);

  const addUploadedContentFiles = useCallback((files: FileList | File[] | null | undefined) => {
    setUploadedContentFiles((current) => appendUploadFiles(current, files));
  }, []);

  const handleUploadedBackgroundFiles = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      addUploadedBackgroundFiles(event.target.files);
      event.target.value = "";
    },
    [addUploadedBackgroundFiles]
  );

  const handleUploadedContentFiles = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      addUploadedContentFiles(event.target.files);
      event.target.value = "";
    },
    [addUploadedContentFiles]
  );

  const removeUploadedBackgroundFile = useCallback((index: number) => {
    setUploadedBackgroundFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }, []);

  const removeUploadedContentFile = useCallback((index: number) => {
    setUploadedContentFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }, []);

  const payload = useMemo(() => {
    const safePageCount = Number.isFinite(pageCount) ? pageCount : 59;
    const minPageCount = isUploadedImagesMode ? 1 : 4;
    const safeDescribedPictureMaxBoxWidth = getSafeDescribedPictureMaxBoxWidth(describedPictureMaxBoxWidth, mode);
    const safeEvenFullPageTextBoxHeight = getSafeEvenFullPageTextBoxHeight(evenFullPageTextBoxHeight);
    const base: Record<string, unknown> = {
      mode,
      imageLibrary,
      pageSize,
      pageCount: Math.max(minPageCount, Math.min(200, safePageCount)),
    };
    if (supportsCircleColor) {
      base.numberBadgeColor = numberBadgeColor;
    }
    if (isUploadedImagesMode) {
      const safeUploadedContentPadding = Number.isFinite(uploadedContentPadding) ? uploadedContentPadding : 0.32;
      base.contentPadding = Math.max(0, safeUploadedContentPadding) * 72;
      base.sequentialBackgroundImages = uploadedSequentialBackgroundImages;
      base.stretchContentImages = uploadedStretchContentImages;
      base.showPageNumbers = uploadedShowPageNumbers;
      if (uploadedShowPageNumbers) {
        base.numberBadgeColor = numberBadgeColor;
        base.pageNumberPosition = uploadedPageNumberPosition;
      }
    }
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
    if (mode === "full-fact" || isCaptionBoxMode || isEvenFullPageTextMode) {
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
    if (supportsSplitTitleAndParagraphFonts) {
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
    if (isCaptionBoxMode || isEvenFullPageTextMode) {
      base.describedPictureTextAlignment = describedPictureTextAlignment;
      base.describedPictureMaxBoxWidth = safeDescribedPictureMaxBoxWidth * 72;
      if (isEvenFullPageTextMode) {
        base.describedPictureBoxHeight = safeEvenFullPageTextBoxHeight * 72;
      }
    }
    if (mode === "dictionary") {
      base.targetImageSize = targetImageSize * 72;
    }
    return base;
  }, [
    mode,
    isUploadedImagesMode,
    isCaptionBoxMode,
    imageLibrary,
    numberBadgeColor,
    currentOpacity,
    uploadedContentPadding,
    uploadedPageNumberPosition,
    uploadedSequentialBackgroundImages,
    uploadedShowPageNumbers,
    uploadedStretchContentImages,
    needsOverlayOpacity,
    needsFacts,
    needsList,
    needsListDescription,
    facts,
    list,
    listDescription,
    describedPictureTextAlignment,
    describedPictureMaxBoxWidth,
    evenFullPageTextBoxHeight,
    factsPerPage,
    fullFactBoxFontId,
    fullyDescribedTitleFontId,
    selectedFullFactFont,
    selectedFullyDescribedTitleFont,
    isEvenFullPageTextMode,
    targetImageSize,
    pageSize,
    pageCount,
    supportsSplitTitleAndParagraphFonts,
    supportsCircleColor,
  ]);

  async function handleGenerate() {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (isUploadedImagesMode) {
        if (!uploadedContentFiles.length) {
          throw new Error("Upload at least one content image.");
        }
      }
      const request = isUploadedImagesMode
        ? buildMultipartGenerateRequest(payload, uploadedContentFiles, uploadedBackgroundFiles)
        : buildJsonGenerateRequest(payload);
      const response = await fetch("/api/generate", request);
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
              {isUploadedImagesMode ? "Next: Upload images" : "Next: Book specs"}
            </button>
          </div>
        </section>
      )}

      {step === 2 && isUploadedImagesMode && (
        <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Upload Template</p>
            <h3 className="text-lg font-semibold text-zinc-900">Uploaded Image Pages</h3>
            <p className="text-sm text-zinc-700">
              Backgrounds fill the page. Content images can stay centered inside the inset or stretch to the page.
            </p>
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {PAGE_SIZES.map((option) => {
                const isActive = option.value === pageSize;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handlePageSizeSelect(option.value)}
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-700">Number of pages</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={pageCount}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setPageCount(Number.isNaN(nextValue) ? 1 : nextValue);
                  }}
                  className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-sm font-medium text-zinc-700">Content image padding (inches)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={uploadedContentPadding}
                  disabled={uploadedStretchContentImages}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setUploadedContentPadding(Number.isNaN(nextValue) ? 0 : Math.max(0, nextValue));
                  }}
                  className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-black focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-400"
                />
                <span className="text-xs text-zinc-500">
                  {uploadedStretchContentImages
                    ? "Ignored while stretch mode is enabled."
                    : "Use 0 to fit content to the full page bounds."}
                </span>
              </label>
              <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-900">Stretch content images</span>
                  <span className="block text-xs text-zinc-600">
                    Distort images horizontally and vertically to match the PDF page size.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={uploadedStretchContentImages}
                  onChange={(event) => setUploadedStretchContentImages(event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-black"
                />
              </label>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <UploadedImagePicker
                inputId="background-upload"
                label="Background images"
                description={
                  uploadedSequentialBackgroundImages
                    ? "Used page by page from page 1, then repeated in upload order."
                    : "Optional. Stretched to the full PDF page."
                }
                files={uploadedBackgroundFiles}
                onFilesSelected={handleUploadedBackgroundFiles}
                onAddFiles={addUploadedBackgroundFiles}
                onRemoveFile={removeUploadedBackgroundFile}
                onClear={() => setUploadedBackgroundFiles([])}
              />
              <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-900">Sequential backgrounds</span>
                  <span className="block text-xs text-zinc-600">
                    Page 1 uses the first upload, page 2 the second, continuing in order.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={uploadedSequentialBackgroundImages}
                  onChange={(event) => setUploadedSequentialBackgroundImages(event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-black"
                />
              </label>
            </div>
            <UploadedImagePicker
              inputId="content-upload"
              label="Content images"
              description={
                uploadedStretchContentImages
                  ? "Stretched horizontally and vertically to match the full PDF page."
                  : `Centered and fitted with ${uploadedContentPadding.toFixed(2)}in padding.`
              }
              files={uploadedContentFiles}
              onFilesSelected={handleUploadedContentFiles}
              onAddFiles={addUploadedContentFiles}
              onRemoveFile={removeUploadedContentFile}
              onClear={() => setUploadedContentFiles([])}
            />
          </div>
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <label className="flex items-center justify-between gap-4">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-900">Circle page enumeration</span>
                <span className="block text-xs text-zinc-600">
                  Starts on page 2. Choose alternating bottom corners or bottom center.
                </span>
              </span>
              <input
                type="checkbox"
                checked={uploadedShowPageNumbers}
                onChange={(event) => setUploadedShowPageNumbers(event.target.checked)}
                className="h-5 w-5 shrink-0 accent-black"
              />
            </label>
            {uploadedShowPageNumbers ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { value: "alternating", label: "Left / Right", description: "Even pages left, odd pages right." },
                    { value: "center", label: "Bottom Center", description: "Every numbered page centered." },
                  ].map((option) => {
                    const isActive = option.value === uploadedPageNumberPosition;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setUploadedPageNumberPosition(option.value as UploadedPageNumberPosition)}
                        aria-pressed={isActive}
                        className={`flex min-w-0 flex-col gap-1 rounded-xl border bg-white px-3 py-2 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-black ${
                          isActive ? "border-black ring-1 ring-black" : "border-zinc-200 hover:border-black/40"
                        }`}
                      >
                        <span className="text-sm font-semibold text-zinc-900">{option.label}</span>
                        <span className="text-xs text-zinc-600">{option.description}</span>
                      </button>
                    );
                  })}
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
                        className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-black ${
                          isActive ? "border-black ring-1 ring-black" : "border-zinc-200 hover:border-black/40"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white shadow-sm"
                            style={{ backgroundColor: option.hex }}
                          >
                            2
                          </span>
                          <span className="truncate text-sm font-semibold text-zinc-900">{option.label}</span>
                        </span>
                        {isActive ? <span className="shrink-0 text-xs font-medium text-emerald-600">Selected</span> : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => navigateToStep(1)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
            >
              Back to templates
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full rounded-md bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60 sm:w-auto"
            >
              {isLoading ? "Generating..." : "Generate PDF"}
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}
        </section>
      )}

      {step === 2 && !isUploadedImagesMode && (
        <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Step 2</p>
            <h3 className="text-lg font-semibold text-zinc-900">Select page size & length</h3>
            <p className="text-sm text-zinc-700">Pick a trim size and how many pages to include in the PDF. (These sizes are for Bleed option)</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {PAGE_SIZES.map((option) => {
              const isActive = option.value === pageSize;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handlePageSizeSelect(option.value)}
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
          {(isCaptionBoxMode || isEvenFullPageTextMode) && (
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
              ) : null}
              {isEvenFullPageTextMode ? (
                <div className="space-y-2 sm:max-w-md">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-semibold text-zinc-700">Box Width (inches)</span>
                      <input
                        type="number"
                        min={4}
                        max={7.6}
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
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-semibold text-zinc-700">Box Height (inches)</span>
                      <input
                        type="number"
                        min={4}
                        max={7.6}
                        step={0.1}
                        value={evenFullPageTextBoxHeight}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setEvenFullPageTextBoxHeight(
                            Number.isFinite(next) ? next : getDefaultEvenFullPageTextBoxHeight()
                          );
                        }}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                      />
                    </label>
                  </div>
                  <span className="text-xs text-zinc-500">
                    Defaults are `7in` wide and `7in` tall. The title stays centered, and the paragraph stays left aligned.
                  </span>
                </div>
              ) : (
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
              )}
            </div>
          )}
          {supportsTextFontSelection && (
            <div className="space-y-3">
              {customFontPreviewCss ? <style>{customFontPreviewCss}</style> : null}
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-semibold text-zinc-700">
                  {supportsSplitTitleAndParagraphFonts
                    ? "Title + Paragraph Fonts"
                    : isCaptionBoxMode
                      ? "Caption Font"
                      : "Select Font"}
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
              {supportsSplitTitleAndParagraphFonts ? (
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
                              onFocus={handleFullyDescribedTitleFontSourceOpen}
                              onClick={handleFullyDescribedTitleFontSourceOpen}
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
                              onFocus={handleFullyDescribedTitleFontVariantOpen}
                              onClick={handleFullyDescribedTitleFontVariantOpen}
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
                        <p className="text-sm font-semibold text-zinc-900">
                          {isEvenFullPageTextMode ? "Paragraph Font" : "Description Font"}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {isEvenFullPageTextMode
                            ? "Choose the family and subfont for the paragraph text."
                            : "Choose the family and subfont for the description text."}
                        </p>
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
                              onFocus={handleFullFactFontSourceOpen}
                              onClick={handleFullFactFontSourceOpen}
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
                              onFocus={handleFullFactFontVariantOpen}
                              onClick={handleFullFactFontVariantOpen}
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
                        Paragraph: {formatFontOptionDisplayLabel(selectedFullFactFont)}
                      </p>
                    </div>
                    <div className="mt-3 flex justify-center">
                      <div
                        className="max-w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3"
                        style={{
                          width: isEvenFullPageTextMode
                            ? `${Math.round(getSafeDescribedPictureMaxBoxWidth(describedPictureMaxBoxWidth, mode) * 96)}px`
                            : undefined,
                          maxWidth: isEvenFullPageTextMode
                            ? "100%"
                            : `${Math.round(getSafeDescribedPictureMaxBoxWidth(describedPictureMaxBoxWidth, mode) * 96)}px`,
                        }}
                      >
                        <div
                          className="text-lg leading-tight text-zinc-900"
                          style={{
                            fontFamily: selectedFullyDescribedTitleFont.previewFamily,
                            textAlign: isEvenFullPageTextMode ? "center" : "left",
                          }}
                        >
                          {isEvenFullPageTextMode ? "Alpine Skiing" : "Espresso"}
                        </div>
                        <div
                          className="mt-2 text-base leading-snug text-zinc-700"
                          style={{
                            fontFamily: selectedFullFactFont.previewFamily,
                            textAlign: "left",
                          }}
                        >
                          {isEvenFullPageTextMode
                            ? "Fast descents, precise technique, and the drama of mountain racing all come together in one focused text page."
                            : "Made by forcing hot water through finely ground coffee under high pressure to create a small, strong shot with crema."}
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
                          onFocus={handleFullFactFontSourceOpen}
                          onClick={handleFullFactFontSourceOpen}
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
                          onFocus={handleFullFactFontVariantOpen}
                          onClick={handleFullFactFontVariantOpen}
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

      {step === 3 && !isUploadedImagesMode && (
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
          <ImageStudio pageSize={pageSize} />
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

      {step === 4 && !isUploadedImagesMode && (
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
                {supportsSplitTitleAndParagraphFonts ? "Titles + Descriptions" : "Title + Description"}
              </label>
              {isEvenFullPageTextMode ? (
                <div className="flex flex-wrap gap-2">
                  {EVEN_FULL_PAGE_TEXT_SAMPLES.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      onClick={() => setListDescription(sample.value)}
                      className="self-start rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              ) : isFullyDescribedImagesMode ? (
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
                supportsSplitTitleAndParagraphFonts
                  ? isEvenFullPageTextMode
                    ? EVEN_FULL_PAGE_TEXT_SAMPLE_WINTER_SPORTS
                    : FULLY_DESCRIBED_IMAGES_PLACEHOLDER
                  : 'Supports [{"title": "...", "description": "..."}] or "Title | description" lines'
              }
            />
            {supportsSplitTitleAndParagraphFonts ? (
              <p className="text-xs text-zinc-500">
                Description strings follow the same formatting rules as Even Full Page Text: use <code>\n</code> for
                new lines, <code>\n\n</code> for paragraph spacing, <code>-</code> or <code>1.</code> for lists, and{" "}
                <code>**bold**</code> / <code>*italic*</code> for emphasis inside the JSON string.
              </p>
            ) : null}
          </div>
        )}

        {mode === "image-only" && (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            This template uses only the images in your library. The generated PDF will keep every page image-only, with
            no captions, text boxes, or fact overlays.
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

function buildJsonGenerateRequest(payload: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function buildMultipartGenerateRequest(
  payload: Record<string, unknown>,
  contentFiles: File[],
  backgroundFiles: File[]
): RequestInit {
  const formData = new FormData();
  formData.append("payload", JSON.stringify(payload));
  for (const file of contentFiles) {
    formData.append("images", file, file.name);
  }
  for (const file of backgroundFiles) {
    formData.append("backgroundImages", file, file.name);
  }
  return {
    method: "POST",
    body: formData,
  };
}

interface UploadedImagePickerProps {
  inputId: string;
  label: string;
  description: string;
  files: File[];
  onFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddFiles: (files: FileList | File[] | null | undefined) => void;
  onRemoveFile: (index: number) => void;
  onClear: () => void;
}

function UploadedImagePicker({
  inputId,
  label,
  description,
  files,
  onFilesSelected,
  onAddFiles,
  onRemoveFile,
  onClear,
}: UploadedImagePickerProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setIsDragging(false);
      onAddFiles(event.dataTransfer.files);
    },
    [onAddFiles]
  );

  return (
    <div className="min-w-0 space-y-3 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-zinc-900">{label}</p>
          <p className="text-xs text-zinc-600">{description}</p>
        </div>
        {files.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500"
          >
            Clear
          </button>
        ) : null}
      </div>
      <label
        htmlFor={inputId}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition ${
          isDragging ? "border-black bg-zinc-100" : "border-zinc-300 bg-white hover:border-zinc-500"
        }`}
      >
        <span className="text-sm font-semibold text-zinc-900">Choose or drop images</span>
        <span className="text-xs text-zinc-500">JPG, PNG, WEBP, GIF, TIFF, BMP, AVIF, HEIC</span>
      </label>
      <input
        id={inputId}
        type="file"
        accept={UPLOAD_IMAGE_ACCEPT}
        multiple
        onChange={onFilesSelected}
        className="hidden"
      />
      {files.length > 0 ? (
        <ol className="grid min-w-0 gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.lastModified}-${index}`}
              className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2"
            >
              <UploadedFileThumbnail file={file} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {index + 1}. {file.name}
                </p>
                <p className="text-xs text-zinc-500">{formatFileSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(index)}
                className="shrink-0 rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-zinc-500">No images selected.</p>
      )}
    </div>
  );
}

function UploadedFileThumbnail({ file }: { file: File }) {
  const [previewUrl] = useState(() => URL.createObjectURL(file));

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div
      aria-hidden="true"
      className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"
    >
      <img src={previewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

function appendUploadFiles(current: File[], files: FileList | File[] | null | undefined) {
  const nextFiles = Array.from(files ?? []).filter(isUploadImageFile);
  if (!nextFiles.length) {
    return current;
  }
  return [...current, ...nextFiles];
}

function isUploadImageFile(file: File) {
  if (file.type.startsWith("image/")) {
    return true;
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension ? UPLOAD_IMAGE_EXTENSIONS.has(extension) : false;
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  const kilobytes = size / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }
  return `${(kilobytes / 1024).toFixed(1)} MB`;
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

  if (mode === "even-full-page-text") {
    return (
      <div aria-hidden="true" className="relative aspect-[1332/661] overflow-hidden rounded-t-2xl bg-zinc-100">
        <Image
          src="/even-full-page-text.webp"
          alt="Even Full Page Text preview"
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover object-center"
        />
      </div>
    );
  }

  if (mode === "image-only") {
    return (
      <div
        aria-hidden="true"
        className="relative aspect-[1332/661] overflow-hidden rounded-t-2xl bg-[linear-gradient(135deg,#e7e5e4_0%,#f5f5f4_46%,#d4d4d8_100%)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.75),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(24,24,27,0.12),transparent_40%)]" />
        <div className="absolute inset-5 grid grid-cols-2 gap-3">
          <div className="overflow-hidden rounded-[1.35rem] shadow-[0_24px_50px_rgba(24,24,27,0.16)]">
            <div className="h-full w-full bg-[linear-gradient(145deg,#292524_0%,#57534e_28%,#d6d3d1_62%,#78716c_100%)]" />
          </div>
          <div className="overflow-hidden rounded-[1.35rem] shadow-[0_24px_50px_rgba(24,24,27,0.16)]">
            <div className="h-full w-full bg-[linear-gradient(160deg,#cbd5e1_0%,#64748b_26%,#0f172a_60%,#e2e8f0_100%)]" />
          </div>
        </div>
      </div>
    );
  }

  if (mode === "uploaded-images") {
    return (
      <div
        aria-hidden="true"
        className="relative aspect-[1332/661] overflow-hidden rounded-t-2xl bg-[linear-gradient(135deg,#164e63_0%,#e2e8f0_52%,#f8fafc_100%)]"
      >
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(15,23,42,0.4),transparent_46%),linear-gradient(22deg,rgba(16,185,129,0.35),transparent_42%)]" />
        <div className="absolute left-1/2 top-1/2 aspect-[4/3] h-[62%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 border-white bg-[linear-gradient(140deg,#fafafa_0%,#dbeafe_45%,#fef3c7_100%)] shadow-[0_20px_45px_rgba(15,23,42,0.22)]" />
        <div className="absolute left-[28%] top-[31%] h-5 w-24 rounded-md bg-zinc-900/20" />
        <div className="absolute bottom-[28%] right-[29%] h-12 w-16 rounded-md bg-emerald-500/55" />
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
