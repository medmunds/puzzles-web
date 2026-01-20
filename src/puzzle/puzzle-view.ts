import { consume } from "@lit/context";
import { ResizeController } from "@lit-labs/observers/resize-controller.js";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { currentColorScheme } from "../color-scheme.ts";
import {
  colourToOKLCH,
  cssColorToOKLCH,
  darkModeColor,
  isGrayChroma,
  oklchToColour,
  oklchToCSSColor,
  tintGrays,
} from "../utils/color.ts";
import { clamp } from "../utils/math.ts";
import { throttle } from "../utils/timing.ts";
import { puzzleAugmentations } from "./augmentation.ts";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";
import type { FontInfo, Size } from "./types.ts";

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
   * Maximum scale to stretch the puzzle beyond its preferred size.
   * Set to "1" to limit puzzle to preferred size or smaller.
   * Default: no limit (will fill available space).
   */
  @property({ type: Number, attribute: "max-scale" })
  maxScale: number = Number.POSITIVE_INFINITY;

  /**
   * Where (and whether) to show the status bar (for puzzles that have one).
   */
  @property({ attribute: "statusbar-placement", type: String, reflect: true })
  statusbarPlacement: "start" | "end" | "hidden" = "start";

  @consume({ context: puzzleContext, subscribe: true })
  @state()
  protected puzzle?: Puzzle;

  @state()
  protected renderedPuzzleGameId?: string;

  @state()
  protected renderedPuzzleParams?: string;

  @state()
  protected renderedColorScheme?: string;

  @query("[part=content]")
  protected contentPart?: HTMLElement;

  @query("[part=puzzle]")
  protected puzzlePart?: HTMLElement;

  @query("#canvasPlaceholder")
  protected canvasPlaceholder?: HTMLElement;

  protected resizeController = new ResizeController(this, {
    // Throttle to at least the canvas size transition time,
    // to avoid multiple resizes while resizing.
    callback: throttle(() => this.resize(), 100),
  });

  protected override willUpdate(_changedProperties: Map<string, unknown>) {
    // Since lit signals doesn't yet support effects on reactive properties, copy the
    // puzzle's reactive currentGameId and currentParams into local reactive state.
    // If they have changed, this will cause "effects" via updated().
    this.renderedPuzzleGameId = this.puzzle?.currentGameId;
    this.renderedPuzzleParams = this.puzzle?.currentParams;
    this.renderedColorScheme = currentColorScheme.get();
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

      if (changedProperties.has("renderedColorScheme")) {
        await this.updateColorPalette(); // forces redraw
      }

      if (
        changedProperties.has("maxScale") ||
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

  protected contentTabIndex: string | typeof nothing = nothing;

  protected override render() {
    return html`
      <div part="content" tabindex=${this.contentTabIndex}>
        ${this.statusbarPlacement === "start" ? this.renderStatusbar() : nothing}
        ${this.renderPuzzle()}
        ${this.statusbarPlacement === "end" ? this.renderStatusbar() : nothing}
        ${this.renderLoadingIndicator()}
      </div>
    `;
  }

  protected renderPuzzle() {
    return html`
      <div part="puzzle">${this.renderCanvas()}</div>
    `;
  }

  protected renderCanvas() {
    return html`<div id="canvasPlaceholder"></div>`;
  }

  protected renderStatusbar() {
    if (!this.puzzle?.wantsStatusbar) {
      return nothing;
    }
    const style = this.canvasSize
      ? styleMap({ "max-width": `${this.canvasSize.w}px` })
      : nothing;
    return html`
      <div part="statusbar" role="status" style=${style}>${this.puzzle?.statusbarText}</div>
    `;
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

  protected minPuzzleDimension = 64;

  protected getAvailableCanvasSize(): Size {
    // Available canvas size is free space plus current canvas size.
    // Free space is my size minus current content size.
    // (When resizing smaller, free space may be negative.)
    // Content includes the current canvas, statusbar, padding/spacing/borders, etc.
    let { width, height } = this.getBoundingClientRect();
    const content = this.contentPart;
    if (content) {
      width -= content.offsetWidth;
      height -= content.offsetHeight;
    }
    // This must use the actual canvas (or placeholder) in the DOM
    // (not this.canvasSize, which may not have been applied yet).
    const canvas = this.canvas ?? this.canvasPlaceholder;
    if (canvas) {
      width += canvas.offsetWidth;
      height += canvas.offsetHeight;
    }
    width = Math.floor(Math.max(width, this.minPuzzleDimension));
    height = Math.floor(Math.max(height, this.minPuzzleDimension));
    return { w: width, h: height };
  }

  // Returns true if canvasSize changed.
  // If changed and canvasReady, redraws puzzle.
  protected async resize(_isUserSize = false): Promise<boolean> {
    // (Resize observer may call this before first render,
    // so avoid initializing cached @query props unless hasUpdated.)
    if (!this.hasUpdated || !this.puzzlePart) {
      return false;
    }

    const availableSize = this.getAvailableCanvasSize();

    // midend_size() is only valid while there's a game; just report full
    // availableSize before that. (We'll get called again once there's a game:
    // see renderingFirstGame in updated()).
    let size = availableSize;
    if (this.puzzle?.currentGameId) {
      if (this.maxScale > 0 && this.maxScale < Number.POSITIVE_INFINITY) {
        // Limit available size to maxScale * preferredSize
        const preferredSize = await this.puzzle.preferredSize();
        const scaledSize = {
          w: this.maxScale * preferredSize.w,
          h: this.maxScale * preferredSize.h,
        };
        availableSize.w = Math.min(scaledSize.w, availableSize.w);
        availableSize.h = Math.min(scaledSize.h, availableSize.h);
      }
      size = await this.puzzle.size(availableSize, true, 1);
    }

    const changed = size.w !== this.canvasSize?.w || size.h !== this.canvasSize?.h;
    if (changed) {
      // const { w: currentW, h: currentH } = this.canvasSize ?? { w: "---", h: "---" };
      // console.log(
      //   `Resize: current ${currentW}x${currentH},` +
      //     ` available ${availableSize.w}x${availableSize.h},` +
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
    if (!this.canvasPlaceholder?.parentElement) {
      throw new Error(
        "PuzzleView.createCanvas called before canvasPlaceholder rendered",
      );
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
    this.canvasPlaceholder.parentElement.insertBefore(
      this.canvas,
      this.canvasPlaceholder,
    );
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
      for (const element of [this.canvas, this.canvasPlaceholder]) {
        if (element) {
          element.style.width = `${w}px`;
          element.style.height = `${h}px`;
        }
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
    if (!this.puzzle || !this.contentPart || !this.canvas) {
      throw new Error("updateColorPalette called before puzzle ready");
    }

    // (Access reactive data before any async calls)
    const isDarkMode = currentColorScheme.get() === "dark";

    const { paletteBgIndex = 0, darkMode } =
      puzzleAugmentations[this.puzzle.puzzleId] ?? {};

    // Get our content's (original) CSS background and foreground colors
    this.contentPart.style.removeProperty("--background-color");
    const computedStyle = window.getComputedStyle(this.contentPart);
    const bglch = cssColorToOKLCH(computedStyle.backgroundColor);

    // The puzzle will generate a palette from a default background color, but:
    // - It doesn't work well for dark background colors. Puzzles often generate
    //   colors by multiplying the background by a factor < 1.0. This works for
    //   light backgrounds, but generates near-blacks for dark ones. Instead,
    //   invert a dark background to generate a light palette, and reverse
    //   that later.
    // - Puzzles compute colors in RGB space, which can be ugly for non-gray
    //   backgrounds. Instead, give the puzzle a gray background of equivalent
    //   lightness (working in OKLCH space) and then colorize it later.
    const [bgl, bgc, bgh] = bglch;
    const defaultBackgroundColour = isDarkMode
      ? oklchToColour([1, 0, 0]) // generate from pure white in dark mode
      : oklchToColour([bgl, 0, 0]);
    const paletteRGB = await this.puzzle.getColourPalette(defaultBackgroundColour);
    let palette = paletteRGB.map(colourToOKLCH);

    // Apply dark mode adjustments and overrides from puzzleAugmentations
    if (isDarkMode) {
      palette = palette.map(([l, c, h], i) => {
        const override = darkMode?.paletteOverrides?.[i];
        if (Array.isArray(override)) {
          [l, c, h] = override;
        } else if (override !== false) {
          [l, c, h] = darkModeColor([l, c, h], bgl);
          if (typeof override === "number") {
            l *= override;
            if (l < 0) {
              l = bgl - l;
            }
            l = clamp(0, l, 1);
          }
        }
        return [l, c, h];
      });
      if (darkMode?.paletteSwaps) {
        for (const [a, b] of darkMode.paletteSwaps) {
          [palette[a], palette[b]] = [palette[b], palette[a]];
        }
      }
    }

    // Shift palette grays to the original background hue
    if (!isGrayChroma(bgc) && !Number.isNaN(bgh)) {
      palette = palette.map((lch) => tintGrays(lch, bglch));
    }

    // Pass the resulting palette to the drawing API.
    const cssPalette = palette.map(oklchToCSSColor);
    await this.puzzle.setDrawingPalette(cssPalette);

    // Update our own CSS background color to match (for any padding area).
    this.contentPart.style.setProperty(
      "--background-color",
      cssPalette[paletteBgIndex],
    );
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
        align-items: center;
        justify-content: center;

        /* Content area properties, for parent overrides */
        --background-color: inherit;
        --border: none;
        --border-radius: none;
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
      
      [part="content"] {
        background-color: var(--background-color);
        border: var(--border);
        border-radius: var(--border-radius);

        /* For sizing the loadingIndicator */
        position: relative;
      }
      
      canvas, #canvasPlaceholder {
        /* Required for accurate sizing calculations */
        padding: 0 !important;
        border-width: 0 !important;
      }

      [part="puzzle"] {
        box-sizing: border-box;
        padding: var(--spacing);
      }
      
      [part="statusbar"] {
        text-align: center;
        
        /* (Top or bottom spacing is redundant with [part="puzzle"]) */
        padding: var(--spacing);
        :host([statusbar-placement="start"]) & {
          padding-block-end: 0;
        }
        :host([statusbar-placement="end"]) & {
          padding-block-start: 0;
        }

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
