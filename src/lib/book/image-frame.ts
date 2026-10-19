export const IMAGE_FRAME_STYLE_VALUES = ["solid", "dotted", "dashed"] as const;
export type ImageFrameStyle = (typeof IMAGE_FRAME_STYLE_VALUES)[number];
export const DEFAULT_IMAGE_FRAME_STYLE: ImageFrameStyle = "solid";

export const IMAGE_FRAME_COLOR_VALUES = ["black", "gold", "blue", "green", "purple", "pink", "orange", "cyan"] as const;
export type ImageFrameColor = (typeof IMAGE_FRAME_COLOR_VALUES)[number];
export const DEFAULT_IMAGE_FRAME_COLOR: ImageFrameColor = "black";

export const IMAGE_FRAME_COLOR_OPTIONS: ReadonlyArray<{
  value: ImageFrameColor;
  label: string;
  hex: string;
}> = [
  { value: "black", label: "Black", hex: "#000000" },
  { value: "gold", label: "Gold", hex: "#eab308" },
  { value: "blue", label: "Blue", hex: "#2563eb" },
  { value: "green", label: "Green", hex: "#16a34a" },
  { value: "purple", label: "Purple", hex: "#9333ea" },
  { value: "pink", label: "Pink", hex: "#ec4899" },
  { value: "orange", label: "Orange", hex: "#f97316" },
  { value: "cyan", label: "Cyan", hex: "#06b6d4" },
];

export function getImageFrameColorOption(value: ImageFrameColor = DEFAULT_IMAGE_FRAME_COLOR) {
  return IMAGE_FRAME_COLOR_OPTIONS.find((option) => option.value === value) ?? IMAGE_FRAME_COLOR_OPTIONS[0];
}
