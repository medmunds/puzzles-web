import WaButton from "@awesome.me/webawesome/dist/components/button/button.js";
import WaCard from "@awesome.me/webawesome/dist/components/card/card.js";
import WaCheckbox from "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import WaDialog from "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import WaDropdown from "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
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
  WaCard.disableWarning?.("change-in-update");
  WaCheckbox.disableWarning?.("change-in-update");
  WaInput.disableWarning?.("change-in-update");
  WaRadio.disableWarning?.("change-in-update");
  WaRadioGroup.disableWarning?.("change-in-update");
  WaSelect.disableWarning?.("change-in-update");
  WaSlider.disableWarning?.("change-in-update");
  WaTextarea.disableWarning?.("change-in-update");
}

/**
 * wa-button and wa-checkbox lose spacing between elements in their
 * default slot (e.g., `<wa-button>This is <b>bold</b></wa-button>`
 * renders as "This isbold"). Override their styles to fix.
 *
 * https://github.com/shoelace-style/webawesome/issues/1272
 * https://github.com/shoelace-style/webawesome/pull/1274
 */
function fixWaButtonAndCheckboxLabelLayout() {
  WaButton.elementStyles.push(css`
    :not(.is-icon-button) .label {
      display: inline-block;
    }
  `);
  WaCheckbox.elementStyles.push(css`
    [part~='label'] {
      display: inline-block;
    }
  `);
}

/**
 * wa-dropdown doesn't handle content that is too large to fit.
 * Monkey patch its wa-popup to enable auto-size="both", which calculates
 * available size and sets css custom properties for max width and height.
 * (Shoelace sl-dropdown handled this the same way via sl-menu.)
 *
 * https://github.com/shoelace-style/webawesome/issues/1268
 */
function fixWaDropdownOverflow() {
  const oldFirstUpdated = WaDropdown.prototype.firstUpdated;
  WaDropdown.prototype.firstUpdated = function (this: WaDropdown) {
    const popup = this.shadowRoot?.querySelector("wa-popup");
    if (!popup) {
      throw new Error("fixWaDropdownOverflow monkeypatch is no longer valid");
    }
    if (popup.autoSize !== undefined) {
      // Presumably it's been fixed
      throw new Error("fixWaDropdownOverflow monkeypatch is no longer necessary");
    }
    popup.autoSize = "both";
    return oldFirstUpdated.call(this);
  };
  WaDropdown.elementStyles.push(
    css`
      #menu {
        overflow: auto;
        max-width: var(--auto-size-available-width) !important;
        max-height: var(--auto-size-available-height) !important;
      }
    `,
  );
}

/**
 * Fix problem where wa-scroller shadows are below form controls.
 * https://github.com/shoelace-style/webawesome/issues/1326
 */
function fixWaScrollerShadowZIndex() {
  WaScroller.elementStyles.push(css`
    #start-shadow, #end-shadow {
      /* Move shadows above form controls. 
       * (wa-radio[checked] uses z-index 1.) */
      z-index: 2;
    }
  `);
}

/**
 * Allow wa-dialog animations to be customized via CSS custom properties.
 * (Replaces Shoelace's setAnimation, which isn't available in WebAwesome.
 * https://shoelace.style/getting-started/customizing#animations.)
 */
function enableCustomWaDialogAnimations() {
  WaDialog.elementStyles.push(
    // (You'd also want to allow customizing the backdrop and pulse animations,
    // but for simplicity they're omitted here because we don't need them.)
    css`
      :host {
        --show-dialog-animation: show-dialog var(--show-duration) ease;
        --hide-dialog-animation: show-dialog var(--hide-duration) ease reverse;
      }

      .dialog {
        &.show {
          animation: var(--show-dialog-animation);
        }

        &.hide {
          animation: var(--hide-dialog-animation);
        }
      }
    `,
    // Ideally, custom keyframes could be defined by wa-dialog's user (e.g., in
    // puzzle-end-notification's css). Unfortunately, that currently works only in
    // Firefox. Chrome and Safari don't look for named keyframes in containing scopes.
    // See https://github.com/w3c/csswg-drafts/issues/1995
    // https://drafts.csswg.org/css-scoping/#shadow-names
    // https://issues.chromium.org/issues/40882934
    // Workaround: define the two custom keyframes we need here, in WaDialog,
    // so they can be named in puzzle-end-notification.
    css`
      @keyframes zoom-in-up {
        /* animate.css zoomInUp */
        from {
          opacity: 0;
          transform: scale3d(0.1, 0.1, 0.1) translate3d(0, 1000px, 0);
          animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19);
        }

        60% {
          opacity: 1;
          transform: scale3d(0.475, 0.475, 0.475) translate3d(0, -60px, 0);
          animation-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1);
        }
      }
      @keyframes zoom-out-down {
        /* animate.css zoomOutDown */
        40% {
          opacity: 1;
          transform: scale3d(0.475, 0.475, 0.475) translate3d(0, -60px, 0);
          animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19);
        }

        to {
          opacity: 0;
          transform: scale3d(0.1, 0.1, 0.1) translate3d(0, 2000px, 0);
          animation-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1);
        }
      }
    `,
  );
}

/**
 * Give wa-button a `--caret-rotation` property for default caret rotation
 * (useful for flipping it in drop-up menus). Add rotation effect to the
 * caret when used for an wa-dropdown trigger (like in wa-select's caret).
 */
function rotateWaButtonCaretWhenExpanded() {
  WaButton.elementStyles.push(
    css`
      :host {
        --caret-rotation: 0deg;
      }

      wa-icon[part~="caret"] {
        transform: rotate(var(--caret-rotation));
      }
      
      @media(prefers-reduced-motion: no-preference) {
        wa-icon[part~="caret"] {
          transition: transform var(--wa-transition-fast) var(--wa-transition-easing);
        }
        button[aria-expanded="true"] wa-icon[part~="caret"] {
          transform: rotate(calc(var(--caret-rotation) - 180deg));
        }
      }
    `,
  );
}

/**
 * Make wa-dropdown flip its trigger caret when placement suggests "drop-up".
 */
function flipWaDropdownCaretForTopPlacement() {
  WaDropdown.elementStyles.push(
    css`
      :host([placement*="top"]) slot[name="trigger"]::slotted(wa-button) {
        --caret-rotation: 180deg;
      }
    `,
  );
}

export function installWebAwesomeHacks() {
  disableWaChangedInUpdateWarnings();
  fixWaButtonAndCheckboxLabelLayout();
  fixWaDropdownOverflow();
  fixWaScrollerShadowZIndex();
  enableCustomWaDialogAnimations();
  rotateWaButtonCaretWhenExpanded();
  flipWaDropdownCaretForTopPlacement();
}
