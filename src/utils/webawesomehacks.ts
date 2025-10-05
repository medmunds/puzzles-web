import WaButton from "@awesome.me/webawesome/dist/components/button/button.js";
import WaCheckbox from "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import WaInput from "@awesome.me/webawesome/dist/components/input/input.js";
import WaRadio from "@awesome.me/webawesome/dist/components/radio/radio.js";
import WaRadioGroup from "@awesome.me/webawesome/dist/components/radio-group/radio-group.js";
import WaScroller from "@awesome.me/webawesome/dist/components/scroller/scroller.js";
import WaSelect from "@awesome.me/webawesome/dist/components/select/select.js";
import WaSlider from "@awesome.me/webawesome/dist/components/slider/slider.js";
import WaTextarea from "@awesome.me/webawesome/dist/components/textarea/textarea.js";
import { css } from "lit";

/**
 * Several Web Awesome components trigger Lit's change-in-update warning.
 * Disable that warning from those components until fixed.
 *
 * https://github.com/shoelace-style/webawesome/issues/1269
 */
function disableWaChangedInUpdateWarnings() {
  WaButton.disableWarning?.("change-in-update");
  WaCheckbox.disableWarning?.("change-in-update");
  WaInput.disableWarning?.("change-in-update");
  WaRadio.disableWarning?.("change-in-update");
  WaRadioGroup.disableWarning?.("change-in-update");
  WaSelect.disableWarning?.("change-in-update");
  WaSlider.disableWarning?.("change-in-update");
  WaTextarea.disableWarning?.("change-in-update");
}

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
  disableWaChangedInUpdateWarnings();
  fixWaButtonIconWithCaret();
  fixWaScrollerFocusIndication();
}
