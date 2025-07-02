import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import type SlMenuItem from "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

// Component registration
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";

@customElement("puzzle-checkpoints")
export class PuzzleCheckpoints extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  protected override render() {
    const checkpoints = this.puzzle?.checkpoints ?? [];
    return html`
      <sl-dropdown hoist placement="top-start">
        <sl-button slot="trigger" caret>
          <sl-icon slot="prefix" name="checkpoint"></sl-icon>
          Checkpoint
        </sl-button>
        <sl-menu @sl-select=${this.handleSelect}>
          ${checkpoints.map((checkpoint) => this.renderCheckpointItem(checkpoint))}
          ${checkpoints.length > 0 ? html`<sl-divider></sl-divider>` : nothing}
          <sl-menu-item value="new">Set checkpoint</sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderCheckpointItem(checkpoint: number) {
    const checked = checkpoint === this.puzzle?.currentMove;
    const ago = (this.puzzle?.totalMoves ?? 0) - checkpoint;
    const label =
      ago === 0 ? "Current move" : ago === 1 ? "Last move" : `${ago} moves ago`;
    return html`
      <sl-menu-item 
          value=${checkpoint} 
          type="checkbox" 
          ?checked=${checked}
        >${label}</sl-menu-item>
    `;
  }

  private handleSelect(event: CustomEvent<{ item: SlMenuItem }>) {
    const value = event.detail.item.value;
    if (value === "new") {
      this.puzzle?.setCheckpoint();
    } else {
      const checkpoint = Number.parseInt(value);
      this.puzzle?.goToCheckpoint(checkpoint);
    }
  }

  static styles = css`
    sl-button::part(caret) {
      transform: rotate(180deg);
    }
    
    @media(prefers-reduced-motion: no-preference) {
      sl-dropdown sl-button::part(caret) {
        transition: transform var(--sl-transition-fast) ease;
      }
      sl-dropdown[open] sl-button::part(caret) {
        transform: rotate(0deg);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-checkpoints": PuzzleCheckpoints;
  }
}
