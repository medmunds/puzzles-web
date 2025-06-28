import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import { zoomInUp, zoomOutDown } from "@shoelace-style/animations";
import type SlDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import { setAnimation } from "@shoelace-style/shoelace/dist/utilities/animation-registry.js";
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import { when } from "lit/directives/when.js";
import { sleep } from "../utils/timing.ts";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

// Register components
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";

function randomItem<T>(array: ReadonlyArray<T>): T {
  return array[Math.floor(Math.random() * array.length)];
}

@customElement("puzzle-end-notification")
export class PuzzleEndNotification extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  @query("sl-dialog")
  private dialog?: SlDialog;

  protected override render() {
    if (!this.puzzle || this.puzzle.status === "ongoing") {
      return;
    }

    let message: string;
    let icon: string | undefined;
    const actions = [
      html`
        <sl-button variant="primary" @click=${this.newGame}>
          <sl-icon slot="prefix" name="new-game"></sl-icon>
          New game
        </sl-button>
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
      <sl-dialog class=${this.puzzle.status}>
        ${when(icon, () => html`<sl-icon slot="label" name=${icon}></sl-icon>`)}
        <div slot="label">${message}</div>
        <div slot="footer">${actions}</div>
      </sl-dialog>
    `;
  }

  private renderLostActions() {
    const actions = [
      html`
        <sl-button @click=${this.restartGame}>
          <sl-icon slot="prefix" name="restart-game"></sl-icon>
          Restart
        </sl-button>
      `,
    ];
    if (this.puzzle?.canUndo) {
      actions.push(html`
        <sl-button @click=${this.undo}>
          <sl-icon slot="prefix" name="undo"></sl-icon>
          Undo
        </sl-button>
      `);
    }
    if (this.puzzle?.canSolve) {
      // TODO: && !usedSolveButton
      actions.push(html`
        <sl-button @click=${this.showSolution}>
          <sl-icon slot="prefix" name="show-solution"></sl-icon>
          Show solution
        </sl-button>
      `);
    }
    return actions;
  }

  protected override async updated() {
    // Run the sl-dialog's "show" animation after it's in the DOM.
    // (Including the "open" attribute at render time skips the animation.)
    if (this.dialog) {
      // Use different animations, just for this sl-alert
      for (const [name, animation] of Object.entries(
        PuzzleEndNotification.animations,
      )) {
        setAnimation(this.dialog, name, animation);
      }
      // Wait for any game animations/flashes to finish before showing dialog
      await sleep(10); // ensure timer start notification arrives from worker
      await Promise.all([this.updateComplete, this.puzzle?.timerComplete]);
      await this.dialog.show();
    }
  }

  hide(): Promise<void> {
    return this.dialog?.hide() ?? Promise.resolve();
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

  static animations = {
    "dialog.show": {
      keyframes: zoomInUp,
      options: {
        duration: 500,
      },
    },
    "dialog.hide": {
      keyframes: zoomOutDown,
      options: {
        duration: 250,
      },
    },
  } as const;

  static styles = css`
    sl-dialog::part(title) {
      display: flex;
      align-items: center;
      gap: var(--sl-spacing-medium);
    }
    sl-dialog::part(body) {
      display: none;
    }
    sl-dialog::part(footer) {
      padding-block-start: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-spacing-medium);
    }
    div[slot="footer"] {
      display: contents;
    }
    
    sl-dialog.solved sl-icon[slot="label"] {
      color: var(--sl-color-primary-600);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-end-notification": PuzzleEndNotification;
  }
}
