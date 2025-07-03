import SlButton from "@shoelace-style/shoelace/dist/components/button/button.js";
import SlDropdown from "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
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
 * Give sl-button a `--caret-rotation` property for default caret rotation
 * (useful for flipping it in drop-up menus). Add rotation effect to the
 * caret when used for an sl-dropdown trigger (like in sl-select's caret).
 */
function rotateSlButtonCaretWhenExpanded() {
  SlButton.elementStyles.push(
    css`
      :host {
        --caret-rotation: 0deg;
      }
      .button--caret .button__caret {
        transform: rotate(var(--caret-rotation));
      }
      
      @media(prefers-reduced-motion: no-preference) {
        .button--caret .button__caret {
          transition: transform var(--sl-transition-fast) ease;
        }
        .button--caret[aria-expanded="true"] .button__caret {
          transform: rotate(calc(var(--caret-rotation) - 180deg));
        }
      }
    `,
  );
}

/**
 * Make sl-dropdown flip its trigger caret when placement suggests "drop-up".
 */
function flipSlDropdownCaretForTopPlacement() {
  SlDropdown.elementStyles.push(
    css`
      :host([placement*="top"]) slot[name="trigger"]::slotted(sl-button) {
        --caret-rotation: 180deg;
      }
    `,
  );
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
  rotateSlButtonCaretWhenExpanded();
  flipSlDropdownCaretForTopPlacement();
  increaseSlMenuItemPrefixSpacing();
}
