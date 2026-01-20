import type { Colour } from "../puzzle/types.ts";
import { almostEqual } from "./math.ts";

// A "Colour" (from the C puzzle code) is an [r, g, b] triplet
// with each component in the range [0, 1] (in srgb space).

export const equalColour = (c1: Colour, c2: Colour) =>
  c1.every((component, i) => almostEqual(component, c2[i]));
