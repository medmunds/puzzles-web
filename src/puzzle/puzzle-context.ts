import { SignalWatcher } from "@lit-labs/signals";
import { provide } from "@lit/context";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { puzzleContext } from "./contexts.ts";
import { Puzzle } from "./puzzle.ts";
import type { ConfigValues } from "./types.ts";

@customElement("puzzle-context")
export class PuzzleContext extends SignalWatcher(LitElement) {
  @property({ type: String })
  type?: string;

  @property({ type: String })
  gameid?: string;

  @property({ type: String })
  params?: string;

  @property({ type: Object })
  preferences?: ConfigValues;

  @provide({ context: puzzleContext })
  @state()
  private _puzzle?: Puzzle;

  get puzzle(): Puzzle | undefined {
    return this._puzzle;
  }

  override async connectedCallback() {
    super.connectedCallback();
    if (!this._puzzle) {
      await this._loadPuzzle();
    }
  }

  override async disconnectedCallback() {
    super.disconnectedCallback();
    await this._unloadPuzzle();
  }

  protected override render() {
    // Render the default slot for child components
    return html`<slot></slot>`;
  }

  protected override async willUpdate(changedProps: Map<string, unknown>) {
    if (
      changedProps.has("type") &&
      this._puzzle &&
      this._puzzle.puzzleId !== this.type
    ) {
      await this._unloadPuzzle();
      await this._loadPuzzle();
    }
  }

  protected override async updated(changedProps: Map<string, unknown>) {
    if (changedProps.has("preferences") && this.preferences) {
      await this._puzzle?.setPreferences(this.preferences);
    }
  }

  private async _loadPuzzle() {
    if (!this.type) {
      throw new Error("puzzle-context requires type");
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

    if (this.preferences) {
      await this._puzzle.setPreferences(this.preferences);
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

  private async _unloadPuzzle() {
    this._puzzle?.delete();
    this._puzzle = undefined;
  }

  static styles = css`
    :host {
      display: contents;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-context": PuzzleContext;
  }
}
