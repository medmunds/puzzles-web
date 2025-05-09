import type { Colour } from "../puzzle/module.ts";
import { almostEqual } from "./math.ts";

export const equalColour = (
  { r: r1, g: g1, b: b1 }: Colour,
  { r: r2, g: g2, b: b2 }: Colour,
) => almostEqual(r1, r2) && almostEqual(g1, g2) && almostEqual(b1, b2);

export const coordsToColour = ([r, g, b]: [number, number, number]): Colour => ({
  r,
  g,
  b,
});

export const colourToCoords = ({ r, g, b }: Colour) => [r, g, b];
