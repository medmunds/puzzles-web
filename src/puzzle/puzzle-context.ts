import { SignalWatcher } from "@lit-labs/signals";
import { provide } from "@lit/context";
import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { puzzleContext } from "./contexts.ts";
import { Puzzle } from "./puzzle.ts";

@customElement("puzzle-context")
export class PuzzleContext extends SignalWatcher(LitElement) {
  @property({ type: String })
  type?: string;

  @property({ type: String })
  gameid?: string;

  @property({ type: String })
  params?: string;

  @provide({ context: puzzleContext })
  @state()
  private _puzzle?: Puzzle;

  // Expose the puzzle instance as a property
  get puzzle(): Puzzle | undefined {
    return this._puzzle;
  }

  override async connectedCallback() {
    super.connectedCallback();
    await this._loadPuzzle();
  }

  override render() {
    // Render the default slot for child components
    return html`<slot></slot>`;
  }

  async _loadPuzzle() {
    if (!this.type) {
      console.error("puzzle-context requires either type or src attribute");
      return;
    }

    this._puzzle = await Puzzle.create(this.type);

    // Set up the game based on attributes
    if (this.params) {
      const preset = Number.parseInt(this.params, 10);
      if (!Number.isNaN(preset)) {
        await this._puzzle.setPreset(preset);
      }
    }

    if (this.gameid === "none") {
      // Just set up the midend but don't create a new game
    } else if (this.gameid) {
      // Use the specified game ID
      await this._puzzle.setGameId(this.gameid);
    } else {
      // Create a new random game
      await this._puzzle.newGame();
    }

    // Dispatch event to indicate the puzzle is loaded
    this.dispatchEvent(
      new CustomEvent("puzzle-loaded", {
        bubbles: true,
        composed: true,
        detail: { puzzle: this._puzzle },
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-context": PuzzleContext;
  }
}
