import { consume } from "@lit/context";
import { ResizeController } from "@lit-labs/observers/resize-controller.js";
import { SignalWatcher } from "@lit-labs/signals";
import { ColorSpace, to as convert, display, OKLCH, parse, sRGB } from "colorjs.io/fn";
import { css, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { coordsToColour, equalColour } from "../utils/colour.ts";
import { isSafari } from "../utils/events.ts";
import { almostEqual } from "../utils/math.ts";
import { throttle } from "../utils/timing.ts";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";
import type { FontInfo, Size } from "./types.ts";

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

  /**
   * An additional element whose size can affect the puzzle-view.
   * Added to the ResizeObserver the puzzle-view uses to compute canvas size.
   */
  @property({ type: Element })
  resizeElement?: Element;

  @consume({ context: puzzleContext, subscribe: true })
  @state()
  protected puzzle?: Puzzle;

  @state()
  protected renderedPuzzleGameId?: string;

  @state()
  protected renderedPuzzleParams?: string;

  @state()
  protected canvasDpr = window.devicePixelRatio ?? 1;

  @state()
  protected canvasSize: Size = { w: 150, h: 150 };

  @query("canvas", true)
  protected canvas?: HTMLCanvasElement;

  @query("#canvasWrap", true)
  protected canvasWrap?: HTMLDivElement;

  @query("[part=puzzle]", true)
  protected puzzlePart?: HTMLElement;

  protected resizeController = new ResizeController(this, {
    callback: throttle(() => this.resize(false), 10),
  });

  private isAttachedToPuzzle = false;
  private isAttachingToPuzzle = false;

  protected override willUpdate(changedProperties: Map<string, unknown>) {
    // Since lit signals doesn't yet support effects on reactive properties, copy the
    // puzzle's reactive currentGameId and currentParams into local reactive state.
    // If they have changed, this will cause "effects" via updated().
    this.renderedPuzzleGameId = this.puzzle?.currentGameId;
    this.renderedPuzzleParams = this.puzzle?.currentParams;

    if (changedProperties.has("resizeElement")) {
      // Altering ResizeController's observables will requestUpdate().
      // Apply changes in willUpdate() to avoid triggering a second update
      // on initial render (Lit change-in-update warning).
      const oldValue = changedProperties.get("resizeElement") as Element | undefined;
      if (oldValue) {
        this.resizeController.unobserve(oldValue);
      }
      if (this.resizeElement) {
        this.resizeController.observe(this.resizeElement);
      }
    }
  }

  protected override async updated(changedProperties: Map<string, unknown>) {
    // Initialize drawing when dependencies become available
    if (
      !this.isAttachedToPuzzle &&
      !this.isAttachingToPuzzle &&
      this.canvas &&
      this.puzzle
    ) {
      this.isAttachingToPuzzle = true;
      const computedStyle = window.getComputedStyle(this.canvas);
      const fontInfo: FontInfo = {
        "font-family": computedStyle.fontFamily,
        "font-weight": computedStyle.fontWeight,
        "font-style": computedStyle.fontStyle,
      };
      const offscreenCanvas = this.canvas.transferControlToOffscreen();
      await this.puzzle.attachCanvas(offscreenCanvas, fontInfo);
      this.isAttachedToPuzzle = true;
      this.isAttachingToPuzzle = false;

      await this.updateColorPalette();
      // Recalculate canvas size for newly-attached puzzle. If somehow the current
      // size was already correct, we need to redraw immediately; else redraw when
      // the canvasSize change comes through.
      if (this.puzzle.currentGameId && !(await this.resize(false))) {
        await this.puzzle.redraw();
      }
    }

    if (this.isAttachedToPuzzle && this.canvas && this.puzzle) {
      let needsRedraw = false;
      const renderingFirstGame =
        changedProperties.has("renderedPuzzleGameId") &&
        changedProperties.get("renderedPuzzleGameId") === undefined;

      if (
        changedProperties.has("maximize") ||
        changedProperties.has("renderedPuzzleParams") ||
        renderingFirstGame
      ) {
        // Changing game params may alter desired canvas size.
        // (Since game id has probably also changed, we'll redraw either way.)
        needsRedraw = !(await this.resize(false));
      }

      if (changedProperties.has("renderedPuzzleGameId")) {
        // Current canvasSize should be fine, but we need to draw the new game.
        needsRedraw = true;
      }

      if (changedProperties.has("canvasSize") || changedProperties.has("canvasDpr")) {
        await this.puzzle.resizeDrawing(this.canvasSize, this.canvasDpr);
        needsRedraw = true;
      }

      if (needsRedraw) {
        await this.puzzle.redraw();
      }
    }
  }

  override connectedCallback() {
    super.connectedCallback();
    if (isSafari) {
      document.addEventListener("visibilitychange", this.kickSafariCanvas);
      window.addEventListener("focus", this.kickSafariCanvas);
    }
  }

  override async disconnectedCallback() {
    super.disconnectedCallback();
    if (isSafari) {
      document.removeEventListener("visibilitychange", this.kickSafariCanvas);
      window.removeEventListener("focus", this.kickSafariCanvas);
    }
    if (this.isAttachedToPuzzle) {
      await this.puzzle?.detachCanvas();
      this.isAttachedToPuzzle = false;
      this.isAttachingToPuzzle = false;
    }
  }

  protected override render() {
    const result = [this.renderPuzzle()];
    if (this.statusbar && this.puzzle?.wantsStatusbar) {
      result.push(this.renderStatusbar());
    }
    return result;
  }

  protected renderCanvas(part?: string) {
    const { w, h } = this.canvasSize;
    const canvasStyle = styleMap({
      width: `${w}px`,
      height: `${h}px`,
    });
    const loadingClass = classMap({
      loading: true,
      active: !this.puzzle?.currentGameId || this.puzzle.generatingGame,
    });
    return html`
      <div part=${part || nothing} id="canvasWrap">
        <canvas style=${canvasStyle}></canvas>
        <div class=${loadingClass}>
          <slot name="loading"></slot>
        </div>
      </div>
    `;
  }

  protected renderPuzzle() {
    return this.renderCanvas("puzzle");
  }

  protected renderStatusbar() {
    return html`<div part="statusbar">${this.puzzle?.statusbarText}</div>`;
  }

  protected kickSafariCanvas = async () => {
    // Give Safari a good kick in the side to try to fix a randomly blank
    // canvas after the tab has been hidden or occluded by another window,
    // or the app has resumed. The OffscreenCanvas has the correct content,
    // but Safari seems to fail to copy it onscreen. (Weirdly, the canvas
    // appears correctly in Safari developer tools under both Graphics and
    // Timelines: Screenshots.)
    if (document.visibilityState === "visible" && this.canvas) {
      // Something in resize() seems to help to get the canvas connection
      // working again (usually), but I haven't been able to isolate it.
      await this.resize(true);
      await this.updateComplete;
      await this.redraw();
    }
  };

  async redraw() {
    if (this.isAttachedToPuzzle) {
      await this.puzzle?.redraw();
    }
  }

  // Returns true if canvasSize changed
  protected async resize(isUserSize = true): Promise<boolean> {
    // (Resize observer may call this before first render,
    // so avoid initializing cached @query props unless hasUpdated.)
    if (!this.hasUpdated || !this.canvasWrap || !this.puzzlePart) {
      return false;
    }

    const classes = ["resizing"];
    if (!isUserSize && this.maximize) {
      // Make the puzzlePart full page size, and getBoundingClientRect() should
      // tell us the maximum size the canvas is able to grow within our container.
      classes.push("maximize");
    }
    this.puzzlePart.classList.add(...classes);
    const { width, height } = this.canvasWrap.getBoundingClientRect();
    const availableSize = { w: width, h: height };
    this.puzzlePart.classList.remove(...classes);

    // midend_size() is only valid while there's a game;
    // use a square fitting availableSize before that.
    // We'll get called again once there's a game (see renderingFirstGame in updated()).
    // TODO: unclear if we should pass dpr to midend as 1 or actual dpr
    //   (since we use css pixels and scale to dpr in the drawing context)
    const size = this.puzzle?.currentGameId
      ? await this.puzzle.size(availableSize, isUserSize || this.maximize, 1)
      : { w: Math.min(width, height), h: Math.min(width, height) };
    const changed = size.w !== this.canvasSize.w || size.h !== this.canvasSize.h;

    if (changed) {
      // console.log(
      //   `Resize: current ${this.canvasSize.w}x${this.canvasSize.h},` +
      //     ` available ${width}x${height},` +
      //     ` used ${size.w}x${size.h}`,
      // );
      this.canvasSize = size;
    }

    return changed;
  }

  //
  // Color palette
  //

  protected async updateColorPalette() {
    if (!this.puzzle || !this.isAttachedToPuzzle) {
      throw new Error("updateColorPalette called before puzzle ready");
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
    await this.puzzle.setDrawingPalette(palette);

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
        --gap: var(--wa-space-s);

        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--gap);

        /* Necessary for getDefaultColour to access computed backgroundColor */
        background-color: inherit;
      }

      canvas {
        display: block;
      }
      
      @media (prefers-reduced-motion: no-preference) {
        canvas {
          transition:
              width 75ms ease-in-out,
              height 75ms ease-in-out;
        }
      }
      
      canvas, #canvasWrap {
        /* Required for accurate sizing calculations */
        padding: 0 !important;
        border-width: 0 !important;
      }

      [part="puzzle"] {
        box-sizing: border-box;
        position: relative;
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

        /* See how big canvas can get. */
        #canvasWrap {
          width: 100vw;
          height: 100vh;
          max-width: 100%;
          max-height: 100%;
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
      
      .loading {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;
        
        visibility: hidden;
        opacity: 0;
        transition: opacity 75ms ease-in-out;
        
        &.active {
          visibility: visible;
          opacity: 1;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-view": PuzzleView;
  }
}
