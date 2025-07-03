import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import type SlMenuItem from "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import { LitElement, html, nothing } from "lit";
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
import "@shoelace-style/shoelace/dist/components/menu-label/menu-label.js";

@customElement("puzzle-checkpoints")
export class PuzzleCheckpoints extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  protected override render() {
    const checkpoints = this.puzzle ? [...this.puzzle.checkpoints] : [];
    if (
      this.puzzle &&
      this.puzzle.currentMove < this.puzzle.totalMoves &&
      !this.puzzle.checkpoints.has(this.puzzle.totalMoves)
    ) {
      // When rewound to an earlier checkpoint (or any undo state),
      // always show a "Last move" allowing fast forward back to now.
      checkpoints.push(this.puzzle.totalMoves);
    }
    checkpoints.sort();
    const hasCheckpoints = checkpoints.length > 0;

    return html`
      <sl-dropdown hoist placement="top-start">
        <sl-button slot="trigger" caret>
          <sl-icon slot="prefix" name="checkpoint"></sl-icon>
          Checkpoints
        </sl-button>
        <sl-menu @sl-select=${this.handleSelectCheckpoint}>
          ${hasCheckpoints ? html`<sl-menu-label>Return to checkpoint</sl-menu-label>` : nothing}
          ${checkpoints.map((checkpoint) => this.renderCheckpointItem(checkpoint))}
          ${hasCheckpoints ? html`<sl-divider></sl-divider>` : nothing}
          <sl-menu-item @click=${this.handleSaveCheckpoint}>Save checkpoint</sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderCheckpointItem(checkpoint: number) {
    const checked = checkpoint === this.puzzle?.currentMove;
    const ago = (this.puzzle?.totalMoves ?? 0) - checkpoint;
    const label =
      ago === 0 ? "Last move" : ago === 1 ? "1 move ago" : `${ago} moves ago`;
    return html`
      <sl-menu-item 
          value=${checkpoint} 
          type="checkbox" 
          ?checked=${checked}
        >${label}</sl-menu-item>
    `;
  }

  private handleSelectCheckpoint(event: CustomEvent<{ item: SlMenuItem }>) {
    const value = event.detail.item.value;
    const checkpoint = Number.parseInt(value);
    if (Number.isFinite(checkpoint)) {
      this.puzzle?.goToCheckpoint(checkpoint);
    }
  }

  private handleSaveCheckpoint(event: Event) {
    event.stopPropagation(); // keep popup open
    this.puzzle?.addCheckpoint();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-checkpoints": PuzzleCheckpoints;
  }
}
