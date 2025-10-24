import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, state } from "lit/decorators.js";
import { puzzleContext } from "./puzzle/contexts.ts";
import type { Puzzle } from "./puzzle/puzzle.ts";
import { cssWATweaks } from "./utils/css.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/callout/callout.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/input/input.js";

/**
 * If href is a permalink to puzzleId at SGT's website,
 * return the game id or random seed from its hash.
 */
function extractSGTGameID(href: string | URL, puzzleId: string): string | undefined {
  // https://www.chiark.greenend.org.uk/~sgtatham/puzzles/js/solo.html#3x3db%23529619113385357
  let url: URL;
  try {
    url = href instanceof URL ? href : new URL(href);
  } catch {
    return undefined;
  }

  if (
    url.hostname === "www.chiark.greenend.org.uk" &&
    url.pathname === `/~sgtatham/puzzles/js/${puzzleId}.html` &&
    url.hash
  ) {
    let hash = url.hash.replace(/^#/, "");
    if (/%[0-9a-e]{2}/i.test(hash)) {
      hash = decodeURIComponent(hash);
    }
    if (hash) {
      return hash;
    }
  }
}

@customElement("enter-gameid-dialog")
export class EnterGameIDDialog extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  @state()
  private gameid?: string;

  @state()
  private error?: string;

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

  reset() {
    this.gameid = undefined;
    this.error = undefined;
  }

  protected override render() {
    const puzzleName = this.puzzle?.displayName ?? "Unknown puzzle";
    const callout = this.error
      ? html`
          <wa-callout variant="danger">
            <wa-icon slot="icon" name="error"></wa-icon>
            <strong>Unable to use that id</strong>&hairsp;&mdash;&hairsp;are you 
            sure it’s for ${puzzleName}?<br>
            (Error: ${this.error}.)
          </wa-callout>
        `
      : this.puzzle?.totalMoves
        ? html`
          <wa-callout variant="warning">
            <wa-icon slot="icon" name="warning"></wa-icon>
            This will replace the game in progress
          </wa-callout>
        `
        : nothing;

    return html`
      <wa-dialog>
        <div slot="label">Load game by ID</div>
        
        <wa-input
            autofocus
            .value=${this.gameid}
            @input=${this.handleInputChange}
            @focus=${this.handleInputFocus}
            @keydown=${this.handleInputKeydown}
        >
          <div slot="label">
            Enter a ${puzzleName} game ID or random seed
          </div>
          <div slot="hint">
            Copied from any compatible portable puzzles collection app
          </div>
        </wa-input>
        
        ${callout}

        <footer slot="footer">
          <wa-button
              @click=${this.handleCancelClick}
          >Cancel</wa-button>
          <wa-button
              variant="brand"
              ?disabled=${!this.gameid}
              @click=${this.handleOKClick}
          >OK</wa-button>
        </footer>
      </wa-dialog>
    `;
  }

  private handleInputChange(event: UIEvent) {
    const input = event.target as HTMLElementTagNameMap["wa-input"];
    const value = input.value?.trim() ?? "";
    const gameid = extractSGTGameID(value, this.puzzle?.puzzleId ?? "unknown") ?? value;
    if (gameid !== this.gameid) {
      this.gameid = gameid;
      this.error = undefined;
    }
  }

  private handleInputFocus(event: FocusEvent) {
    (event.target as HTMLInputElement).select();
  }

  private async handleInputKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      this.handleInputChange(event);
      if (this.gameid) {
        await this.handleOKClick();
      }
    }
  }

  private async handleOKClick() {
    if (this.puzzle && this.gameid) {
      const error = await this.puzzle.newGameFromId(this.gameid);
      if (error) {
        this.error = error;
      } else {
        this.open = false;
      }
    }
  }

  private handleCancelClick() {
    this.open = false;
  }

  static styles = [
    cssWATweaks,
    css`
      :host {
        display: contents;
      }
  
      wa-dialog {
        --width: min(calc(100vw - 2 * var(--wa-space-l)), 35rem);
      }
  
      wa-dialog::part(body) {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-l);
      }
  
      footer {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        justify-content: end;
        align-items: center;
        gap: var(--wa-space-s);
      }
      
      wa-input::part(label) {
        margin-bottom: var(--wa-space-s);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "enter-gameid-dialog": EnterGameIDDialog;
  }
}
