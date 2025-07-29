import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import { LitElement, type TemplateResult, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { notifyError } from "../utils/errors.ts";
import { sleep } from "../utils/timing.ts";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

// Component registration
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";

@customElement("puzzle-game-menu")
export class PuzzleGameMenu extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

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
          <sl-menu-item value="share" disabled>
            <sl-icon slot="prefix" name="share"></sl-icon>
            Share…
          </sl-menu-item>
          <sl-menu-item value="save">
            <sl-icon slot="prefix" name="save-game"></sl-icon>
            Save…
          </sl-menu-item>
          <sl-menu-item value="load">
            <sl-icon slot="prefix" name="load-game"></sl-icon>
            Load…
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
      case "share":
        break;
      case "save":
        await this.saveGameToFile();
        break;
      case "load":
        await this.loadGameFromFile();
        break;
      // Other commands are handled by the parent component
    }
  }

  async saveGameToFile() {
    if (!this.puzzle) {
      return;
    }
    const type = "application/octet-stream"; // or text/plain, but upstream uses this
    const data = await this.puzzle.saveGame();
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toLocaleString();
    const filename = `${this.puzzle.displayName} ${dateStr}.sav`;
    const anchor = Object.assign(document.createElement("a"), {
      href: url,
      download: filename,
      type,
    });
    anchor.click();
    await sleep(10);
    URL.revokeObjectURL(url);
  }

  async loadGameFromFile() {
    if (!this.puzzle) {
      return;
    }
    const input = Object.assign(document.createElement("input"), {
      type: "file",
      multiple: false,
      accept: ".sav,.sgt,.sgtpuzzle,.txt",
      onchange: async () => {
        const file = input.files?.[0];
        if (file) {
          const data = new Uint8Array(await file.arrayBuffer());
          const errorMessage = await this.puzzle?.loadGame(data);
          if (errorMessage) {
            await notifyError(errorMessage);
          }
        }
      },
      onerror: async (error: unknown) => {
        await notifyError(String(error));
      },
    });
    input.click();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-game-menu": PuzzleGameMenu;
  }
}
