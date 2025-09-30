import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, state } from "lit/decorators.js";
import { puzzleContext } from "./puzzle/contexts.ts";
import type { Puzzle } from "./puzzle/puzzle.ts";
import { puzzlePageUrl } from "./routing.ts";
import { commonLinkStyle } from "./utils/css.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/copy-button/copy-button.js";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/textarea/textarea.js";

@customElement("share-dialog")
export class ShareDialog extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

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

  @state()
  private gameTypeDescription?: string;

  @state()
  private formattedText?: string;

  async reset() {
    this.gameTypeDescription = this.puzzle?.currentParams
      ? await this.puzzle.getParamsDescription(this.puzzle.currentParams)
      : undefined;
    this.formattedText = await this.puzzle?.formatAsText();
  }

  protected override render() {
    const puzzleName = this.puzzle?.displayName ?? "Unknown puzzle";
    const puzzleParams = this.puzzle?.currentParams;
    const gameId = this.puzzle?.currentGameId;
    const randomSeed = this.puzzle?.randomSeed;
    const preferredId = randomSeed ?? gameId;
    const puzzleId = this.puzzle?.puzzleId;
    const typeDescription = this.gameTypeDescription
      ? `type “${this.gameTypeDescription}”`
      : "this custom type";

    const puzzleTypeLink =
      puzzleId && puzzleParams
        ? puzzlePageUrl({ puzzleId, puzzleParams }).href
        : undefined;
    const currentGameLink =
      puzzleId && preferredId
        ? puzzlePageUrl({ puzzleId, puzzleGameId: preferredId })
        : undefined;

    // TODO: Skip sgt links for puzzles not on SGT's site (unfinished, unreleased, etc.)
    const sgtBaseUrl = `https://www.chiark.greenend.org.uk/~sgtatham/puzzles/js/${encodeURIComponent(puzzleId ?? "unknown")}.html`;
    const sgtGameIdLink = gameId
      ? Object.assign(new URL(sgtBaseUrl), { hash: gameId })
      : undefined;
    const sgtRandomSeedLink = randomSeed
      ? Object.assign(new URL(sgtBaseUrl), { hash: randomSeed })
      : undefined;

    return html`
      <wa-dialog light-dismiss>
        <div slot="label">Share</div>
        
        <wa-details open name="share">
          <div slot="summary">Link to <cite>${puzzleName}</cite></div>
          ${this.renderCopyableInput({
            label: "This specific game",
            value: currentGameLink,
            hint: "Challenge a friend to solve the same puzzle",
          })}
          ${this.renderCopyableInput({
            label: "This puzzle type",
            value: puzzleTypeLink,
            hint: `Random games of ${typeDescription}`,
          })}
        </wa-details>
        
        ${
          this.formattedText
            ? html`
              <wa-details name="share">
                <div slot="summary" id="text-label">Copy as text</div>
                <wa-textarea 
                    id="formatted-text"
                    aria-labelledby="text-label"
                    hint="An ASCII art version of the game’s current state"
                    readonly 
                    rows=${Math.min(15, this.formattedText.split("\n").length - 1)}
                    resize="vertical" 
                    .value=${this.formattedText}
                    @focus=${this.selectAllOnFocus}
                ></wa-textarea>
                <wa-copy-button class="inset" from="formatted-text.value"></wa-copy-button>
              </wa-details>
            `
            : nothing
        }
        
        <wa-details name="share" class="tight">
          <div slot="summary">Game ID and more</div>
          
          ${this.renderCopyableInput({
            label: "Game ID",
            value: gameId,
          })}
          ${this.renderCopyableInput({
            label: "Random seed",
            value: randomSeed,
          })}
          <div class="hint">Enter into any compatible <cite>Portable Puzzle 
            Collection</cite> app to play this same game</div>
          
          ${
            sgtGameIdLink || sgtRandomSeedLink
              ? html`
                <div>
                  <wa-divider></wa-divider>
                  Play this game at Simon Tatham’s website
                  ${this.renderOffsiteLink({ hint: "by game ID", url: sgtGameIdLink })}
                  ${this.renderOffsiteLink({ hint: "by random seed", url: sgtRandomSeedLink })}
                </div>
                `
              : nothing
          }
        </wa-details>
        
      </wa-dialog>
    `;
  }

  private renderCopyableInput({
    label,
    hint,
    value,
  }: {
    label?: string | TemplateResult;
    hint?: string;
    value: string | URL | undefined;
  }) {
    if (!value) {
      return nothing;
    }
    return html`
      <wa-input
          label=${typeof label === "string" ? label : nothing}
          hint=${hint}
          readonly
          .value=${value}
          @focus=${this.selectAllOnFocus}
      >
        ${typeof label === "string" ? nothing : html`<div slot="label">${label}</div>`}
        <wa-copy-button slot="end" value=${value}></wa-copy-button>
      </wa-input>
    `;
  }

  private renderOffsiteLink({
    label,
    hint,
    url,
  }: {
    label?: string;
    hint?: string;
    url: string | URL | undefined;
  }) {
    if (!url) {
      return nothing;
    }
    return html`
      <div>
        ${label ? html`<div>${label}</div>` : nothing}
        <div class="link">
          <a href=${url} target="_blank">${url}</a>
          <wa-copy-button value=${url}></wa-copy-button>
        </div>
        ${hint ? html`<div class="hint">${hint}</div>` : nothing}
      </div>
    `;
  }

  private selectAllOnFocus(event: FocusEvent) {
    // Select all on focus
    (event.target as HTMLInputElement | HTMLTextAreaElement).select();
  }

  static styles = [
    commonLinkStyle,
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

    wa-dialog::part(dialog) {
      background-color: var(--wa-color-neutral-fill-quiet);
    }

    wa-details[open]::part(header) {
      border-block-end:
          var(--wa-panel-border-width)
          var(--wa-color-surface-border)
          var(--wa-panel-border-style);
    }
    
    wa-details::part(header) {
      color: var(--wa-form-control-label-color);
      font-weight: var(--wa-form-control-label-font-weight);
    }

    wa-details::part(content) {
      max-width: 100%;

      display: flex;
      flex-direction: column;
      gap: var(--wa-space-l);
      
      position: relative; /* For .inset copy button */
    }
    wa-details.tight::part(content) {
      gap: var(--wa-space-m);
    }
    
    wa-input::part(label) {
      color: inherit;
      font-weight: inherit;
    }
    
    wa-input:has(:focus-within)::part(input):focus-within {
      /* Prevent double focus rect when focus on copy-button inside input*/
      outline: none;
    }
    
    wa-input wa-copy-button {
      /* Reduce horizontal spacing at start, overlap padding at end */
      margin-inline: 0.5em -0.75em;
    }
    
    wa-textarea {
      &::part(textarea) {
        font-family: var(--wa-font-family-code);
        min-height: 2lh;
        white-space: pre;
      }
    }
    
    wa-copy-button.inset {
      /* align icon with textarea content area: 
       * details content padding + textarea padding - copy-button padding */
      position: absolute;
      inset-block-start: 
          calc(var(--wa-space-m) + var(--wa-form-control-padding-block) - 0.5em);
      inset-inline-end: 
          calc(var(--wa-space-m) + var(--wa-form-control-padding-inline) - 0.75em);
      
      &:not(:hover)::part(button) {
        /* It's transparent by default; may have text under it */
        background-color: var(--wa-form-control-background-color);
      }
    }

    .link {
      display: flex;
      gap: var(--wa-space-xs);
      align-items: baseline;
      
      a {
        display: inline-block;
        min-width: 1px;
        flex: 1 1 auto;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }

    .hint {
      /* match hint in various controls */
      color: var(--wa-form-control-hint-color);
      font-size: var(--wa-font-size-smaller);
      font-weight: var(--wa-form-control-hint-font-weight);
      line-height: var(--wa-form-control-hint-line-height);
    }
  `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "share-dialog": ShareDialog;
  }
}
