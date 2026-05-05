export const NUMBER_BADGE_COLOR_VALUES = [
  "walnut",
  "terracotta",
  "olive",
  "teal",
  "slate",
  "mulberry",
] as const;

export type NumberBadgeColorKey = (typeof NUMBER_BADGE_COLOR_VALUES)[number];

export const DEFAULT_NUMBER_BADGE_COLOR: NumberBadgeColorKey = "walnut";

export const NUMBER_BADGE_COLOR_OPTIONS: ReadonlyArray<{
  value: NumberBadgeColorKey;
  label: string;
  hex: string;
}> = [
  { value: "walnut", label: "Walnut", hex: "#8a5a3b" },
  { value: "terracotta", label: "Terracotta", hex: "#c8795a" },
  { value: "olive", label: "Olive", hex: "#7b8752" },
  { value: "teal", label: "Deep Teal", hex: "#4f7a78" },
  { value: "slate", label: "Slate Blue", hex: "#68778f" },
  { value: "mulberry", label: "Mulberry", hex: "#8a6278" },
];

export function getNumberBadgeColorOption(value?: string) {
  return (
    NUMBER_BADGE_COLOR_OPTIONS.find((option) => option.value === value) ??
    NUMBER_BADGE_COLOR_OPTIONS.find((option) => option.value === DEFAULT_NUMBER_BADGE_COLOR) ??
    NUMBER_BADGE_COLOR_OPTIONS[0]
  );
}
