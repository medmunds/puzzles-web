// CSS that needs to be shared between various shadow DOMs
import { css, unsafeCSS } from "lit";

import cssNativeRaw from "./css/native.css?inline";
import cssWATweaksRaw from "./css/wa-tweaks.css?inline";

/**
 * Our styling for native tags (a, h1, p, etc.).
 * (Include in any component that wants to style native tags.)
 */
export const cssNative = css`${unsafeCSS(cssNativeRaw)}`;

/**
 * Our overrides for Web Awesome defaults.
 * (Include in any component that directly renders wa-* elements in shadow dom.)
 */
export const cssWATweaks = css`${unsafeCSS(cssWATweaksRaw)}`;

/**
 * Return the numeric value of a CSS custom property on element.
 * If defaultValue is not provided, throws an error if missing or invalid.
 * Property must be defined in CSS using a numeric @property `syntax` type
 * to ensure unit conversion. (This function does not parse or apply units.)
 */
export function getNumericProperty(
  element: Element,
  property: string,
  defaultValue?: number,
): number {
  const valueStr = window.getComputedStyle(element).getPropertyValue(property);
  if (valueStr) {
    const value = Number.parseFloat(valueStr);
    if (Number.isNaN(value)) {
      throw new Error(`Invalid value for ${property}: ${value}`);
    }
    return value;
  }
  if (defaultValue) {
    return defaultValue;
  }
  throw new Error(`No value for property "${property}"`);
}
