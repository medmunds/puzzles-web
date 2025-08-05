import type WaDialog from "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import { when } from "lit/directives/when.js";
import { sleep } from "../utils/timing.ts";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

function randomItem<T>(array: ReadonlyArray<T>): T {
  return array[Math.floor(Math.random() * array.length)];
}

@customElement("puzzle-end-notification")
export class PuzzleEndNotification extends SignalWatcher(LitElement) {
  // TODO: consider reworking this component as completely custom rendered,
  //   rather than hacking up a wa-dialog. (Would simplify animations and css.)

  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  @query("wa-dialog")
  private dialog?: WaDialog;

  protected override render() {
    if (!this.puzzle || this.puzzle.status === "ongoing") {
      return;
    }

    let message: string;
    let icon: string | undefined;
    const actions = [
      html`
        <wa-button variant="brand" @click=${this.newGame}>
          <wa-icon slot="start" name="new-game"></wa-icon>
          New game
        </wa-button>
      `,
    ];

    switch (this.puzzle.status) {
      case "solved":
        message = randomItem(PuzzleEndNotification.solvedMessages);
        icon = randomItem(PuzzleEndNotification.solvedIcons);
        actions.push(html`<slot name="extra-actions-solved"></slot>`);
        break;

      case "solved-with-help":
        message = "What’s next?";
        actions.push(html`<slot name="extra-actions-solved"></slot>`);
        break;

      case "lost":
        message = randomItem(PuzzleEndNotification.lostMessages);
        icon = randomItem(PuzzleEndNotification.lostIcons);
        actions.push(...this.renderLostActions());
        actions.push(html`<slot name="extra-actions-lost"></slot>`);
        break;
    }

    actions.push(html`<slot name="extra-actions"></slot>`);

    return html`
      <wa-dialog light-dismiss
          class=${this.puzzle.status}
          @wa-after-hide=${this.handleAfterHide}
      >
        ${when(icon, () => html`<wa-icon slot="label" name=${icon}></wa-icon>`)}
        <div slot="label">${message}</div>
        <div slot="footer">${actions}</div>
      </wa-dialog>
    `;
  }

  private renderLostActions() {
    const actions = [
      html`
        <wa-button @click=${this.restartGame}>
          <wa-icon slot="start" name="restart-game"></wa-icon>
          Restart
        </wa-button>
      `,
    ];
    if (this.puzzle?.canUndo) {
      actions.push(html`
        <wa-button @click=${this.undo}>
          <wa-icon slot="start" name="undo"></wa-icon>
          Undo
        </wa-button>
      `);
    }
    if (this.puzzle?.canSolve) {
      // TODO: && !usedSolveButton
      actions.push(html`
        <wa-button @click=${this.showSolution}>
          <wa-icon slot="start" name="show-solution"></wa-icon>
          Show solution
        </wa-button>
      `);
    }
    return actions;
  }

  protected override async updated() {
    // Run the wa-dialog's "show" animation after it's in the DOM.
    // (Including the "open" attribute at render time skips the animation.)
    if (this.dialog) {
      // Wait for any game animations/flashes to finish before showing dialog
      await sleep(10); // ensure timer start notification arrives from worker
      await Promise.all([this.updateComplete, this.puzzle?.timerComplete]);
      this.dialog.open = true;
    }
  }

  private hidingPromise = Promise.resolve();
  private hidingPromiseResolve?: () => void;

  private handleAfterHide() {
    if (this.hidingPromiseResolve) {
      this.hidingPromiseResolve();
      this.hidingPromiseResolve = undefined;
    }
  }

  hide() {
    if (this.dialog?.open) {
      // Resolve old promise in case anyone awaiting it.
      this.handleAfterHide();

      this.dialog.open = false;
      this.hidingPromise = new Promise((resolve) => {
        this.hidingPromiseResolve = resolve;
      });
    }
    return this.hidingPromise;
  }

  private async newGame() {
    await this.hide();
    await this.puzzle?.newGame();
  }

  private async undo() {
    await this.hide();
    await this.puzzle?.undo();
  }

  private async restartGame() {
    await this.hide();
    await this.puzzle?.restartGame();
  }

  private async showSolution() {
    // Need to hide the alert first
    await this.hide();
    await this.puzzle?.solve();
  }

  static solvedIcons = [
    "solved-a",
    "solved-b",
    "solved-c",
    "solved-d",
    "solved-e",
    "solved-f",
    "solved-g",
  ] as const;

  static lostIcons = ["lost-a"] as const;

  static solvedMessages = [
    "Awesome!",
    "Brilliant!",
    "Clever!",
    "Complete!",
    "Genius!",
    "Good job!",
    "Nice work!",
    "Outstanding!",
    "Perfect!",
    "Solved!",
    "Splendid!",
    "Success!",
    "Superb!",
    "Victory!",
    "Way to go!",
    "Well done!",
    "Woo hoo!",
    "You got it!",
  ] as const;

  static lostMessages = [
    // "Better luck next time",
    // "No more moves",
    "Out of moves",
    // "Out of options",
  ] as const;

  // TODO: investigate whether we need the equivalent of `pointer-events: none`
  //   on wa-dialog's backdrop while the dialog is animating in. (iOS touch issue.)
  static styles = css`
    wa-dialog {
      --width: min(calc(100vw - 2 * var(--wa-space-l)), 35rem);
    }
    
    @media(prefers-reduced-motion: no-preference) {
      wa-dialog {
        --show-duration: 500ms;
        --hide-duration: 250ms;
        /* See enableCustomWaDialogAnimations in webawesomehacks.ts */
        --show-dialog-animation: zoom-in-up 500ms ease;
        --hide-dialog-animation: zoom-out-down 250ms ease;
      }
    }
    
    wa-dialog::part(title) {
      display: flex;
      align-items: center;
      gap: var(--wa-space-m);
    }
    wa-dialog::part(body) {
      display: none;
    }
    wa-dialog::part(footer) {
      margin-block-start: var(--wa-space-l);
      gap: var(--wa-space-m);
    }
    div[slot="footer"] {
      display: contents;
    }
    
    wa-dialog.solved wa-icon[slot="label"] {
      color: var(--wa-color-brand-fill-loud);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-end-notification": PuzzleEndNotification;
  }
}
