import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

@customElement("puzzle-display-name")
export class PuzzleDisplayName extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  // Render to light DOM for easier styling
  createRenderRoot() {
    return this;
  }

  render() {
    return html`${this.puzzle?.displayName || ""}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-display-name": PuzzleDisplayName;
  }
}
