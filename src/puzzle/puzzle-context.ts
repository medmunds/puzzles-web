import { SignalWatcher } from "@lit-labs/signals";
import { provide } from "@lit/context";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { puzzleContext } from "./contexts.ts";
import { Puzzle } from "./puzzle.ts";

interface PuzzleEventDetail {
  puzzle: Puzzle;
}
export type PuzzleEvent = CustomEvent<PuzzleEventDetail>;

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

  get puzzle(): Puzzle | undefined {
    return this._puzzle;
  }

  // For dispatching puzzle-game-state-change (yuck)
  @state()
  private stateCounter?: number;

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
    // Observe puzzle.stateCounter for dispatching puzzle-state-change events
    this.stateCounter = this.puzzle?.stateCounter;
  }

  protected override async updated(changedProps: Map<string, unknown>) {
    if (
      changedProps.get("stateCounter") !== this.stateCounter &&
      this.stateCounter !== undefined
    ) {
      this.dispatchPuzzleEvent("puzzle-game-state-change");
    }
  }

  private async _loadPuzzle() {
    if (!this.type) {
      throw new Error("puzzle-context requires type");
    }
    this._puzzle = await Puzzle.create(this.type);

    // Notify puzzle-loaded. Listeners can preventDefault() to disable further setup.
    const event = this.dispatchPuzzleEvent("puzzle-loaded");
    if (!event.defaultPrevented) {
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
    }
  }

  private async _unloadPuzzle() {
    this._puzzle?.delete();
    this._puzzle = undefined;
  }

  private dispatchPuzzleEvent(type: string): PuzzleEvent {
    if (!this.puzzle) {
      throw new Error(
        `puzzle-context dispatchEvent("${type}") before puzzle initialized`,
      );
    }
    const event = new CustomEvent<PuzzleEventDetail>(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: {
        puzzle: this.puzzle,
      },
    });
    this.dispatchEvent(event);
    return event;
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

  interface HTMLElementEventMap {
    "puzzle-loaded": PuzzleEvent;
    "puzzle-game-state-change": PuzzleEvent;
  }
}
