import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { DOMMouseButton, hasCtrlKey, swapButtons } from "../utils/events.ts";
import { detectSecondaryButton } from "../utils/touch.ts";
import { type Point, PuzzleButton } from "./module.ts";
import { PuzzleView } from "./puzzle-view.ts";

/**
 * The `<puzzle-view-interactive>` component subclasses `<puzzle-view>`
 * to add handling for mouse and keyboard events directed at the puzzle.
 * (It does not provide any other UI for the game.)
 */
@customElement("puzzle-view-interactive")
export class PuzzleViewInteractive extends PuzzleView {
  /**
   * Whether to swap the primary and secondary pointer buttons.
   */
  @property({ type: Boolean })
  swapMouseButtons = false;

  /**
   * Whether to detect long-press as right button on touch devices
   */
  @property({ type: Boolean })
  longPress = true;

  /**
   * Whether to detect two-finger-tap as right button on touch devices
   */
  @property({ type: Boolean })
  twoFingerTap = true;

  /**
   * Timeout for detecting long presses and two-finger taps
   */
  @property({ type: Number })
  secondaryButtonTimeout = 350;

  /**
   * Radius for detecting long presses and two-finger taps
   */
  @property({ type: Number })
  secondaryButtonSlop = 8;

  /**
   * True if any touch gestures are enabled to emulate the right mouse button.
   */
  get secondaryButtonGestures(): boolean {
    return this.longPress || this.twoFingerTap;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.addEventListener("keydown", this.handleKeyEvent);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this.handleKeyEvent);
  }

  override renderPuzzle() {
    // Wrap the canvas with a div that handles pointer events and adds some
    // padding around it, so pointer events slightly outside the puzzle are
    // delivered to the puzzle. (Key events are handled on host to simplify
    // focus and tab order management in the container.)
    return html`
      <div part="puzzle"
        @contextmenu=${this.handleContextMenu}
        @pointerdown=${this.handlePointerDown}
        @pointermove=${this.handlePointerMove}
        @pointerup=${this.handlePointerUp}
        @pointercancel=${this.handlePointerCancel}
        @click=${this.handleClick}
      ><canvas></canvas></div>
    `;
  }

  private getPuzzleLocation(event: MouseEvent): Point {
    // Get canvas-relative coordinates for a mouse event.
    // (Puzzle runs in standard pixels--devicePixelRatio is not relevant here.)
    if (!this.canvas) {
      throw new Error("getPuzzleLocation called before render (?!)");
    }
    const canvasRect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top,
    };
  }

  //
  // Keyboard events
  //

  private handleKeyEvent = async (event: KeyboardEvent) => {
    if (!this.puzzle) {
      return;
    }
    let button: number | undefined = undefined;
    switch (event.key) {
      case "ArrowDown":
        button = PuzzleButton.CURSOR_DOWN;
        break;
      case "ArrowUp":
        button = PuzzleButton.CURSOR_UP;
        break;
      case "ArrowLeft":
        button = PuzzleButton.CURSOR_LEFT;
        break;
      case "ArrowRight":
        button = PuzzleButton.CURSOR_RIGHT;
        break;
      case "Accept":
      case "CrSel":
      case "Enter":
      case "Select":
        button = PuzzleButton.CURSOR_SELECT;
        break;
      case " ":
        button = PuzzleButton.CURSOR_SELECT2;
        break;
      case "Backspace":
      case "Clear":
      case "Delete":
        button = 127;
        break;
      case "Tab":
        // TODO: Untangle wants tab, but intercepting would create a tab-order trap
        return;
      case "Escape":
        if (this.pointerTracking) {
          event.preventDefault();
          await this.cancelPointerTracking();
        }
        return;
      // TODO: map "Cut", "Copy", "Paste", "Undo", "Redo" to special buttons
      default:
        // Convert ASCII (puzzle isn't interested in any other keys)
        if (event.key.length === 1) {
          button = event.key.charCodeAt(0);
          if (button > 127) {
            return; // not ASCII
          }
        }
        break;
    }
    if (button === undefined) {
      return;
    }

    let mods = 0;
    if (event.shiftKey) {
      mods |= PuzzleButton.MOD_SHFT;
    }
    if (hasCtrlKey(event)) {
      mods |= PuzzleButton.MOD_CTRL;
    }
    if (
      event instanceof KeyboardEvent &&
      event.location === 3 /* DOM_KEY_LOCATION_NUMPAD */
    ) {
      mods |= PuzzleButton.MOD_NUM_KEYPAD;
    }

    const consumed = await this.puzzle.processKey(button | mods);
    if (consumed) {
      // TODO: this is too late to preventDefault
      event.preventDefault();
    }
  };

  //
  // Pointer (mouse, touch) events
  //

  private static domToPuzzleButtons: Record<
    DOMMouseButton,
    {
      press: PuzzleButton;
      drag: PuzzleButton;
      release: PuzzleButton;
    }
  > = {
    [DOMMouseButton.Auxiliary]: {
      press: PuzzleButton.MIDDLE_BUTTON,
      drag: PuzzleButton.MIDDLE_DRAG,
      release: PuzzleButton.MIDDLE_RELEASE,
    },
    [DOMMouseButton.Secondary]: {
      press: PuzzleButton.RIGHT_BUTTON,
      drag: PuzzleButton.RIGHT_DRAG,
      release: PuzzleButton.RIGHT_RELEASE,
    },
    [DOMMouseButton.Main]: {
      press: PuzzleButton.LEFT_BUTTON,
      drag: PuzzleButton.LEFT_DRAG,
      release: PuzzleButton.LEFT_RELEASE,
    },
  } as const;

  private pointerTracking?: {
    readonly pointerId: PointerEvent["pointerId"];
    readonly drag: PuzzleButton;
    readonly release: PuzzleButton;
  };

  private async handlePointerDown(event: PointerEvent) {
    if (!this.puzzle || !this.canvas) {
      return;
    }
    if (this.pointerTracking) {
      // Ignore simultaneous presses
      return;
    }

    const location = this.getPuzzleLocation(event);
    const pointerId = event.pointerId;

    let button: DOMMouseButton =
      event.button >= DOMMouseButton.Main && event.button <= DOMMouseButton.Secondary
        ? event.button
        : DOMMouseButton.Main; // Treat extra buttons as main

    // Handle Ctrl and Shift like emcclib.js, where they remap physical buttons.
    if (hasCtrlKey(event)) {
      button = swapButtons(button);
    } else if (event.shiftKey) {
      button = DOMMouseButton.Auxiliary;
    }
    if (this.swapMouseButtons) {
      button = swapButtons(button);
    }

    // event may be mutated after this await
    const { isSecondary, unhandledEvent } = await detectSecondaryButton(event, {
      longPress: this.longPress,
      twoFingerTap: this.twoFingerTap,
      timeout: this.secondaryButtonTimeout,
      dragThreshold: this.secondaryButtonSlop,
    });
    if (isSecondary) {
      button = swapButtons(button);
      // TODO: audio/haptic feedback for emulated secondary button
    }

    const { press, drag, release } = PuzzleViewInteractive.domToPuzzleButtons[button];
    const consumed = await this.puzzle.processMouse(location, press);
    if (consumed) {
      // Defer stateChanged until pointerup.
      this.pointerTracking = { drag, release, pointerId };
      this.canvas.setPointerCapture(pointerId);
      // Don't preventDefault (breaks focus management).
    } else {
      // Puzzle doesn't want this mouse button, so don't bother tracking.
      // But the midend requires a release event for every press.
      await this.puzzle.processMouse(location, release);
    }

    if (consumed && unhandledEvent?.pointerId === pointerId) {
      const handler: Record<string, (e: PointerEvent) => void> = {
        pointermove: this.handlePointerMove,
        pointerup: this.handlePointerUp,
        pointercancel: this.handlePointerCancel,
      } as const;
      handler[unhandledEvent.type]?.call(this, unhandledEvent);
    }
  }

  private async handlePointerMove(event: PointerEvent) {
    if (this.pointerTracking?.pointerId === event.pointerId) {
      await this.puzzle?.processMouse(
        this.getPuzzleLocation(event),
        this.pointerTracking.drag,
      );
    }
  }

  private async handlePointerUp(event: PointerEvent) {
    if (this.pointerTracking?.pointerId === event.pointerId) {
      await this.puzzle?.processMouse(
        this.getPuzzleLocation(event),
        this.pointerTracking.release,
      );
      this.pointerTracking = undefined;
    }
  }

  private async handlePointerCancel(event: PointerEvent) {
    if (this.pointerTracking?.pointerId === event.pointerId) {
      await this.cancelPointerTracking();
    }
  }

  private async cancelPointerTracking() {
    // There's no specific way to tell the midend to cancel an in-progress
    // click or drag, but many puzzles treat dragging outside the drawing area
    // as "cancel."
    if (this.pointerTracking) {
      if (this.puzzle) {
        const location = { x: -100, y: -100 };
        await this.puzzle.processMouse(location, this.pointerTracking.drag);
        await this.puzzle.processMouse(location, this.pointerTracking.release);
      }
      this.canvas?.releasePointerCapture(this.pointerTracking.pointerId);
      this.pointerTracking = undefined;
    }
  }

  // Context menus: When a user right-clicks, the browser will delay pointer
  // events until the button is released:
  // - If the mouse didn't move between press and release, the browser will send
  //   in rapid succession pointerdown, then contextmenu, and then (only if
  //   preventDefault() was called on contextmenu) pointerup.
  // - If the mouse _did_ move, the browser won't deliver any events at all.
  // No pointermove events are sent for the right button, and there isn't
  // any way to track right-click dragging in a browser.
  private handleContextMenu(event: PointerEvent) {
    if (this.pointerTracking?.pointerId === event.pointerId) {
      // Puzzle consumed the pointerdown event,
      // so it needs the pointerup, and we don't want a menu.
      event.preventDefault();
    }
    // Else the puzzle didn't consume pointerdown or the user pressed
    // the context-menu key, so we should allow the menu.
  }

  private handleClick(event: MouseEvent) {
    // This is necessary to prevent double-tap-zoom on iOS Safari.
    // (The CSS `touch-action: ...` in insufficient for Safari.)
    event.preventDefault();
  }

  //
  // Styles
  //

  static styles = [
    ...PuzzleView.styles,
    css`
      :host {
        /* Padding around canvas (and below status bar) */
        --padding: var(--gap);
        
        gap: calc( max( 0, var(--gap) - var(--padding) ));
      }
      
      :host(:focus-visible) {
        outline: var(--sl-focus-ring);
        outline-offset: var(--sl-focus-ring-offset);
      }

      [part="puzzle"] {
        padding: var(--padding);
        
        /* Disable double-tap to zoom (puzzles want rapid taps) 
         * and single-finger panning (puzzles want dragging).
         * Allow zooming and multi-finger panning for accessibility.
         * (Insufficient on iOS Safari; see @click handler.) 
         */
        touch-action: pinch-zoom;

        /* Disable long-press selection/magnifier bubble on iOS Safari */
        -webkit-user-select: none;
        -moz-user-select: none;
        user-select: none;
      }
      canvas {
        max-width: 100%;
        max-height: 100%;
      }
      
      [part="statusbar"] {
        margin-block-end: var(--padding);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-view-interactive": PuzzleViewInteractive;
  }
}
