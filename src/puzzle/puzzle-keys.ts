import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { cssWATweaks } from "../utils/css.ts";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";
import type { KeyLabel } from "./types.ts";

// Components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

interface LabelIcons {
  [label: string]: string;
}

/**
 * A virtual keyboard for the puzzle
 */
@customElement("puzzle-keys")
export class PuzzleKeys extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  // Maps KeyLabel.label to wa-icon name
  static defaultLabelIcons: LabelIcons = {
    Clear: "key-clear",
    Marks: "key-marks",
    Hints: "key-hints",
  };

  @property({ type: Object })
  labelIcons: LabelIcons = PuzzleKeys.defaultLabelIcons;

  @state()
  private keyLabels?: KeyLabel[];

  private renderedParams?: string;

  override async willUpdate() {
    // The available keys can vary with changes to puzzle params.
    // (This should really be an effect on this.puzzle?.currentParams,
    // but @lit-labs/signals doesn't have effects yet.)
    const currentParams = this.puzzle?.currentParams;
    if (currentParams !== this.renderedParams) {
      this.renderedParams = currentParams;
      await this.loadKeyLabels();
    }
  }

  private async loadKeyLabels() {
    this.keyLabels = (await this.puzzle?.requestKeys()) ?? [];
  }

  override render() {
    return html`
      <slot name="before"></slot>
      ${this.renderVirtualKeys()}
      <slot name="after"></slot>
    `;
  }

  private renderVirtualKeys() {
    if (!this.keyLabels || this.keyLabels.length === 0) {
      return nothing;
    }

    // If >5 keys, divide into two equal groups for better wrapping
    const split =
      this.keyLabels.length > 5
        ? Math.floor(this.keyLabels.length / 2)
        : this.keyLabels.length;
    const keyGroups = [this.keyLabels.slice(0, split), this.keyLabels.slice(split)];
    return keyGroups.map(
      (keys) => html`
          <div class="group">${keys.map(this.renderVirtualKey)}</div>`,
    );
  }

  private renderVirtualKey = (key: KeyLabel) => {
    const label = key.label;
    const icon = this.labelIcons[label];
    const classes = { single: icon || label.length === 1 };
    const content = icon
      ? html`<wa-icon name=${icon} label=${label}></wa-icon>`
      : label;
    return html`            
      <wa-button
          class=${classMap(classes)}
          @click=${() => this.puzzle?.processKey(key.button)}
        >${content}</wa-button>
    `;
  };

  static styles = [
    cssWATweaks,
    css`
      :host {
        --gap: var(--wa-space-s); 
  
        display: flex;
        flex-wrap: wrap;
        gap: var(--gap);
      }
  
      .group {
        display: flex;
        gap: var(--gap);
      }
  
      .single {
        /* Make all single-char buttons the same width, for uniform layout.
         * (This cheats the horizontal padding just a bit.) */
        width: var(--wa-form-control-height);
      }
      
      wa-button {
        /* Disable double-tap to zoom on keys that might be tapped quickly.
         * (Ineffective in iOS Safari; see preventDoubleTapZoom click handler.)
         */
        touch-action: pinch-zoom;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-keys": PuzzleKeys;
  }
}
