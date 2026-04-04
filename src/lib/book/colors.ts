import { rgb } from "pdf-lib";

export function hexToRgb(color: string) {
  const normalized = color.replace("#", "");
  const size = normalized.length === 3 ? 1 : 2;
  const expand = (segment: string) =>
    size === 1 ? parseInt(segment.repeat(2), 16) : parseInt(segment, 16);
  const segments =
    size === 1
      ? normalized.split("")
      : [normalized.slice(0, 2), normalized.slice(2, 4), normalized.slice(4, 6)];
  const [r, g, b] = segments.map(expand);
  return rgb(r / 255, g / 255, b / 255);
}

export function mixColors(
  base: ReturnType<typeof rgb>,
  blend: ReturnType<typeof rgb>,
  amount: number
) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const t = clamp(amount);
  return rgb(
    clamp(base.red * (1 - t) + blend.red * t),
    clamp(base.green * (1 - t) + blend.green * t),
    clamp(base.blue * (1 - t) + blend.blue * t)
  );
}
