import type WaDropdownItem from "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import timelineArrowSvg from "../assets/timeline-arrow.svg";
import timelineDotSvg from "../assets/timeline-dot.svg";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

// Component registration
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/button-group/button-group.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

@customElement("puzzle-history")
export class PuzzleHistory extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  @query("wa-dropdown")
  private dropdown?: HTMLElementTagNameMap["wa-dropdown"];

  private dynamicStyleSheet?: CSSStyleSheet;

  private updateSVGDataUrls() {
    // Build --timeline-arrow-image and --timeline-dot-image
    // using color properties.
    const timelineColor = getComputedStyle(this)
      .getPropertyValue("--timeline-color")
      .trim();
    const backgroundColor = getComputedStyle(this)
      .getPropertyValue("--background-color")
      .trim();

    const encodedTimelineColor = encodeURIComponent(timelineColor);
    const encodedBackgroundColor = encodeURIComponent(backgroundColor);

    const arrowImage = timelineArrowSvg
      .replace("grey", encodedTimelineColor)
      .replace("white", encodedBackgroundColor);
    const dotImage = timelineDotSvg
      .replace("grey", encodedTimelineColor)
      .replace("white", encodedBackgroundColor);

    if (!this.dynamicStyleSheet) {
      if (!this.shadowRoot) {
        throw new Error("Missing shadowRoot");
      }
      this.dynamicStyleSheet = new CSSStyleSheet();
      this.shadowRoot.adoptedStyleSheets = [
        ...this.shadowRoot.adoptedStyleSheets,
        this.dynamicStyleSheet,
      ];
    }

    const dynamicCSS = `
      :host {
        --timeline-arrow-image: url("${arrowImage}");
        --timeline-dot-image: url("${dotImage}");
      }
    `;
    this.dynamicStyleSheet.replaceSync(dynamicCSS);
  }

  protected override firstUpdated() {
    // TODO: also need to updateSVGDataUrls on certain css changes
    //   (e.g., dark mode)
    this.updateSVGDataUrls();
  }

  protected override render() {
    return html`
      <wa-button-group>
        <wa-button
            appearance="filled outlined"
            ?disabled=${!this.puzzle?.canUndo}
            @pointerdown=${this.handleUndoRedoPointerDown}
            @click=${this.handleUndo}>
          <wa-icon name="undo" label="Undo"></wa-icon>
        </wa-button>
        ${this.renderHistoryButton()}
        <wa-button
            appearance="filled outlined"
            ?disabled=${!this.puzzle?.canRedo}
            @pointerdown=${this.handleUndoRedoPointerDown}
            @click=${this.handleRedo}>
          <wa-icon name="redo" label="Redo"></wa-icon>
        </wa-button>
      </wa-button-group>
    `;
  }

  private renderHistoryButton() {
    // TODO: keyboard nav doesn't work for history items wrapped in <ol>
    return html`
      <wa-dropdown 
          placement="top"
          @wa-select=${this.handleSelectCheckpoint}
      >
        <wa-button slot="trigger" appearance="filled outlined" with-caret>
          <wa-icon name="history" label="History"></wa-icon>
        </wa-button>

        <header>
          History
          <wa-button appearance="plain" @click=${this.handleHistoryCloseButton}>
            <wa-icon name="xmark" library="system" label="Close"></wa-icon>
          </wa-button>
        </header>
        
        <div id="list">${this.renderHistoryItems()}</div>

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
          icon: "history-checkpoint",
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
    icon?: string;
    canDelete?: boolean;
  }) {
    const isCurrentMove =
      move === this.puzzle?.currentMove && this.puzzle?.totalMoves > 0;
    const iconName = isCurrentMove ? "history-current-move" : (icon ?? nothing);
    const iconLabel = isCurrentMove ? "Current undo" : nothing;

    const deleteButton = canDelete
      ? html`
        <wa-button slot="details" appearance="plain" size="small"
          @click=${this.handleRemoveCheckpoint}
        >
          <wa-icon name="checkpoint-remove" label="Delete checkpoint"></wa-icon>
        </wa-button>`
      : nothing;

    // To simplify alignment, it's easier to render an empty <wa-icon name=nothing>
    // (vs. suppressing the wa-icon here and patch up layout in css).
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
          <wa-icon name="history-current-move"></wa-icon>
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

  private handleHistoryCloseButton() {
    const dropdown = this.dropdown;
    if (dropdown) {
      dropdown.open = false;
    }
  }

  private handleUndoRedoPointerDown(event: PointerEvent) {
    // If the dropdown is open, keep it open when clicking undo/redo buttons.
    // (Prevents the pointerdown event from reaching the dropdown's backdrop,
    // while allowing button click events to work normally.)
    if (event.isPrimary && this.dropdown?.open) {
      event.stopPropagation();
    }
  }

  private async handleUndo() {
    await this.puzzle?.undo();
  }

  private async handleRedo() {
    await this.puzzle?.redo();
  }

  private async handleSelectCheckpoint(event: CustomEvent<{ item: WaDropdownItem }>) {
    const value = event.detail.item.value;
    const checkpoint = Number.parseInt(value, 10);
    if (Number.isFinite(checkpoint)) {
      await this.puzzle?.goToCheckpoint(checkpoint);
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
      const move = Number.parseInt(value, 10);
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
      --timeline-color: var(--wa-color-neutral-border-normal);
      --background-color: var(--wa-color-surface-default);
      --dot-size: 5px;
    }
    
    wa-button-group {
      /* Collapse the gap between buttons, overlapping the borders.
       * Stack the dropdown trigger (which is never disabled) above
       * the other buttons to avoid partly-disabled border appearance. */
      &::part(base) {
        gap: 0;
      }
      wa-button[slot="trigger"]::part(base) {
        margin-inline: calc(-1 * var(--wa-border-width-s));
        position: relative;
        z-index: 1;
      }
    }
    
    header {
      display: flex;
      align-items: center;

      /* The plain "Close" button effectively pads top/bottom and part of right */
      /*padding: 0.5em 1em;*/
      padding-inline-start: 1em;
      padding-inline-end: 0.5em;
      background-color: var(--background-color);
      /*font-family: var(--wa-font-family-heading);*/
      font-weight: var(--wa-font-weight-semibold);
      position: sticky;
      inset-block-start: -0.25em; /* wa-dropdown::part(menu) padding */
      z-index: 1;
      
      wa-button {
        margin-inline-start: auto;
      }
    }
    
    small {
      color: var(--wa-color-text-quiet);
      font-size: var(--wa-font-size-smaller);
      font-style: italic;
    }
    
    #list {
      position: relative;

      &::before {
        display: block;
        content: "";
        position: absolute;
        inset: 0.75em calc(1.625em - 7px); /* padding + icon-width/2 = 1em + 1.25em/2 */

        border-image-source: var(--timeline-arrow-image);
        border-image-slice: 25% 0 25% 100%;
        border-width: 10px;
        border-style: solid;
        
        z-index: 1;
        pointer-events: none;
      }
      
      wa-icon {
        position: relative;
        z-index: 2; /* above the timeline */
        min-width: 1.25em; /* for empty icons */
      }
      
      wa-dropdown-item {
        /* dropdown-item's "isolate" prevents our wa-icon z-index from working */
        isolation: unset; 
      }
    }

    wa-icon[name="history-checkpoint"]::part(svg),
    wa-icon[name="history-current-move"]::part(svg)
    {
      /* Use background fill on icons that overlap the timeline */
      fill: var(--background-color) !important;
    }
    
    wa-dropdown-item wa-button {
      /* Counteract doubled padding around delete buttons */
      margin: -0.5em;
    }
    
    .undo-point {
      /* Mimic a wa-dropdown-item */
      box-sizing: border-box;
      padding: 0.5em 1em;
      line-height: var(--wa-line-height-condensed);

      display: flex;
      align-items: center;

      wa-icon {
        font-size: var(--wa-font-size-smaller);
        margin-inline-end: 0.75em;
      }
      span {
        display: block;
        color: var(--wa-color-text-quiet);
      }
    }

    .spacer {
      box-sizing: border-box;
      padding: 0 1em;
      line-height: 1;
      
      display: flex;
      align-items: center;

      small {
        padding: 0.25em;
      }

      &::before {
        display: block;
        content: "";
        height: 1.5em;
        width: 1px;
        font-size: var(--wa-font-size-smaller); /* match em calcs to slotted icon */
        margin-inline-start: calc(0.5em - 1px);
        margin-inline-end: calc(0.75em - 1px);
        
        border-image-source: var(--timeline-dot-image);
        border-image-slice: 0 0 0 100%;
        border-image-outset: 0 0.5px;
        border-image-repeat: round;
        border-inline-start: var(--dot-size) solid transparent;
        
        z-index: 2;
        pointer-events: none;
      }

      &[data-moves="1"] {
        /* Try to size it to a single border dot */
        padding-block: 0;
        height: var(--dot-size);
        &::before {
          max-height: var(--dot-size);
        }
      }
      &[data-moves="2"]::before {
        max-height: calc(2 * var(--dot-size));
      }
      &[data-moves="3"]::before {
        max-height: calc(3 * var(--dot-size));
      }
      &[data-moves="4"]::before {
        max-height: calc(4 * var(--dot-size));
      }
      /* This doesn't work yet:
      &[data-moves] {
        max-height: calc(attr(data-moves type(<number>)) * var(--dot-size));
      }
      */
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-history": PuzzleHistory;
  }
}
