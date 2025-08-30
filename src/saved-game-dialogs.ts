import { css, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property } from "lit/decorators.js";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/callout/callout.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/popover/popover.js";
import "./saved-game-list.ts";

interface GameDialogEventDetail {
  filename: string;
}

export type GameDialogEvent = CustomEvent<GameDialogEventDetail>;

/**
 * Common functionality and styling for LoadGameDialog and SaveGameDialog
 */
abstract class GameFileDialog extends LitElement {
  @property({ type: String })
  puzzleId?: string;

  @property({ type: String })
  filename: string = "";

  @query("wa-dialog", true)
  protected dialog?: HTMLElementTagNameMap["wa-dialog"];

  get open(): boolean {
    return this.dialog?.open ?? false;
  }
  set open(value: boolean) {
    if (this.dialog) {
      this.dialog.open = value;
    }
  }

  protected dispatchEventAndClose(type: string) {
    const event = new CustomEvent<GameDialogEventDetail>(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: { filename: this.filename },
    });
    if (this.dispatchEvent(event)) {
      this.open = false;
    }
  }

  static styles = css`
    wa-dialog {
      --width: min(calc(100vw - 2 * var(--wa-space-l)), 35rem);
    }
    
    wa-dialog::part(body) {
      padding-block-start: calc(var(--spacing) - var(--wa-form-control-padding-block));
      
      display: flex;
      flex-direction: column;
      gap: var(--wa-space-l);
    }
    
    saved-game-list {
      flex: 1 1 14em;
      min-height: 5em;
    }
    
    wa-dialog::part(footer) {
      gap: var(--wa-space-m);
    }

    [slot="footer"].start {
      margin-inline-end: auto;
    }
    
    wa-popover p {
      margin: 0;
      &:not(:first-child) {
        margin-block-start: var(--wa-space-l);
      }
    }
  `;
}

@customElement("load-game-dialog")
export class LoadGameDialog extends GameFileDialog {
  @property({ type: Boolean, attribute: "game-in-progress" })
  gameInProgress: boolean = false;

  protected override render() {
    const isApp = !window.matchMedia("(display-mode: browser)").matches;

    return html`
      <wa-dialog>
        <div slot="label">Load game</div>
        <wa-button
            slot="header-actions"
            appearance="plain"
            id="help">
          <wa-icon label="Help" name="help"></wa-icon>
        </wa-button>
        <wa-popover for="help">
          <p>Pick a game you saved earlier to resume play.</p>
          <p>Or use <em>Import</em> to ${isApp ? "load" : "upload"} a file saved 
            from any compatible <cite>Portable Puzzles Collection</cite> app.</p>
        </wa-popover>

        <saved-game-list
            puzzleId=${this.puzzleId}
            @dblclick=${this.handleSavedGameDoubleClick}
            @saved-game-list-select=${this.handleSavedGameSelect}
        >
          <div slot="placeholder">(saved games will appear here)</div>
        </saved-game-list>

        ${
          this.gameInProgress
            ? html`
              <wa-callout variant="warning">
                <wa-icon slot="icon" name="warning"></wa-icon>
                This will replace the game in progress
              </wa-callout>
            `
            : nothing
        }
        
        <wa-button
            slot="footer" class="start"
            appearance="filled outlined"
            @click=${this.handleImportClick}
        >Import&hellip;</wa-button>
        
        <wa-button
            slot="footer"
            appearance="filled outlined"
            @click=${this.handleCancelClick}
        >Cancel</wa-button>
        <wa-button
            slot="footer"
            variant="brand"
            ?disabled=${!this.filename}
            @click=${this.handleLoadClick}
        >Load</wa-button>
      </wa-dialog>
    `;
  }

  private handleSavedGameSelect(event: HTMLElementEventMap["saved-game-list-select"]) {
    const { filename } = event.detail.item;
    this.filename = filename;
  }

  private handleSavedGameDoubleClick() {
    if (this.filename) {
      this.handleLoadClick();
    }
  }

  private handleImportClick() {
    this.dispatchEventAndClose("load-game-import");
  }

  private handleCancelClick() {
    this.dispatchEventAndClose("load-game-cancel");
  }

  private handleLoadClick() {
    this.dispatchEventAndClose("load-game-load");
  }
}

@customElement("save-game-dialog")
export class SaveGameDialog extends GameFileDialog {
  protected override render() {
    const isApp = !window.matchMedia("(display-mode: browser)").matches;

    return html`
      <wa-dialog>
        <div slot="label">Save game</div>
        <wa-button
            slot="header-actions"
            appearance="plain"
            id="help">
          <wa-icon label="Help" name="help"></wa-icon>
        </wa-button>
        <wa-popover for="help">
          <p>Save the current game so you can return to it later. 
            (Saved games are kept in ${isApp ? "this app’s" : "your browser’s"} 
            local storage.)</p>
          <p>Or use <em>Export</em> to ${isApp ? "create" : "download"} a file 
            you can load into any compatible <cite>Portable Puzzles Collection</cite> 
            app.</p>
        </wa-popover>
        
        <saved-game-list 
            puzzleId=${this.puzzleId}
            @saved-game-list-select=${this.handleSavedGameSelect}
        >
          <div slot="placeholder">(saved games will appear here)</div>
        </saved-game-list>
        <wa-input
            label="Name"
            autofocus
            .value=${this.filename}
            @change=${this.handleFilenameInputChange}
            @focus=${this.handleFilenameInputFocus}
            @keydown=${this.handleFilenameInputKeydown}
        ></wa-input>
        
        <wa-button
            slot="footer" class="start"
            appearance="filled outlined"
            @click=${this.handleExportClick}
        >Export&hellip;</wa-button>
        <wa-button 
            slot="footer"
            appearance="filled outlined"
            @click=${this.handleCancelClick}
        >Cancel</wa-button>
        <wa-button 
            slot="footer"
            variant="brand"
            ?disabled=${!this.filename}
            @click=${this.handleSaveClick}
        >Save</wa-button>
      </wa-dialog>
    `;
  }

  private handleSavedGameSelect(event: HTMLElementEventMap["saved-game-list-select"]) {
    const { filename } = event.detail.item;
    this.filename = filename;
  }

  private handleFilenameInputChange(event: UIEvent) {
    this.filename = (event.target as HTMLInputElement).value.trim();
  }

  private handleFilenameInputFocus(event: FocusEvent) {
    (event.target as HTMLInputElement).select();
  }

  private handleFilenameInputKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      this.filename = (event.target as HTMLInputElement).value.trim();
      if (this.filename) {
        this.handleSaveClick();
      }
    }
  }

  private handleExportClick() {
    this.dispatchEventAndClose("save-game-export");
  }

  private handleCancelClick() {
    this.dispatchEventAndClose("save-game-cancel");
  }

  private handleSaveClick() {
    console.log(`Saving ${this.filename}`);
    this.dispatchEventAndClose("save-game-save");
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "load-game-dialog": LoadGameDialog;
    "save-game-dialog": SaveGameDialog;
  }

  interface HTMLElementEventMap {
    "load-game-cancel": CustomEvent;
    "load-game-import": CustomEvent;
    "load-game-load": GameDialogEvent;
    "save-game-cancel": CustomEvent;
    "save-game-export": GameDialogEvent;
    "save-game-save": GameDialogEvent;
  }
}
