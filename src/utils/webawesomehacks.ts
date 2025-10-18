import WaButton from "@awesome.me/webawesome/dist/components/button/button.js";
import WaScroller from "@awesome.me/webawesome/dist/components/scroller/scroller.js";
import { css } from "lit";

/**
 * Fix wa-button[with-caret] width when only content is a wa-icon.
 * https://github.com/shoelace-style/webawesome/issues/1447
 */
function fixWaButtonIconWithCaret() {
  WaButton.elementStyles.push(
    // This default is too narrow when there's a caret:
    //   .button.is-icon-button { width: calc(var(--wa-form-control-height); }
    // Add the caret's:
    //   margin: `part=caret { margin-inline-start: 0.75em; }`
    //   width: `wa-icon { width: 1.25em; }`
    css`
      .button.caret.is-icon-button {
        width: calc(var(--wa-form-control-height) + 0.75em + 1.25em);
      }
    `,
  );
}

/**
 * wa-scroller participates in the tab order (when it is scrollable)
 * without showing a focus ring.
 * https://github.com/shoelace-style/webawesome/issues/1484
 */
function fixWaScrollerFocusIndication() {
  WaScroller.elementStyles.push(
    css`
      :host:has(#content:focus-visible) {
        outline: var(--wa-focus-ring);
        outline-offset: var(--wa-focus-ring-offset);
      }
      :host {
        overflow: visible;
        border-radius: var(--wa-border-radius-m);
      }
      :host([orientation="horizontal"]) #content {
        overflow-y: visible;
      }
      :host([orientation="vertical"]) #content {
        overflow-x: visible;
      }
    `,
  );
}

export function installWebAwesomeHacks() {
  fixWaButtonIconWithCaret();
  fixWaScrollerFocusIndication();
}
