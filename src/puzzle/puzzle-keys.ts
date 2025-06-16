import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { puzzleContext } from "./contexts.ts";
import type { KeyLabel } from "./module.ts";
import type { Puzzle } from "./puzzle.ts";

// Components
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";

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

  // Maps KeyLabel.label to sl-icon name
  static defaultLabelIcons: LabelIcons = {
    Clear: "delete",
    Marks: "square-pen", // or maybe rectangle-ellipsis?
    Hints: "wand",
  };

  @property({ type: Object })
  labelIcons: LabelIcons = PuzzleKeys.defaultLabelIcons;

  @state()
  private keyLabels?: KeyLabel[];

  private renderedParams?: string;

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener("click", this.preventDoubleTapZoom);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("click", this.preventDoubleTapZoom);
  }

  private preventDoubleTapZoom = (event: MouseEvent) => {
    if (event.composedPath().some((target) => target instanceof SlButton)) {
      // Prevent double-tap zoom (on iOS) for all sl-buttons.
      // (Sadly, CSS `touch-action: ...` doesn't achieve this on iOS.)
      event.preventDefault();
    }
  };

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
      <slot slot="before"></slot>
      ${this.renderVirtualKeys()}
      ${this.renderUndoRedo()}
      <slot slot="after"></slot>
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
      ? html`<sl-icon name=${icon} label=${label}></sl-icon>`
      : label;
    return html`            
      <sl-button 
          class=${classMap(classes)}
          @click=${() => this.puzzle?.processKey(key.button)}
        >${content}</sl-button>
    `;
  };

  private renderUndoRedo() {
    return html`
      <div class="group">
        <sl-button
            ?disabled=${!this.puzzle?.canUndo}
            @click=${() => this.puzzle?.undo()}>
          <sl-icon slot="prefix" name="undo-2"></sl-icon>
          Undo
        </sl-button>
        <sl-button
            ?disabled=${!this.puzzle?.canRedo}
            @click=${() => this.puzzle?.redo()}>
          Redo
          <sl-icon slot="prefix" name="redo-2"></sl-icon>
        </sl-button>
      </div>
    `;
  }

  static styles = css`
    :host {
      --gap: var(--sl-spacing-x-small); 

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
      width: var(--sl-input-height-medium);
    }
    
    sl-button {
      /* Disable double-tap to zoom on keys that might be tapped quickly.
       * (Ineffective in iOS Safari; see preventDoubleTapZoom click handler.)
       */
      touch-action: pinch-zoom;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-keys": PuzzleKeys;
  }
}
