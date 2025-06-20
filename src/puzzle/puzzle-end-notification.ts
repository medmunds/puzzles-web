import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import { zoomInUp, zoomOutDown } from "@shoelace-style/animations";
import type SlAlert from "@shoelace-style/shoelace/dist/components/alert/alert.js";
import { setAnimation } from "@shoelace-style/shoelace/dist/utilities/animation-registry.js";
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

// Register components
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import { query } from "lit/decorators/query.js";

function randomItem<T>(array: ReadonlyArray<T>): T {
  return array[Math.floor(Math.random() * array.length)];
}

@customElement("puzzle-end-notification")
export class PuzzleEndNotification extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  @query("sl-alert")
  private alert?: SlAlert;

  override render() {
    if (!this.puzzle?.isSolved && !this.puzzle?.isLost) {
      return;
    }
    const solved = !this.puzzle.isLost;
    const variant = solved ? "success" : "neutral";
    // TODO: don't show a solvedMessage or solvedIcon if player used the "Solve" command
    const message = solved
      ? randomItem(PuzzleEndNotification.solvedMessages)
      : randomItem(PuzzleEndNotification.lostMessages);
    const icon = solved
      ? randomItem(PuzzleEndNotification.solvedIcons)
      : randomItem(PuzzleEndNotification.lostIcons);

    const actions = [
      html`
        <sl-button variant="neutral" @click=${this.newGame}>
          <sl-icon slot="prefix" name="plus"></sl-icon>
          New game
        </sl-button>
      `,
    ];
    if (this.puzzle.isLost) {
      actions.push(html`
        <sl-button @click=${this.restartGame}>
          <sl-icon slot="prefix" name="iteration-cw"></sl-icon>
          Restart
        </sl-button>
      `);
      if (this.puzzle.canUndo) {
        actions.push(html`
          <sl-button @click=${this.undo}>
            <sl-icon slot="prefix" name="undo-2"></sl-icon>
            Undo
          </sl-button>
        `);
      }
      if (this.puzzle.canSolve) {
        // TODO: && !usedSolveButton
        actions.push(html`
          <sl-button @click=${this.showSolution}>
            <sl-icon slot="prefix" name="sparkles"></sl-icon>
            Show solution
          </sl-button>
        `);
      }
      actions.push(html`<slot name="extra-actions-lost"></slot>`);
    } else {
      actions.push(html`<slot name="extra-actions-solved"></slot>`);
    }
    actions.push(html`<slot name="extra-actions"></slot>`);

    return html`
      <sl-alert variant=${variant} closable>
        <sl-icon slot="icon" name=${icon}></sl-icon>
        <div class="message">${message}</div>
        <div class="actions">${actions}</div>
      </sl-alert>
    `;
  }

  override async updated() {
    // Run the sl-alert's "show" animation after it's in the DOM.
    // (Including the "open" attribute at render time skips the animation.)
    if (this.alert) {
      // Use different animations, just for this sl-alert
      for (const [name, animation] of Object.entries(
        PuzzleEndNotification.animations,
      )) {
        setAnimation(this.alert, name, animation);
      }
      await Promise.all([this.updateComplete, this.puzzle?.timerComplete]);
      await this.alert.show();
    }
  }

  hide(): Promise<void> {
    return this.alert?.hide() ?? Promise.resolve();
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
    "award",
    "crown",
    "gem",
    "laugh",
    "party-popper",
    "rocket",
    "thumbs-up",
  ] as const;

  static lostIcons = ["frown"] as const;

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
    "Better luck next time.",
    "Hmm… that looks like the end.",
    "I think you’re out of options.",
    "Looks like a dead end.",
    "Seems like there’s no way forward.",
    "That might be as far as you can go.",
    "That’s about the end of it.",
  ] as const;

  static animations = {
    "alert.show": {
      keyframes: zoomInUp,
      options: {
        duration: 500,
      },
    },
    "alert.hide": {
      keyframes: zoomOutDown,
      options: {
        duration: 250,
      },
    },
  } as const;

  static styles = css`
    :host {
      max-width: 100%;
    }
    
    .message {
      margin-bottom: var(--sl-spacing-large);
      font-size: var(--sl-font-size-medium);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-spacing-medium);
    }
    
    sl-alert::part(base) {
      align-items: flex-start;
      box-shadow: var(--sl-shadow-medium);
    }
    sl-alert::part(icon) {
      margin-top: var(--sl-spacing-large);
    }
    sl-alert::part(message) {
      
    }
    sl-alert::part(close-button) {
      align-self: flex-start;
      margin-top: var(--sl-spacing-medium);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-end-notification": PuzzleEndNotification;
  }
}
