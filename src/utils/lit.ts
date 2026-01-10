/**
 * Browser translation and Lit
 *
 * Browser "translate page" features (and some other extensions) modify the DOM.
 * Lit can get pretty unhappy about that. This module attempts to make Lit more
 * robust after unexpected, third-party DOM manipulation.
 *
 * Developed and tested with lit-element@4.2.1 and lit-html@3.3.1.
 *
 * There's not good documentation on exactly what browser translators do. (But see
 * https://martijnhols.nl/blog/everything-about-google-translate-crashing-react.)
 * Here's observed behavior in desktop browsers as of early 2026:
 *
 * Chrome: Replaces text nodes with <font> tags (sometimes nested). Generally
 * keeps Lit's markers intact. Content added/updated after initial translation
 * is not translated (though setting the lang _property_ on an element sometimes
 * triggers re-translation). Updates the <html lang> attribute and adds
 * class="translated-ltr" or class="translated-rtl" to the <html> element.
 * Respects translate="no".
 *
 * Edge: Replaces text nodes with <font> tags. Generally keeps Lit's markers intact.
 * Adds various combinations of _mstmutation, _mstexthash and _msthash attributes
 * to translated elements (including its added <font> tags). Content added/updated
 * after initial translation is not translated. Does not update the <html lang>
 * attribute. Ignores translate="no".
 *
 * Firefox: Seems to update text node content in place, and doesn't touch Lit's
 * markers. Content added/updated after initial translation is (usually) translated.
 * Updates the <html lang> attribute. Often ignores translate="no".
 *
 * Safari: Sometimes removes Lit's markers, causing errors during re-render.
 * Content added/updated after initial translation is sometimes translated,
 * sometimes not. Updates the <html lang> attribute. Respects translate="no".
 *
 * Also, Chrome on iOS implements translation using an "anonymous script" that
 * frequently throws "RangeError: Maximum call stack size exceeded. at undefined...".
 * The translation seems to work (and the script recovers), so it seems easiest
 * to ignore these errors. (Chrome iOS uses the same <font> tags as on desktop.)
 */

import * as Sentry from "@sentry/browser";
import {
  type ChildPart,
  LitElement,
  type PropertyValues,
  ReactiveElement,
  render,
} from "lit";

/**
 * Monkey-patch LitElement.update to try to auto-recover from third-party
 * DOM manipulation that breaks lit-html template rendering. This is often
 * caused by browser extensions or translation features.
 *
 * This also adds a workaround for Chrome and Edge to ensure updated content
 * after translation actually makes it into the DOM.
 */
export function patchLitForExternalDomManipulation() {
  // Duplicate the original update code (rather than wrapping it)
  // to preserve guarantees about the order of operations.
  // @ts-expect-error: monkey-patching protected prototype method
  LitElement.prototype.update = function (
    this: LitElement,
    changedProperties: PropertyValues,
  ) {
    if (!import.meta.env.PROD) {
      // Check this patch is still valid
      if (!Object.hasOwn(this, "__childPart")) {
        throw new Error("LitElement internal implementation has changed");
      }
      if (this.hasUpdated && !Object.hasOwn(this.renderRoot, litPartProperty)) {
        throw new Error("lit-html internal implementation has changed");
      }
    }

    // Original code...
    // https://github.com/lit/lit/blob/lit-element%404.2.1/packages/lit-element/src/lit-element.ts#L162-L172

    // Setting properties in `render` should not trigger an update. Since
    // updates are allowed after super.update, it's important to call `render`
    // before that.
    const value = this.render();
    if (!this.hasUpdated) {
      this.renderOptions.isConnected = this.isConnected;
    }
    // super.update(changedProperties);
    // @ts-expect-error: calling protected superclass method
    ReactiveElement.prototype.update.call(this, changedProperties);

    // Addition: undo replacement of text nodes with <font> elements
    if (repairFontTagsForTextNodes(this.renderRoot)) {
      if (import.meta.env.VITE_SENTRY_DSN) {
        Sentry.setTag("lit.repair_font_tags", true);
      }
    }

    // Modification: wrap lit-html render call in try/catch/recover
    // this.__childPart = render(value, this.renderRoot, this.renderOptions);
    try {
      // @ts-expect-error: setting private property
      this.__childPart = render(value, this.renderRoot, this.renderOptions);
    } catch (error) {
      // Try re-rendering from scratch
      const originalState = captureRenderState(this);
      if (import.meta.env.VITE_SENTRY_DSN) {
        Sentry.setTag("lit.render_recovery", "attempted");
      }
      try {
        clearRenderState(this);
        // @ts-expect-error: setting private property
        this.__childPart = render(value, this.renderRoot, this.renderOptions);
        if (import.meta.env.VITE_SENTRY_DSN) {
          Sentry.setTag("lit.render_recovery", "succeeded");
        }
      } catch (retryError) {
        // Clean rendering didn't fix it.
        // Put everything back where it was and throw the original error.
        restoreRenderState(this, originalState);
        if (import.meta.env.VITE_SENTRY_DSN) {
          // Add a breadcrumb for retryError that will be available
          // in the record if the original error ends up in Sentry
          Sentry.addBreadcrumb({
            type: "error",
            category: "error",
            level: "error",
            message: "LitElement.update render error recovery failed",
            data: { retryError: String(retryError) },
          });
        }
        throw error;
      }
    }
  };
}

/**
 * Chrome and Edge translation convert text nodes to <font> elements. This breaks
 * later updates in lit-html ChildPart._commitText, which in certain cases assumes
 * a marker's nextSibling is a (previously rendered) text node that can be updated
 * in place. Since we don't use <font> in our own code, any font tags must be
 * from third-party DOM manipulation. Change each back to single text node.
 * https://github.com/lit/lit/blob/lit-html%403.3.1/packages/lit-html/src/lit-html.ts#L1550-L1572
 * https://issues.chromium.org/issues/41407169
 */
function repairFontTagsForTextNodes(element: ParentNode) {
  let repaired = false;
  // noinspection JSDeprecatedSymbols: font element
  for (const fontElement of element.querySelectorAll("font")) {
    if (fontElement.isConnected) {
      const textNode = document.createTextNode(fontElement.textContent);
      fontElement.replaceWith(textNode);
      repaired = true;
    } // else it was nested in an outer font element we've already replaced
  }
  if (repaired) {
    element.normalize();
  }
  return repaired;
}

// Used by lit-html to associate its ChildPart with a render root. (Not a symbol.)
// https://github.com/lit/lit/blob/lit-html%403.3.1/packages/lit-html/src/lit-html.ts#L2257
const litPartProperty = "_$litPart$";

type LitRenderRoot = LitElement["renderRoot"] & { [litPartProperty]?: ChildPart };

interface RenderState {
  children: ChildNode[];
  childPart: ChildPart | undefined;
}

/**
 * Empty the element's renderRoot and reset lit-html's tracking
 * so the next template rendering will start from scratch.
 */
function clearRenderState(element: LitElement) {
  element.renderRoot.replaceChildren();
  (element.renderRoot as LitRenderRoot)[litPartProperty] = undefined;
}

function captureRenderState(element: LitElement): RenderState {
  const children = [...element.renderRoot.childNodes];
  const childPart = (element.renderRoot as LitRenderRoot)[litPartProperty];
  return { children, childPart };
}

function restoreRenderState(element: LitElement, state: RenderState) {
  element.renderRoot.replaceChildren(...state.children);
  (element.renderRoot as LitRenderRoot)[litPartProperty] = state.childPart;
}
