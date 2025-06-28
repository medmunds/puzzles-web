import SlButton from "@shoelace-style/shoelace/dist/components/button/button.js";
import SlMenuItem from "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import { CSSResult, css, unsafeCSS } from "lit";

const isHoverDevice = () => window.matchMedia("(hover: hover)").matches;

/**
 * Shoelace's sl-button defines :hover styles unconditionally, even on devices
 * with no hover-capable input. This results in hover effects getting "stuck on"
 * on touch devices, and encourages some browsers to emulate hover events
 * (which seems to mess with rapid taps on nearby buttons).
 *
 * Resolve by mucking about in SlButton's stylesheets to strip out :hover rules.
 * (This is very hacky, but works for now.)
 * https://github.com/shoelace-style/shoelace/blob/next/src/components/button/button.styles.ts
 */
function removeHoverStylesFromSlButton() {
  const elementStyles = SlButton.elementStyles;
  if (
    !elementStyles ||
    !Array.isArray(elementStyles) ||
    !elementStyles.every((styleSheet) => styleSheet instanceof CSSResult)
  ) {
    // SlButton implementation (or Lit) has changed in a way that invalidates this hack.
    throw new Error("removeHoverStylesFromSlButton unexpected elementStyles");
  }
  if (!isHoverDevice()) {
    SlButton.elementStyles = elementStyles.map(stripHoverRules);
  }
}

function stripHoverRules(cssResult: CSSResult): CSSResult {
  if (cssResult.cssText.indexOf(":hover") < 0) {
    return cssResult;
  }
  // Remove :hover rules. (Yes, we're editing CSS with a RegExp.)
  // This wouldn't work correctly for `,` selectors, nested rules, etc.
  // Fortunately SlButton doesn't use those.
  const modifiedCSS = cssResult.cssText.replace(/[^{}]*:hover[^{}]*\{[^{}]*\}/g, "");
  return unsafeCSS(modifiedCSS);
}

/**
 * sl-menu-item uses --sl-spacing-x-small (0.5rem) between prefix and label,
 * but uses 1em before/after content (space for checkmark and submenu arrow).
 * Increase the prefix spacing to balance it. Same for suffix.
 *
 * https://github.com/shoelace-style/shoelace/blob/next/src/components/menu-item/menu-item.styles.ts#
 */
function increaseSlMenuItemPrefixSpacing() {
  SlMenuItem.elementStyles.push(
    css`
      .menu-item .menu-item__prefix::slotted(*) {
        margin-inline-end: var(--sl-spacing-medium);
      }
      .menu-item .menu-item__suffix::slotted(*) {
        margin-inline-start: var(--sl-spacing-medium);
      }
    `,
  );
}

export function installShoelaceHacks() {
  removeHoverStylesFromSlButton();
  increaseSlMenuItemPrefixSpacing();
}
