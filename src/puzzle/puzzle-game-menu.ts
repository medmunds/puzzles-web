import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { html, LitElement, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { notifyError } from "../utils/errors.ts";
import { sleep } from "../utils/timing.ts";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

// Component registration
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

@customElement("puzzle-game-menu")
export class PuzzleGameMenu extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  render(): TemplateResult {
    return html`
      <wa-dropdown @wa-select=${this.handleGameMenuCommand}>
        <wa-button slot="trigger" appearance="filled outlined" with-caret>Game</wa-button>
        <wa-dropdown-item value="new">
          <wa-icon slot="icon" name="new-game"></wa-icon>
          New game
        </wa-dropdown-item>
        <wa-dropdown-item value="restart">
          <wa-icon slot="icon" name="restart-game"></wa-icon>
          Restart game
        </wa-dropdown-item>
        ${when(
          this.puzzle?.canSolve,
          () =>
            html`
              <wa-dropdown-item value="solve" ?disabled=${this.puzzle?.status === "solved"}>
                <wa-icon slot="icon" name="show-solution"></wa-icon>
                Solve
              </wa-dropdown-item>
            `,
        )}
        <wa-divider></wa-divider>
        <wa-dropdown-item value="share" disabled>
          <wa-icon slot="icon" name="share"></wa-icon>
          Share…
        </wa-dropdown-item>
        <wa-dropdown-item value="save">
          <wa-icon slot="icon" name="save-game"></wa-icon>
          Save…
        </wa-dropdown-item>
        <wa-dropdown-item value="load">
          <wa-icon slot="icon" name="load-game"></wa-icon>
          Load…
        </wa-dropdown-item>
        <slot></slot>
      </wa-dropdown>
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
