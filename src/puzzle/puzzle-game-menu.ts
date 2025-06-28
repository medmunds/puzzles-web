import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import { LitElement, type TemplateResult, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { puzzleContext } from "./contexts.ts";
import type { PuzzlePreferences } from "./puzzle-config.ts";
import type { Puzzle } from "./puzzle.ts";

// Component registration
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "./puzzle-config.ts";

@customElement("puzzle-game-menu")
export class PuzzleGameMenu extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  private preferencesDialog?: PuzzlePreferences;

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.preferencesDialog) {
      this.preferencesDialog.remove();
      this.preferencesDialog = undefined;
    }
  }

  render(): TemplateResult {
    return html`
      <sl-dropdown hoist>
        <sl-button slot="trigger" caret>Game</sl-button>
        <sl-menu @sl-select=${this.handleGameMenuCommand}>
          <sl-menu-item value="new">
            <sl-icon slot="prefix" name="new-game"></sl-icon>
            New game
          </sl-menu-item>
          <sl-menu-item value="restart">
            <sl-icon slot="prefix" name="restart-game"></sl-icon>
            Restart game
          </sl-menu-item>
          ${when(
            this.puzzle?.canSolve,
            () =>
              html`
                <sl-menu-item value="solve" ?disabled=${this.puzzle?.status === "solved"}>
                  <sl-icon slot="prefix" name="show-solution"></sl-icon>
                  Solve
                </sl-menu-item>
              `,
          )}
          <sl-divider></sl-divider>
          <sl-menu-item value="preferences">
            <sl-icon slot="prefix" name="settings"></sl-icon>
            Preferences…
          </sl-menu-item>
          <slot></slot>
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private async handleGameMenuCommand(event: CustomEvent<{ item: { value: string } }>) {
    // TODO: I'd like to call stopPropagation() here for handled commands
    //   (so parent can warn on commands it doesn't handle),
    //   but that prevents the dropdown from closing after clicking (?!)
    const value = event.detail.item.value;
    switch (value) {
      case "new":
        await this.puzzle?.newGame();
        break;
      case "restart":
        await this.puzzle?.restartGame();
        break;
      case "solve":
        await this.puzzle?.solve();
        break;
      case "preferences":
        await this.launchPreferencesDialog();
        break;
      // Other commands are handled by the parent component
    }
  }

  private async launchPreferencesDialog() {
    if (!this.puzzle) {
      throw new Error("launchPreferencesDialog() called without a puzzle");
    }
    if (!this.preferencesDialog) {
      const container = this.closest("puzzle-context");
      if (!container) {
        throw new Error("launchCustomDialog() can't find puzzle-context container");
      }
      this.preferencesDialog = document.createElement("puzzle-preferences");
      container.appendChild(this.preferencesDialog);
      await this.preferencesDialog.updateComplete;
    } else if (!this.preferencesDialog.open) {
      // Refresh the items for the current puzzle
      await this.preferencesDialog.reloadValues();
    }

    this.preferencesDialog.show();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-game-menu": PuzzleGameMenu;
  }
}
