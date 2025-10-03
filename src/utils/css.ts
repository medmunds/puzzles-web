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
