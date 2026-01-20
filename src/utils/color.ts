import {
  ColorSpace,
  to as convert,
  display,
  OKLCH as OKLCHspace,
  parse,
  sRGB as sRGBspace,
} from "colorjs.io/fn";
import type { Colour } from "../puzzle/types.ts";
import { almostEqual, clamp } from "./math.ts";

// Register color spaces for parse() function.
// Must include anything used by our design tokens, plus sRGB just in case.
ColorSpace.register(OKLCHspace);
ColorSpace.register(sRGBspace);

// A "Colour" (from the C puzzle code) is an [r, g, b] triplet
// with each component in the range [0, 1] (in sRGB space).

export const equalColour = (c1: Colour, c2: Colour) =>
  c1.every((component, i) => almostEqual(component, c2[i]));

/**
 * OKLch color space coords:
 * - lightness in [0, 1]
 * - chroma in [0, 1], but typically 0-0.4
 * - hue in [0, 360], or NaN for achromatic
 */
export type OKLCH = [l: number, c: number, h: number];

export const colourToOKLCH = (rgb: Colour): OKLCH =>
  convert({ space: sRGBspace, coords: rgb }, OKLCHspace).coords;

export const oklchToColour = (lch: OKLCH): Colour =>
  convert({ space: OKLCHspace, coords: lch }, sRGBspace).coords;

export const cssColorToOKLCH = (cssColor: string): OKLCH =>
  convert(parse(cssColor), OKLCHspace).coords;

export const oklchToCSSColor = (lch: OKLCH): string =>
  // display() returns the best CSS <color> string this browser can handle.
  display({ space: OKLCHspace, coords: lch });

export const isGrayChroma = (c: number) => c < 0.01;

/**
 * Compresses lightness l [0, 1] to fit within [floor, 1 - headroom],
 * with optional boost to expand lightness difference at the low end.
 */
const compressLightness = (
  l: number,
  options?: { floor?: number; headroom?: number; boost?: number },
) => {
  const { floor = 0, headroom = 0, boost = 1 } = options ?? {};
  const compressedL = floor + l ** boost * (1 - floor - headroom);
  return clamp(0, compressedL, 1);
};

/**
 * "Invert" a color from a light-mode color palette to a dark one.
 * bgl is the background lightness in the dark mode palette, and is the
 * minimum lightness that will be returned. (Ideally, bgl should be at least
 * the display's black level floor. In practice, our dark-mode palettes tend
 * to use an off-black background somewhere around bgl=0.18, which is above
 * the floor for most displays and ambient lighting conditions.)
 */
function invertLightness([l, c, h]: OKLCH, bgl: number): OKLCH {
  return [compressLightness(1 - l, { floor: bgl, boost: 0.8 }), c, h];
}

/**
 * Adjusts chromatic colors for dark mode:
 * - Compress lightness to ensure visibility against the dark background
 *   while preventing overly-light colors that wouldn't be "dark mode".
 * - Boost chroma for darker colors to retain their apparent color.
 * - Clamp chroma to avoid "neon" / garish colors.
 */
function adjustChromatic([l, c, h]: OKLCH, bgl: number): OKLCH {
  // These numbers are hand tuned, and try to strike a balance between:
  // - Colors used for text/lines on a dark background, which need more lightness
  //   (ABCD is a good test, also Solo killer region outline)
  // - Colors used for filled regions, where lower lightness would work better
  //   (Flood and Same Game; Signpost note colors used as text bg)
  // Knowing the intended use of the color could improve the results significantly.
  // (Also, color.js has some contrast and chromatic adaptation functions
  // that might be useful.)

  // Compress lightness, with some extra boost at the low end.
  const compressedL = compressLightness(l, {
    floor: bgl + 0.15,
    headroom: 0.2,
    boost: 0.8,
  });

  // Hunt Effect / Helmholtz-Kohlrausch compensation:
  // At lower luminance, colors appear less colorful. Boost the chroma
  // of darker colors so they remain distinct and don't fade to gray.
  const boostC = 1 + 0.5 * (1 - compressedL);
  let adjustedC = c * boostC;

  // Glare prevention:
  // High lightness + high chroma on dark backgrounds causes "neon" glare.
  // Clamp chroma strictly for light colors, but allow more for dark colors.
  const maxChroma = 0.25 - 0.15 * compressedL;
  adjustedC = clamp(0, adjustedC, maxChroma);

  return [compressedL, adjustedC, h];
}

/**
 * Converts a light-mode puzzle palette color to dark mode:
 * - Grays are assumed to be backgrounds, text, gridlines, or similar UI.
 *   Their lightness is inverted and mapped to [bgl, 1] with a bit of a curve.
 * - Colors are assumed to be semantic (e.g., red errors, yellow lights)
 *   or large filled regions, and are adjusted to be less bright.
 *
 * While this logic works for many puzzle palette colors, it's not perfect.
 * Puzzle-specific overrides will be needed for, e.g.:
 * - Blacks and whites that should not be inverted (e.g., "black pegs" in Guess)
 * - Grays that are used in 3D effects
 */
export const darkModeColor = (lch: OKLCH, bgl: number): OKLCH =>
  isGrayChroma(lch[1]) ? invertLightness(lch, bgl) : adjustChromatic(lch, bgl);

/**
 * If lch is a gray color, apply the hue of the tint color to it,
 * adjusting chroma to approximate the tint color's own "colorfulness".
 * If lch is not a gray color, return it unchanged.
 */
export function tintGrays(lch: OKLCH, tint: OKLCH): OKLCH {
  let [l, c, h] = lch;
  if (isGrayChroma(c)) {
    // Hunt Effect compensation (see above).
    const k = 0.5;
    const epsilon = 0.05;
    const [tl, tc, th] = tint;
    c = tc * (tl / (l + epsilon)) ** k;
    h = th;
  }
  return [l, c, h];
}
