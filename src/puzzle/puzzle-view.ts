import { consume } from "@lit/context";
import { ResizeController } from "@lit-labs/observers/resize-controller.js";
import { SignalWatcher } from "@lit-labs/signals";
import { ColorSpace, to as convert, display, OKLCH, parse, sRGB } from "colorjs.io/fn";
import { css, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { coordsToColour, equalColour } from "../utils/colour.ts";
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

  @query("#canvasWrap", true)
  protected canvasWrap?: HTMLDivElement;

  @query("[part=puzzle]", true)
  protected puzzlePart?: HTMLElement;

  protected resizeController = new ResizeController(this, {
    // Throttle to at least the canvas size transition time,
    // to avoid multiple resizes while resizing.
    callback: throttle(() => this.resize(), 100),
  });

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
    if (changedProperties.has("puzzle") && this.canvas) {
      // Changing Puzzle: any existing canvas belongs to another (probably deleted) worker.
      this.destroyCanvas();
    }

    if (!this.canvas && this.puzzle && this.puzzle.currentGameId) {
      await this.createCanvas();
    } else if (this.puzzle && this.canvasReady) {
      let needsResize = false;
      let needsRedraw = false;

      if (
        changedProperties.has("maximize") ||
        changedProperties.has("renderedPuzzleParams")
      ) {
        // Changing game params may alter desired canvas size.
        // (Since game id has probably also changed, we'll redraw either way.)
        needsResize = true;
      }

      if (changedProperties.has("renderedPuzzleGameId")) {
        if (changedProperties.get("renderedPuzzleGameId") === undefined) {
          // First game rendered; need resize before redraw.
          needsResize = true;
        }
        // Else current size should be fine. Need to draw the new game either way.
        needsRedraw = true;
      }

      if (needsResize) {
        if (await this.resize()) {
          needsRedraw = false;
        }
      }
      if (needsRedraw) {
        await this.puzzle.redraw();
      }
    }
  }

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this.redrawWhenVisible);
    window.addEventListener("focus", this.redrawWhenVisible);
  }

  override async disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this.redrawWhenVisible);
    window.removeEventListener("focus", this.redrawWhenVisible);
  }

  protected override render() {
    return [this.renderPuzzle(), this.renderStatusbar(), this.renderLoadingIndicator()];
  }

  protected renderPuzzle() {
    return html`
      <div part="puzzle">${this.renderCanvas()}</div>
    `;
  }

  protected renderCanvas() {
    return html`
      <div id="canvasWrap">
        <div id="canvasPlaceholder"></div>
      </div>
    `;
  }

  protected renderStatusbar() {
    return this.statusbar && this.puzzle?.wantsStatusbar
      ? html`<div part="statusbar">${this.puzzle?.statusbarText}</div>`
      : nothing;
  }

  protected renderLoadingIndicator() {
    const classes = classMap({
      loading:
        !this.puzzle?.currentGameId || this.puzzle.generatingGame || !this.canvasReady,
    });
    return html`
      <div id="loadingIndicator" class=${classes}>
        <slot name="loading"></slot>
      </div>
    `;
  }

  protected redrawWhenVisible = async () => {
    // Try to work around a Safari issue (?) where the onscreen canvas
    // is randomly blank after the tab has been hidden/occluded or the app
    // is resuming. The offscreen canvas has the correct content, but it
    // isn't mirrored onscreen. (Although it seems Safari specific, redrawing
    // on activation doesn't hurt in other browsers.)
    if (document.visibilityState === "visible") {
      await this.redraw();
    }
  };

  async redraw() {
    if (this.canvas && this.canvasReady) {
      await this.puzzle?.redraw();
    }
  }

  // Returns true if canvasSize changed.
  // If changed and canvasReady, redraws puzzle.
  protected async resize(isUserSize = false): Promise<boolean> {
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
    const changed = size.w !== this.canvasSize?.w || size.h !== this.canvasSize?.h;

    if (changed) {
      // const { w: currentW, h: currentH } = this.canvasSize ?? { w: "---", h: "---" };
      // console.log(
      //   `Resize: current ${currentW}x${currentH},` +
      //     ` available ${width}x${height},` +
      //     ` used ${size.w}x${size.h}`,
      // );
      this.canvasSize = size;
      await this.updateCanvasSize();
      if (this.puzzle && this.canvasReady) {
        await this.puzzle.redraw();
      }
    }

    return changed;
  }

  //
  // Canvas
  //

  @state()
  protected canvasReady = false;

  protected canvas?: HTMLCanvasElement;
  protected canvasDpr = window.devicePixelRatio ?? 1;
  protected canvasSize?: Size;
  private inCreateCanvas = false;

  protected async createCanvas() {
    if (this.canvas) {
      throw new Error("PuzzleView.createCanvas called when canvas already exists");
    }
    if (!this.canvasWrap) {
      throw new Error("PuzzleView.createCanvas called before canvasWrap available");
    }
    if (!this.puzzle) {
      throw new Error("PuzzleView.createCanvas called before puzzle available");
    }
    if (!this.puzzle.currentGameId) {
      throw new Error("PuzzleView.createCanvas called before game set up");
    }

    if (this.inCreateCanvas) {
      return;
    }

    this.inCreateCanvas = true;
    this.canvasReady = false;
    this.canvas = document.createElement("canvas");
    // Safari wants the canvas in the dom before transferring it offscreen.
    // (Else offscreen drawing doesn't always get mirrored onscreen.)
    this.canvasWrap.insertBefore(this.canvas, this.canvasWrap.firstChild);
    const offscreenCanvas = this.canvas.transferControlToOffscreen();

    const { fontFamily, fontWeight, fontStyle } = window.getComputedStyle(this.canvas);
    const fontInfo: FontInfo = { fontFamily, fontWeight, fontStyle };
    await this.puzzle.attachCanvas(offscreenCanvas, fontInfo);
    await this.updateColorPalette();

    // resize() will updateCanvasSize() if changed...
    if (!(await this.resize())) {
      // ... or if not, we must:
      await this.updateCanvasSize();
    }
    // resize() _didn't_ resizeDrawing or redraw (because not this.canvasReady).
    if (!this.canvasSize) {
      throw new Error("PuzzleView.createCanvas has no canvasSize");
    }
    await this.puzzle.resizeDrawing(this.canvasSize, this.canvasDpr);
    await this.puzzle.redraw();

    // Enable size transitions
    this.canvas.classList.add("attached");

    // (Wait to set canvasReady until after all async ops,
    // to avoid updated() attempting competing changes.)
    this.canvasReady = true;
    this.inCreateCanvas = false;
  }

  protected destroyCanvas() {
    if (this.canvas) {
      // Puzzle.detachCanvas is actually a noop, so don't bother calling it.
      // (We'd need to make sure we were calling it for the Puzzle in use
      // during createCanvas, which isn't necessarily this.puzzle any more.)
      this.canvas.remove();
      this.canvas = undefined;
    }
  }

  protected async updateCanvasSize() {
    if (this.canvasSize) {
      const { w, h } = this.canvasSize;
      if (this.canvas) {
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
      }
      const placeholder = this.shadowRoot?.getElementById("canvasPlaceholder");
      if (placeholder) {
        placeholder.style.width = `${w}px`;
        placeholder.style.height = `${h}px`;
      }
      if (this.puzzle && this.canvasReady) {
        await this.puzzle.resizeDrawing(this.canvasSize, this.canvasDpr);
      }
    }
  }

  //
  // Color palette
  //

  protected async updateColorPalette() {
    if (!this.puzzle || !this.canvas) {
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
        /* Padding around everything, spacing between puzzle and status bar */
        --spacing: var(--wa-space-s);

        display: flex;
        flex-direction: column;
        align-items: center;

        /* Necessary for getDefaultColour to access computed backgroundColor */
        background-color: inherit;

        /* For sizing the loadingIndicator */
        position: relative;
      }

      canvas {
        display: block;
      }
      
      canvas + #canvasPlaceholder {
        /* Hide the placeholder when the canvas is in the DOM */
        display: none;
      }
      
      @media (prefers-reduced-motion: no-preference) {
        canvas.attached, #canvasPlaceholder {
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
        padding: var(--spacing);
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
        /* (Top spacing is redundant with [part="puzzle"] bottom) */
        padding: 0 var(--spacing) var(--spacing);

        /* Don't collapse when no content (e.g., Rectangles) */
        min-height: 1em;
        max-height: 1em;
        line-height: 1.0;
        text-wrap: nowrap;
        text-overflow: ellipsis;

        /* For puzzles with timers (e.g., Mines), variable width is distracting */
        font-variant-numeric: tabular-nums;
      }

      #loadingIndicator {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;
        
        visibility: hidden;
        opacity: 0;
        transition: opacity 75ms ease-in-out;
        
        &.loading {
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
