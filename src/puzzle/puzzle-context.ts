import { provide } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement } from "lit";
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

  @property({ type: String, reflect: true })
  gameid?: string;

  @property({ type: String, reflect: true })
  params?: string;

  @provide({ context: puzzleContext })
  @state()
  private _puzzle?: Puzzle;

  get puzzle(): Puzzle | undefined {
    return this._puzzle;
  }

  // For dispatching puzzle-game-state-change
  @state()
  protected currentMove?: number;
  @state()
  protected checkpoints?: ReadonlySet<number>;
  @state()
  protected statusbarText?: string; // for timed puzzles

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
    // Observe several properties for dispatching puzzle-game-state-change
    if (this.puzzle) {
      if (this.puzzle.currentGameId) {
        this.gameid = this.puzzle.currentGameId;
      }
      if (this.puzzle.currentParams) {
        this.params = this.puzzle.currentParams;
      }
      this.checkpoints = this.puzzle.checkpoints;
      if (this.puzzle.isTimed && this.puzzle.statusbarText !== null) {
        // Timed puzzles (mines) use the statusbar to display time;
        // this will dispatch puzzle-game-state-change when time is updated.
        this.statusbarText = this.puzzle.statusbarText;
      }
    }
    this.currentMove = this.puzzle?.currentMove;
  }

  protected override async updated(changedProps: Map<string, unknown>) {
    if (this.puzzle?.currentParams && changedProps.has("params")) {
      this.dispatchPuzzleEvent("puzzle-params-change");
    }
    if (
      this.puzzle?.currentGameId &&
      (changedProps.has("gameid") ||
        changedProps.has("currentMove") ||
        changedProps.has("checkpoints") ||
        changedProps.has("statusbarText"))
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
        const error = await this._puzzle.setParams(this.params);
        if (error) {
          throw new Error(`Invalid puzzle-view params="${this.params}": ${error}`);
        }
      }

      if (this.gameid === "none") {
        // Just set up the midend but don't create a new game
      } else if (this.gameid) {
        // Use the specified game ID
        const error = await this._puzzle.newGameFromId(this.gameid);
        if (error) {
          throw new Error(`Invalid puzzle-view gameid="${this.gameid}": ${error}`);
        }
      } else {
        // Create a new random game
        await this._puzzle.newGame();
      }
    }
  }

  private async _unloadPuzzle() {
    await this._puzzle?.delete();
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
    "puzzle-params-change": PuzzleEvent;
  }
}
