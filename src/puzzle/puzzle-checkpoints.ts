import type WaDropdownItem from "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

// Component registration
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

@customElement("puzzle-checkpoints")
export class PuzzleCheckpoints extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  protected override render() {
    return html`
      <wa-dropdown placement="top-start" @wa-select=${this.handleSelectCheckpoint}>
        <wa-button slot="trigger" with-caret>
          <wa-icon slot="start" name="checkpoint-list"></wa-icon>
          Checkpoints
        </wa-button>

        <label for="list">History</label>
        <ol id="list">${this.renderHistoryItems()}</ol>

        <wa-divider></wa-divider>
        <wa-dropdown-item @click=${this.handleSaveCheckpoint}>
          <wa-icon slot="icon" name="checkpoint-add"></wa-icon>
          Save checkpoint
        </wa-dropdown-item>
      </wa-dropdown>
    `;
  }

  private renderHistoryItems() {
    const items: TemplateResult[] = [];
    if (!this.puzzle) {
      return items;
    }
    // TODO: Limit startMove/endMove/checkpoints to current "restart game" section
    const startMove = 0;
    const endMove = this.puzzle.totalMoves;
    const checkpoints = this.puzzle.checkpoints;

    if (!checkpoints.has(startMove)) {
      items.push(
        this.renderHistoryItem({
          label: "Start",
          move: startMove,
          icon: "checkpoint-start",
        }),
      );
    }

    let lastMove = startMove;
    for (const checkpoint of [...checkpoints].sort()) {
      items.push(
        ...this.renderHistorySpace({ start: lastMove + 1, end: checkpoint - 1 }),
        this.renderHistoryItem({
          label: html`Checkpoint <small>(${checkpoint + 1})</small>`,
          move: checkpoint,
          icon: "checkpoint",
          canDelete: true,
        }),
      );
      lastMove = checkpoint;
    }

    items.push(...this.renderHistorySpace({ start: lastMove + 1, end: endMove - 1 }));
    if (endMove > startMove && !checkpoints.has(endMove)) {
      items.push(
        this.renderHistoryItem({
          label: "Last move",
          move: endMove,
          icon: "checkpoint-end",
        }),
      );
    }

    return items;
  }

  private renderHistoryItem({
    label,
    move,
    icon,
    canDelete = false,
  }: {
    label: string | TemplateResult;
    move: number;
    icon: string;
    canDelete?: boolean;
  }) {
    const isCurrentMove =
      move === this.puzzle?.currentMove && this.puzzle?.totalMoves > 0;
    const iconName = isCurrentMove ? "checkpoint-current-move" : icon;
    const iconLabel = isCurrentMove ? "Current undo" : nothing;

    const deleteButton = canDelete
      ? html`
        <wa-button slot="details" appearance="plain" size="small"
          @click=${this.handleRemoveCheckpoint}
        >
          <wa-icon name="checkpoint-remove" label="Delete checkpoint"></wa-icon>
        </wa-button>`
      : nothing;

    return html`
      <wa-dropdown-item value=${move} role="listitem">
        <wa-icon slot="icon" name=${iconName} label=${iconLabel}></wa-icon>
        ${label}
        ${deleteButton}
      </wa-dropdown-item>
    `;
  }

  private renderHistorySpace({ start, end }: { start: number; end: number }) {
    const result: TemplateResult[] = [];
    const moves = end - start + 1;
    if (moves < 1) {
      return result;
    }

    const currentMove = this.puzzle?.currentMove ?? 0;
    if (currentMove >= start && currentMove <= end) {
      // Show the current undo point between spacers
      if (currentMove > start) {
        result.push(this.renderSpacer(currentMove - start));
      }
      result.push(html`
        <div class="undo-point">
          <wa-icon name="checkpoint-current-move"></wa-icon>
          <span>Current undo <small>(${currentMove + 1})</small></span>
        </div>
      `);
      if (currentMove < end) {
        result.push(this.renderSpacer(end - currentMove));
      }
    } else {
      result.push(this.renderSpacer(moves));
    }
    return result;
  }

  private renderSpacer(moves: number) {
    return html`
      <div class="spacer" data-moves=${moves}>
        ${moves > 1 ? html`<small>&hellip; ${moves} moves &hellip;</small>` : nothing}
      </div>
    `;
  }

  private handleSelectCheckpoint(event: CustomEvent<{ item: WaDropdownItem }>) {
    const value = event.detail.item.value;
    const checkpoint = Number.parseInt(value);
    if (Number.isFinite(checkpoint)) {
      this.puzzle?.goToCheckpoint(checkpoint);
    }
  }

  private handleRemoveCheckpoint(event: Event) {
    // TODO: two-step confirm before removing
    const menuItem =
      event.target instanceof HTMLElement ? event.target.closest("[value]") : null;
    if (menuItem) {
      // don't trigger containing dropdown item, and keep the dropdown open
      event.stopPropagation();
      const value = menuItem.getAttribute("value") ?? "-1";
      const move = Number.parseInt(value);
      if (Number.isFinite(move)) {
        this.puzzle?.removeCheckpoint(move);
      }
    }
  }

  private handleSaveCheckpoint(event: Event) {
    event.stopPropagation(); // keep popup open
    this.puzzle?.addCheckpoint();
  }

  static override styles = css`
    :host {
      --timeline-width: 1px;
      --timeline-color: var(--wa-color-neutral-border-normal);
      --background-color: var(--wa-color-surface-default);
    }
    
    label {
      padding: 0.5em 1em;
      background-color: var(--background-color);
      /*font-family: var(--wa-font-family-heading);*/
      font-weight: var(--wa-font-weight-semibold);
      position: sticky;
      inset-block-start: -0.25em; /* wa-dropdown::part(menu) padding */
      z-index: 1;
    }
    
    ol {
      padding: 0;
      margin: 0;
    }

    small {
      color: var(--wa-color-text-quiet);
      font-size: var(--wa-font-size-smaller);
      font-style: italic;
    }

    #list > * {
      position: relative;

      /* Display a timeline on the left (underneath the items' icons) */
      &::before {
        display: block;
        content: "";
        position: absolute;
        inset: 0 calc(1.5em - var(--timeline-width) / 2 - 1px); /* padding + icon-width/2 = 1em + 1em/2 */
        border-inline-start: var(--timeline-width) solid var(--timeline-color);
      }
      &:first-child::before {
        inset-block-start: 50%;
      }
      &:last-child::before {
        inset-block-end: 50%;
      }

      wa-icon[name="checkpoint-start"],
      wa-icon[name="checkpoint-end"] {
        color: var(--timeline-color); /* timeline terminators */
      }
      wa-icon[name="checkpoint"]::part(svg),
      wa-icon[name="checkpoint-current-move"]::part(svg)
      {
        /* Use background fill on icons that overlap the timeline */
        fill: var(--background-color) !important;
      }
      
    }
    
    #list > wa-dropdown-item::part(icon), 
    #list > .undo-point wa-icon {
      z-index: 1; /* above the timeline */
    }

    #list wa-button {
      /* Counteract doubled padding around delete buttons */
      margin: -0.5em;
    }
    
    #list > .undo-point {
      /* Mimic a wa-dropdown-item */
      box-sizing: border-box;
      padding: 0.5em 1em;
      line-height: var(--wa-line-height-condensed);

      display: flex;
      align-items: center;

      wa-icon {
        z-index: 1;
        font-size: var(--wa-font-size-smaller);
        margin-inline-end: 0.75em;
      }
      span {
        display: block;
        color: var(--wa-color-text-quiet);
      }
    }

    #list > .spacer {
      box-sizing: border-box;
      padding: 0.25em 1em;
      line-height: 1;
      
      small {
        margin-inline-start: 1.75em;
      }
      
      &::before {
        border-inline-start-style: dotted;
        border-inline-start-width: calc(var(--timeline-width) * 4);
        inset-inline-start: calc(1.5em - 2 * var(--timeline-width) - 1px);
      }

      &[data-moves="1"] {
        /* Try to size it to a single border dot */
        padding-block: 0;
        height: calc(var(--timeline-width) * 4);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-checkpoints": PuzzleCheckpoints;
  }
}
