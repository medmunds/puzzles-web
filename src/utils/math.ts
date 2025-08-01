export const almostEqual = (a: number, b: number, epsilon = 0.0001) =>
  Math.abs(a - b) < epsilon;

export const clamp = (min: number, value: number, max: number) =>
  Math.max(min, Math.min(value, max));
