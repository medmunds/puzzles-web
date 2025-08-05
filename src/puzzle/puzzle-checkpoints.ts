import type WaDropdownItem from "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

// Component registration
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

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
      <wa-dropdown placement="top-start" @wa-select=${this.handleSelectCheckpoint}>
        <wa-button slot="trigger" with-caret>
          <wa-icon slot="start" name="checkpoint"></wa-icon>
          Checkpoints
        </wa-button>
          ${hasCheckpoints ? html`<h3>Return to checkpoint</h3>` : nothing}
          ${checkpoints.map((checkpoint) => this.renderCheckpointItem(checkpoint))}
          ${hasCheckpoints ? html`<wa-divider></wa-divider>` : nothing}
          <wa-dropdown-item @click=${this.handleSaveCheckpoint}>Save checkpoint</wa-dropdown-item>
      </wa-dropdown>
    `;
  }

  private renderCheckpointItem(checkpoint: number) {
    const checked = checkpoint === this.puzzle?.currentMove;
    const ago = (this.puzzle?.totalMoves ?? 0) - checkpoint;
    const label =
      ago === 0 ? "Last move" : ago === 1 ? "1 move ago" : `${ago} moves ago`;
    return html`
      <wa-dropdown-item 
          value=${checkpoint} 
          type="checkbox" 
          ?checked=${checked}
        >${label}</wa-dropdown-item>
    `;
  }

  private handleSelectCheckpoint(event: CustomEvent<{ item: WaDropdownItem }>) {
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
