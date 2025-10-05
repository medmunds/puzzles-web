import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import { animateWithClass } from "../utils/animation.ts";
import { cssWATweaks } from "../utils/css.ts";
import { sleep } from "../utils/timing.ts";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

function hash(s: string): number {
  // Simple but effective hash based on Java's String.hashCode()
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) & 0xffffffff;
  }
  return hash;
}

function pick<T>(array: ReadonlyArray<T>, index: number): T {
  return array[Math.abs(index) % array.length];
}

@customElement("puzzle-end-notification")
export class PuzzleEndNotification extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  @property({ type: Boolean, reflect: true })
  get open(): boolean {
    return this.dialog?.open ?? false;
  }
  set open(value: boolean) {
    if (value) {
      void this.show();
    } else {
      void this.hide();
    }
  }

  // Whether the dialog should be open, ignoring running animations.
  // (So false while the hide animation is running, unlike this.open.)
  private wantsOpen = false;

  @query("dialog")
  private dialog?: HTMLDialogElement;

  protected override render() {
    if (!this.puzzle || this.puzzle.status === "ongoing") {
      return;
    }

    // Use game id to select a "random" but fixed message/icon
    // (so the same game generates the same message on repeated solves).
    const hashCode = hash(
      this.puzzle.randomSeed ?? this.puzzle.currentGameId ?? "unknown",
    );
    let message: string;
    let icon: string | undefined;
    const actions = [
      html`
        <wa-button autofocus variant="brand" @click=${this.newGame}>
          <wa-icon slot="start" name="new-game"></wa-icon>
          New game
        </wa-button>
      `,
    ];

    switch (this.puzzle.status) {
      case "solved":
        message = pick(PuzzleEndNotification.solvedMessages, hashCode);
        icon = pick(PuzzleEndNotification.solvedIcons, hashCode);
        actions.push(html`<slot name="extra-actions-solved"></slot>`);
        break;

      case "solved-with-help":
        message = "What’s next?";
        actions.push(html`<slot name="extra-actions-solved"></slot>`);
        break;

      case "lost":
        message = pick(PuzzleEndNotification.lostMessages, hashCode);
        icon = pick(PuzzleEndNotification.lostIcons, hashCode);
        actions.push(...this.renderLostActions());
        actions.push(html`<slot name="extra-actions-lost"></slot>`);
        break;
    }

    actions.push(html`<slot name="extra-actions"></slot>`);

    // TODO: Move puzzle.status from class to custom element state? (CustomStateSet)
    return html`
      <dialog
          part="dialog"
          class=${this.puzzle.status}
          aria-labelledby="message"
          @cancel=${this.handleDialogCancel}
          @click=${this.handleDialogClick}
      >
        <div part="header">
          ${icon ? html`<wa-icon part="icon" name=${icon}></wa-icon>` : nothing}
          <div part="message" id="message">${message}</div>
          <wa-button part="dismiss" appearance="plain" @click=${this.handleDismissClick}>
            <wa-icon library="system" name="xmark" variant="solid" label="Close"></wa-icon>
          </wa-button>
        </div>
        <div part="footer">
          <div part="actions">${actions}</div>
        </div>
      </dialog>
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
    // Wait for any game animations/flashes to finish before showing dialog
    await sleep(10); // ensure timer start notification arrives from worker
    await Promise.all([this.updateComplete, this.puzzle?.timerComplete]);
    if (this.isConnected && this.dialog && !this.wantsOpen) {
      await this.show();
    }
  }

  private async handleDialogCancel(event: Event) {
    // User pressed Esc key. We want to run our animation before closing.
    event.preventDefault();
    await this.hide();
  }

  private async handleDialogClick(event: MouseEvent) {
    // Could be click on backdrop pseudo-element, dialog proper,
    // or child of dialog. Dismiss only on backdrop clicks.
    if (event.target === this.dialog) {
      const { clientX, clientY } = event;
      const { top, bottom, left, right } = this.dialog.getBoundingClientRect();
      const inClientRect =
        clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
      if (!inClientRect) {
        await this.hide();
      }
    }
  }

  private async handleDismissClick() {
    await this.hide();
  }

  async show() {
    if (this.dialog && !this.wantsOpen) {
      this.wantsOpen = true;
      this.dialog.showModal();
      const autofocus = this.dialog.querySelector("[autofocus]");
      if (autofocus instanceof HTMLElement && typeof autofocus.focus === "function") {
        autofocus.focus();
      }
      return animateWithClass(this.dialog, "show");
    }
  }

  async hide() {
    if (this.dialog?.open && this.wantsOpen) {
      this.wantsOpen = false;
      await animateWithClass(this.dialog, "hide");
      if (!this.wantsOpen) {
        this.dialog?.close();
      }
    }
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

  static styles = [
    cssWATweaks,
    css`
      :host {
        display: contents;

        --width: min(calc(100vw - 2 * var(--wa-space-l)), 25rem);
        --padding: var(--wa-space-l);
        --show-duration: 200ms;
        --hide-duration: 200ms;
        --opacity: 1; /* Overrides dialog and backdrop, e.g., for stacking dialogs */
      }
      
      * {
        box-sizing: border-box;
      }
      
      dialog:focus:not(:focus-visible) {
        outline: none;
      }
      dialog:focus-visible {
        /* Inset the focus ring so it doesn't compete with the backdrop shadow */
        outline: var(--wa-focus-ring);
        outline-offset: calc(-1 * (var(--wa-focus-ring-offset) + var(--wa-focus-ring-width)));
      }
      
      dialog[open] {
        display: flex;
        flex-direction: column;
        inline-size: var(--width);
        max-inline-size: calc(100% - var(--wa-space-2xl));
        max-block-size: calc(100% - var(--wa-space-2xl));

        /* Ensure there's enough vertical padding for phones 
         * with non-updating vh (e.g. iOS Safari) */
        @media screen and (max-width: 420px) {
          max-block-size: min(80vh, calc(100% - var(--wa-space-2xl)));
          max-block-size: min(80dvh, calc(100% - var(--wa-space-2xl)));
        }
        
        background-color: var(--wa-color-surface-raised);
        border-radius: var(--wa-panel-border-radius);
        border: none;
        box-shadow: var(--wa-shadow-l);
        margin: auto;

        padding: var(--padding);
        gap: var(--padding);
      }
      
      dialog[open]::backdrop {
        /* (Fallback rgb() is technically unnecessary here as of Safari 17.4.) */
        background-color: var(--wa-color-overlay-modal, rgb(0 0 0 / 0.25));
      }
      
      dialog[open], dialog[open]::backdrop {
        opacity: var(--opacity);
        transition: opacity var(--wa-transition-normal) var(--wa-transition-easing);
      }
      
      [part~="header"] {
        display: flex;
        align-items: center;
        gap: var(--wa-space-m);
      }
      [part~="icon"] {
        font-size: var(--wa-font-size-l);
        
        dialog.solved & {
          color: var(--wa-color-brand-fill-loud);
        }
      }
      [part~="message"] {
        flex: 1 1 auto;
        font-size: var(--wa-font-size-l);
        font-weight: var(--wa-font-weight-semibold);
        line-height: var(--wa-line-height-condensed);
      }
      [part~="dismiss"] {
        margin: calc(-1 * var(--wa-space-xs));
        &::part(base) {
          padding: var(--wa-space-xs);
          height: auto;
          width: auto;
        }
      }
      [part~="footer"] {
        /* Stretch to full available width */
        display: flex;
        align-items: center;
        justify-content: center;
      }
      [part~="actions"] {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        justify-content: center;
        align-items: center;
        gap: var(--wa-space-s);
        
        inline-size: fit-content;

        /* Single, non-stretched column when narrow */
        container-type: inline-size;
        @container (max-inline-size: 26em) {
          grid-template-columns: auto;
        }
      }
      
      wa-button::part(label) {
        /* Align action button icons at left.
         * No way to target ::slotted(wa-button)::part(label),
         * so this must be repeated in the parent for slotted buttons. */
        flex: 1 1 auto;
        text-align: center;
      }

      dialog.show {
        animation: fade-in var(--show-duration) ease forwards;
        &::backdrop {
          animation: fade-in var(--show-duration) ease forwards;
        }
      }
      dialog.hide {
        animation: fade-in var(--hide-duration) ease reverse forwards;
        &::backdrop {
          animation: fade-in var(--hide-duration) ease reverse forwards;
        }
      }

      @media (prefers-reduced-motion: no-preference) {
        /* Longer, flashier animation on the dialog itself */
        dialog.show {
          animation: zoom-in-down 500ms forwards;
        }
        dialog.hide {
          animation: zoom-out-up 250ms forwards;
        }
      }
      
      @keyframes fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes zoom-in-down {
        /* animate.css zoomInDown, adjusted to use vh */
        from {
          opacity: 0;
          transform: scale3d(0.1, 0.1, 0.1) translate3d(0, -300vh, 0);
          animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19);
        }

        60% {
          opacity: 1;
          transform: scale3d(0.475, 0.475, 0.475) translate3d(0, 60px, 0);
          animation-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1);
        }
      }
      @keyframes zoom-out-up {
        /* animate.css zoomOutUp, adjusted to use vh */
        40% {
          opacity: 1;
          transform: scale3d(0.475, 0.475, 0.475) translate3d(0, 60px, 0);
          animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19);
        }

        to {
          opacity: 0;
          transform: scale3d(0.1, 0.1, 0.1) translate3d(0, -200vh, 0);
          animation-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1);
        }
      }

    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-end-notification": PuzzleEndNotification;
  }
}
