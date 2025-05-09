import { ResizeController } from "@lit-labs/observers/resize-controller.js";
import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import { ColorSpace, OKLCH, to as convert, display, parse, sRGB } from "colorjs.io/fn";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import { coordsToColour, equalColour } from "../utils/colour.ts";
import { almostEqual } from "../utils/math.ts";
import { puzzleContext } from "./contexts.ts";
import { Drawing } from "./drawing.ts";
import type { Puzzle } from "./puzzle.ts";

ColorSpace.register(sRGB);
ColorSpace.register(OKLCH);

/**
 * The `<puzzle-view>` component renders a puzzle using the drawing API.
 * It must be used within a puzzle-context component.
 *
 * puzzle-view does not provided any input (mouse, keyboard, etc.) event
 * handling on the puzzle. (See `<puzzle-view-interactive>` for that.)
 */
@customElement("puzzle-view")
export class PuzzleView extends SignalWatcher(LitElement) {
  /**
   * If maximize is true, the puzzle will grow to fill the available space
   * in its container.
   */
  @property({ type: Boolean })
  maximize = false;

  /**
   * Whether to show the status bar.
   */
  @property({ type: Boolean })
  statusbar = true;

  @consume({ context: puzzleContext, subscribe: true })
  @state()
  protected puzzle?: Puzzle;

  // The drawing api instance
  protected drawing?: Drawing = undefined;

  @query("canvas", true)
  protected canvas?: HTMLCanvasElement;

  @query("[part=puzzle]", true)
  protected puzzleElement?: HTMLElement;

  constructor() {
    super();
    new ResizeController(this, {
      callback: () => this.resize(false),
    });
  }

  // We need to resize and redraw when this.puzzle.currentGameId changes
  // (e.g., after "new game"). Since @lit-labs/signals doesn't yet have
  // effects, simulate one by tracking the last rendered currentGameId.
  private renderedGameId?: string;

  protected async updated() {
    let needsResizeRedraw = false;

    // Initialize drawing when dependencies become available
    if (!this.drawing && this.canvas && this.puzzle) {
      this.drawing = new Drawing(this.canvas);
      this.puzzle.setDrawing(this.drawing);
      await this.updateColorPalette();
      needsResizeRedraw = true;
    }

    // Run effects on currentGameId change
    const currentGameId = this.puzzle?.currentGameId;
    if (currentGameId !== this.renderedGameId) {
      this.renderedGameId = currentGameId;
      needsResizeRedraw = true;
    }

    if (needsResizeRedraw) {
      await this.resize(false, true);
    }
  }

  render() {
    const result = [this.renderPuzzle()];
    if (this.statusbar && this.puzzle?.wantsStatusbar) {
      result.push(this.renderStatusbar());
    }
    return result;
  }

  renderPuzzle() {
    return html`<canvas part="puzzle"></canvas>`;
  }

  renderStatusbar() {
    return html`<div part="statusbar">${this.puzzle?.statusbarText}</div>`;
  }

  //
  // Public methods
  //

  async resize(isUserSize = true, forceRedraw = false): Promise<void> {
    if (
      !this.hasUpdated ||
      !this.canvas ||
      !this.puzzleElement ||
      !this.puzzle?.currentGameId
    ) {
      // midend_size() is only valid while there's a game.
      // (We'll get called again when that's true.)
      // (We can end up in here before the first update thanks to resize observers.)
      return;
    }

    let redraw = forceRedraw;

    const current = this.canvas.getBoundingClientRect();

    const classes = ["resizing"];
    if (!isUserSize && this.maximize) {
      // Make the canvas full page size, and getBoundingClientRect() should
      // tell us the maximum size we're able to grow within our container.
      classes.push("maximize");
    }
    this.puzzleElement.classList.add(...classes);
    const available = this.canvas.getBoundingClientRect();
    this.puzzleElement.classList.remove(...classes);

    const dpr = window.devicePixelRatio ?? 1;
    // TODO: unclear if we should pass dpr to midend as 1 or actual dpr
    //   (since we use css pixels and scale to dpr in the drawing context)
    const size = await this.puzzle.size(
      { w: available.width, h: available.height },
      isUserSize || this.maximize,
      1,
    );

    if (size.w !== current.width || size.h !== current.height) {
      // console.log(
      //   `Resize: current ${current.width}x${current.height},` +
      //     ` available ${available.width}x${available.height},` +
      //     ` used ${size.w}x${size.h}`,
      // );
      this.canvas.style.width = `${size.w}px`;
      this.canvas.style.height = `${size.h}px`;
      this.drawing?.resize(size.w, size.h, dpr);
      redraw = true;
    }
    if (redraw) {
      await this.puzzle.redraw();
    }
  }

  //
  // Color palette
  //

  protected async updateColorPalette() {
    if (!this.puzzle || !this.drawing) {
      throw new Error("updateColorPalette called before puzzle and drawing ready");
    }

    // Get our (original) CSS background color, as RGB.
    this.style.backgroundColor = ""; // undo any earlier local style override
    const bgcolor = window.getComputedStyle(this).backgroundColor;
    const bgrgb = convert(parse(bgcolor), "srgb");

    // The puzzle will generate a palette from a default background color, but
    // it works in RGB space and the results can be ugly for non-gray backgrounds.
    // Instead, convert our bgcolor to a gray of equivalent lightness (working
    // in OKLCH space), and generate a desired puzzle palette based on that gray...
    const [bgl, bgc, bgh] = convert(bgrgb, "oklch").coords;
    const darkMode = bgl < 0.5;
    const bggray = convert(
      { space: "oklch", coords: [darkMode ? 1.0 - bgl : bgl, 0, 0] },
      "srgb",
    );
    const defaultBackgroundColour = coordsToColour(bggray.coords);
    const puzzlePalette = await this.puzzle.getColourPalette(defaultBackgroundColour);

    // ... then remap any grays (chroma 0) in the puzzle palette to corresponding
    // shades of our background color (still working in OKLCH space).
    const palette = puzzlePalette.map(({ r, g, b }) => {
      let [l, c, h] = convert({ space: "srgb", coords: [r, g, b] }, "oklch").coords;
      if (almostEqual(c, 0)) {
        c = bgc; // TODO: maybe don't tint pure white? l < 1.0 ? bgc : c;
        h = bgh;
      }
      if (darkMode) {
        // TODO: this tends to make things too dark; can we match bg contrast somehow?
        l = 1.0 - l;
      }
      // display() returns the best CSS <color> string this browser can handle.
      return display({ space: "oklch", coords: [l, c, h] });
    });

    // Pass the resulting palette to the drawing API.
    this.drawing.setPalette(palette);

    // Update our own CSS background color to match (for any padding area).
    let bgIndex = puzzlePalette.findIndex((colour) =>
      equalColour(colour, defaultBackgroundColour),
    );
    if (bgIndex < 0) {
      // The game altered our requested defaultBackgroundColour.
      // Assume that index 0 is the background. (Only Untangle doesn't use 0,
      // and it doesn't alter the requested background colour.)
      bgIndex = 0;
    }
    this.style.backgroundColor = palette[bgIndex];
  }

  //
  // Styles
  //

  static styles = [
    css`
      :host {
        /* Spacing between canvas and statusbar */
        --gap: var(--sl-spacing-small);

        max-width: 100%;
        max-height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--gap);

        /* Necessary for getDefaultColour to access computed backgroundColor */
        background-color: inherit;
      }

      canvas {
        display: block;

        /* Required for accurate sizing calculations */
        padding: 0 !important;
        border-width: 0 !important;
      }
      
      [part="puzzle"].resizing {
        /* Allow full flexing during resize calculations, but disable
         * otherwise to prevent vertical stretching */
        flex: 1 1 auto;
        min-height: 1px;

        /* Prevent growing into overflow during resizing calculations */
        &.maximize {
          max-width: 100%;
          max-height: 100%;
        }

        /* See how big canvas can get -- overrides canvas inline style.
         * The puzzle part either _is_ or _contains_ the canvas. */
        &.maximize:is(canvas), &.maximize canvas {
          width: 100vw !important;
          height: 100vh !important;
        }
      }

      [part="statusbar"] {
        /* Don't collapse when no content (e.g., Rectangles) */
        min-height: 1em;
        max-height: 1em;
        line-height: 1.0;
        text-wrap: nowrap;
        text-overflow: ellipsis;

        /* For puzzles with timers (e.g., Mines), variable width is distracting */
        font-variant-numeric: tabular-nums;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-view": PuzzleView;
  }
}
