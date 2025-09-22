import { css, html } from "lit";
import { customElement, eventOptions, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { audioClick } from "../utils/audio.ts";
import {
  DOMMouseButton,
  hasCtrlKey,
  isAppleDevice,
  swapButtons,
} from "../utils/events.ts";
import { clamp } from "../utils/math.ts";
import { detectSecondaryButton } from "../utils/touch.ts";
import { PuzzleView } from "./puzzle-view.ts";
import { type Point, PuzzleButton } from "./types.ts";

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
  secondaryButtonHoldTime = 350;

  /**
   * Radius for detecting long presses and two-finger taps
   */
  @property({ type: Number })
  secondaryButtonDragThreshold = 8;

  /**
   * Volume 0-100 for audio feedback on detecting long press or two-finger tap.
   * Set to 0 to disable audio feedback.
   */
  @property({ type: Number })
  secondaryButtonAudioVolume = 40;

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener("keydown", this.handleKeyEvent);
  }

  override async disconnectedCallback() {
    await super.disconnectedCallback();
    this.removeEventListener("keydown", this.handleKeyEvent);
  }

  protected override renderPuzzle() {
    // Wrap the canvas with a div that handles pointer events and adds some
    // padding around it, so pointer events slightly outside the puzzle are
    // delivered to the puzzle. (Key events are handled on host to simplify
    // focus and tab order management in the container.)
    // The click and touchstart handlers are necessary only on iOS to disable
    // an intrusive magnifier bubble triggered by ordinary gameplay gestures.
    return html`
      <div part="puzzle"
        @contextmenu=${this.handleContextMenu}
        @pointerdown=${this.handlePointerDown}
        @pointermove=${this.handlePointerMove}
        @pointerup=${this.handlePointerUp}
        @pointercancel=${this.handlePointerCancel}
        @click=${when(isAppleDevice, () => this.handleClick)}
        @touchstart=${when(isAppleDevice, () => this.handleTouchStart)}
      >${this.renderCanvas()}</div>
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

  /**
   * Generate (audio) feedback for secondary button detection
   */
  protected secondaryButtonFeedback() {
    if (this.secondaryButtonAudioVolume > 0) {
      const volume = clamp(0, this.secondaryButtonAudioVolume, 100);
      void audioClick({ volume });
    }
  }

  //
  // Keyboard events
  //

  private handleKeyEvent = async (event: KeyboardEvent) => {
    if (!this.puzzle) {
      return;
    }
    let button: number | undefined;
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

    await this.puzzle.processKey(button | mods);
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

  private static buttonToButtons: Record<number, number> = {
    // MouseEvent.button number -> MouseEvent.buttons bit mask
    0: 1, // main (left) button
    1: 4, // auxiliary (middle) button
    2: 2, // secondary (right) button
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
    if (!event.isPrimary) {
      // Ignore multiple simultaneous touches (or pens).
      // (detectSecondaryButton() handles those on its own.)
      return;
    }
    if (event.buttons !== PuzzleViewInteractive.buttonToButtons[event.button]) {
      // Ignore simultaneous clicks on different buttons.
      return;
    }
    if (this.pointerTracking) {
      // PointerUp event for earlier tracking was somehow missed.
      // Start over with this PointerDown and let the midend sort it out.
      if (this.canvas?.hasPointerCapture(this.pointerTracking.pointerId)) {
        this.canvas.releasePointerCapture(this.pointerTracking.pointerId);
      }
      this.pointerTracking = undefined;
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
      holdTime: this.secondaryButtonHoldTime,
      dragThreshold: this.secondaryButtonDragThreshold,
    });
    if (isSecondary) {
      button = swapButtons(button);
      this.secondaryButtonFeedback();
    }

    const { press, drag, release } = PuzzleViewInteractive.domToPuzzleButtons[button];
    const consumed = await this.puzzle.processMouse(location, press);
    if (consumed) {
      this.pointerTracking = { drag, release, pointerId };
      try {
        this.canvas.setPointerCapture(pointerId);
      } catch (_error) {
        // The pointer is already up (pointerId is no longer active).
        // Probably a tap that's completed -- pointer capture isn't needed.
      }
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
      // pointerCapture is automatically released on pointerup.
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
      if (this.canvas?.hasPointerCapture(this.pointerTracking.pointerId)) {
        this.canvas.releasePointerCapture(this.pointerTracking.pointerId);
      }
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
    // Cancel contextmenu conditioned on whether puzzle wanted right button
    // at the particular location:
    //   if (this.pointerTracking?.pointerId === event.pointerId) ...
    // Unfortunately, async processMouseEvent in the worker means the
    // response arrives too late for handlePointerDown to set up the
    // pointerTracking object before handleContextMenu is called.
    //
    // TODO: Cancel contextmenu only if the puzzle wants the right button:
    //   if (this.puzzle?.needsRightButton) ...
    // Unfortunately, some puzzles (e.g., Tracks) say they don't *need*
    // the right button, even though they can *use* it.
    //
    // Cancel contextmenu unconditionally for all puzzles:
    event.preventDefault();
  }

  // Disable iOS Safari magnifier bubble popup: it gets mistakenly triggered
  // by several gestures that occur in ordinary gameplay. (And Apple does not
  // respect CSS touch-action or user-select for controlling this behavior.)
  //
  // We want to disable the popup but still allow pinch-zoom. That requires
  // preventDefault on two events:
  //   - click (disables bubble on long-press)
  //   - the _second_ touchstart in a double tap (disables bubble on double-tap-hold)
  // https://discourse.threejs.org/t/iphone-how-to-remove-text-selection-magnifier/47812/11
  //
  // (Using preventDefault unconditionally in touchstart alone--without click--would
  // be sufficient to block the bubble, but would also block pinch-zoom.)
  //
  // Because other browsers handle CSS touch-action properly, these handlers
  // are only installed on Apple devices.
  private handleClick(event: MouseEvent) {
    event.preventDefault();
  }

  private lastTouchStart = 0; // timestamp milliseconds
  private doubleTapTime = 750; // milliseconds

  @eventOptions({ passive: false })
  private handleTouchStart(event: MouseEvent) {
    const now = Date.now();
    if (now - this.lastTouchStart < this.doubleTapTime) {
      event.preventDefault();
    }
    this.lastTouchStart = now;
  }

  //
  // Styles
  //

  static styles = [
    ...PuzzleView.styles,
    css`
      :host(:focus-visible) {
        outline: none;
        & [part="content"] {
          outline: var(--wa-focus-ring);
          outline-offset: var(--wa-focus-ring-offset);
        }
      }

      [part="puzzle"], 
      [part="statusbar"] {
        /* Disable double-tap to zoom (puzzles want rapid taps) 
         * and single-finger panning (puzzles want dragging).
         * Allow zooming and multi-finger panning for accessibility.
         * (Insufficient on iOS Safari; see @click and @touchstart handlers.) 
         */
        touch-action: pinch-zoom;

        /* Disable long-press selection/magnifier bubble on iOS Safari.
         * If Safari gets a long-press on something that's not selectable
         * (like the puzzle), it looks for something--anything--nearby
         * to select instead (like the statusbar). A bubble on the statusbar
         * when you long-press the puzzle is annoying, so disable on both.
         */
        -webkit-user-select: none;
        -moz-user-select: none;
        user-select: none;
        cursor: default;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-view-interactive": PuzzleViewInteractive;
  }
}
