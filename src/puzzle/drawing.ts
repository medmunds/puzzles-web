import type {
  Drawing as DrawingHandle,
  DrawingImpl,
  DrawTextOptions,
  FontInfo,
  Point,
  PuzzleModule,
  Rect,
  Size,
} from "./types.ts";

// Type definitions

export const defaultFontInfo: FontInfo = {
  fontFamily: "sans-serif",
  fontWeight: "normal",
  fontStyle: "normal",
} as const;

interface Blitter {
  w: number;
  h: number;
  imageData?: ImageData;
  $type: "blitter";
}

/**
 * Drawing class for canvas-based rendering
 */
export class Drawing implements DrawingImpl<Blitter> {
  private readonly canvas: OffscreenCanvas;
  private context: OffscreenCanvasRenderingContext2D;
  private palette: string[] = [];
  private fontInfo: FontInfo;
  private dpr = 1; // devicePixelRatio of the canvas

  /**
   * Create a new Drawing instance
   */
  constructor(canvas: OffscreenCanvas, fontInfo?: FontInfo) {
    this.canvas = canvas;
    this.fontInfo = fontInfo ?? defaultFontInfo;

    // Get context
    const context = this.canvas.getContext("2d", {
      alpha: false,
      // willReadFrequently causes lost context when used with
      // OffscreenCanvas transferred to worker in Android Chrome:
      // https://issues.chromium.org/issues/417354558#comment3.
      // (Otherwise it would be helpful for blitter use.)
      //   willReadFrequently: true,
    });
    if (!context) {
      throw new Error("Failed to get canvas 2d context");
    }
    this.context = context;
  }

  bind(module: PuzzleModule): DrawingHandle {
    return module.Drawing.implement(this);
  }

  /**
   * Install the color palette, which must be CSS color strings
   * in the same order as the return from Frontend.getColourPalette.
   * (Does not redraw anything already on the canvas.)
   * Returns true if an already set palette was replaced.
   */
  setPalette(colors: string[]): boolean {
    const hadPalette = this.palette.length > 0;
    this.palette = colors;
    return hadPalette;
  }

  /**
   * Update font for later text drawing.
   * (Does not redraw text already on the canvas.)
   * Returns true if a non-default font was set.
   */
  public setFontInfo(fontInfo: FontInfo): boolean {
    const hadCustomFont = this.fontInfo !== defaultFontInfo;
    this.fontInfo = { ...fontInfo };
    return hadCustomFont;
  }

  /**
   * Resize the canvas
   */
  public resize(w: number, h: number, dpr: number): void {
    // https://web.dev/articles/canvas-hidipi
    // Most canvas operations will be scaled by the dpr,
    // allowing the puzzle to work in CSS pixels.
    // The drawing API expects rects and vertical/horizontal lines
    // are constrained to integer pixel boundaries (no anti-aliasing),
    // so round a fractional dpr up. (It's OK that the onscreen results
    // will anti-alias the integral offscreen original.)
    const effectiveDpr = Math.ceil(dpr);
    this.dpr = effectiveDpr;
    this.canvas.width = w * effectiveDpr;
    this.canvas.height = h * effectiveDpr;
    this.context.scale(effectiveDpr, effectiveDpr);
  }

  /**
   * Return a Blob containing the current image of the canvas.
   *
   * Any options are passed to OffscreenCanvas.convertToBlob(); if not provided
   * the result will be type image/png.
   */
  public async getImage(options?: ImageEncodeOptions): Promise<Blob> {
    return this.canvas.convertToBlob(options);
  }

  /*
   * DrawingImpl
   */

  // cached text metrics
  private mathematicalBaselineOffset: { [font: string]: number } = {};

  drawText(
    { x, y }: Point,
    { align, baseline, fontType, size }: DrawTextOptions,
    colour: number,
    text: string,
  ): void {
    if (size < 1) {
      // console.warn(`Drawing.drawText ignoring size=${size}`);
      return;
    }
    this.context.font = [
      this.fontInfo.fontStyle,
      this.fontInfo.fontWeight,
      `${size}px`,
      fontType === "variable" ? this.fontInfo.fontFamily : "monospace",
    ].join(" ");
    this.context.textAlign = align;
    if (baseline === "mathematical") {
      // CanvasRenderingContext2D.textBaseline doesn't support "mathematical".
      // (And "middle" centers on em height--including descenders--which is not
      // what the puzzles want.) Approximate mathematical alignment by centering
      // digits. (Relies on TextMetrics.actual* props that landed ~2018-2020.)
      this.context.textBaseline = "alphabetic";
      let offset = this.mathematicalBaselineOffset[this.context.font];
      if (offset === undefined) {
        // Measure digits only: puzzles tend to center digits or digits+lowercase,
        // not uppercase. (Compare js_canvas_find_font_midpoint in emcclib.js.)
        const { actualBoundingBoxAscent, actualBoundingBoxDescent } =
          this.context.measureText("0123456789");
        offset = (actualBoundingBoxAscent + actualBoundingBoxDescent) / 2;
        this.mathematicalBaselineOffset[this.context.font] = offset;
      }
      y += offset;
    } else {
      this.context.textBaseline = baseline;
    }
    this.setUpContext({ fillColor: colour });
    this.context.fillText(text, x, y);
  }

  drawRect({ x, y, w, h }: Rect, colour: number): void {
    if (w < 1 || h < 1) {
      // console.warn(`Drawing.drawRect ignoring w=${w} h=${h}`);
      return;
    }
    this.setUpContext({ fillColor: colour, strokeColor: colour, lineWidth: 1 });
    this.context.fillRect(x, y, w, h);
  }

  drawLine(p1: Point, p2: Point, colour: number, thickness: number): void {
    if (thickness <= 0) {
      // console.warn(`Drawing.drawLine ignoring thickness=${thickness}`);
      return;
    }
    this.context.beginPath();
    // Drawing API points are pixel center; canvas is pixel top left.
    this.context.moveTo(p1.x + 0.5, p1.y + 0.5);
    this.context.lineTo(p2.x + 0.5, p2.y + 0.5);
    this.setUpContext({ strokeColor: colour, fillColor: colour, lineWidth: thickness });
    this.context.stroke();
    // Draw the pixel at each end of the line (copied from emcclib.js).
    this.context.fillRect(p1.x, p1.y, 1, 1);
    this.context.fillRect(p2.x, p2.y, 1, 1);
  }

  drawPolygon(coords: Point[], fillcolour: number, outlinecolour: number): void {
    // Drawing API points are pixel center; canvas is pixel top left.
    this.context.beginPath();
    this.context.moveTo(coords[0].x + 0.5, coords[0].y + 0.5);
    for (const { x, y } of coords.slice(1)) {
      this.context.lineTo(x + 0.5, y + 0.5);
    }
    this.context.closePath();
    this.setUpContext({
      strokeColor: outlinecolour,
      fillColor: fillcolour >= 0 ? fillcolour : undefined,
    });
    if (fillcolour >= 0) {
      this.context.fill();
    }
    this.context.stroke();
  }

  drawCircle(
    { x: cx, y: cy }: Point,
    radius: number,
    fillcolour: number,
    outlinecolour: number,
  ): void {
    if (radius <= 0) {
      // console.warn(`Drawing.drawCircle ignoring radius=${radius}`);
      return;
    }
    this.context.beginPath();
    this.context.arc(cx + 0.5, cy + 0.5, radius, 0, Math.PI * 2, false);
    this.context.closePath();
    this.setUpContext({
      strokeColor: outlinecolour,
      fillColor: fillcolour >= 0 ? fillcolour : undefined,
    });
    if (fillcolour >= 0) {
      this.context.fill();
    }
    this.context.stroke();
  }

  // Invalidation region management (startDraw/drawUpdate/endDraw):
  // Because our offscreen canvas automatically syncs to the onscreen canvas,
  // there's no need to keep track of the dirty region or notify about updates.
  startDraw(): void {}

  drawUpdate(_rect: Rect): void {}

  endDraw(): void {}

  clip({ x, y, w, h }: Rect): void {
    this.context.save();
    if (w < 1 || h < 1) {
      // console.warn(`Drawing.clip ignoring w=${w} h=${h}`);
      return;
    }
    this.context.beginPath();
    this.context.rect(x, y, w, h);
    this.context.clip();
  }

  unclip(): void {
    this.context.restore();
  }

  blitterNew({ w, h }: Size): Blitter {
    return { w, h, $type: "blitter" };
  }

  blitterFree(blitter: Blitter): void {
    blitter.imageData = undefined;
  }

  blitterSave(blitter: Blitter, { x, y }: Point): void {
    const { w, h } = blitter;
    if (w < 1 || h < 1) {
      // console.warn(`Drawing.blitterSave ignoring w=${w} h=${h}`);
      return;
    }

    // getImageData ignores the transformation matrix, so must apply dpr scaling.
    blitter.imageData = this.context.getImageData(
      x * this.dpr,
      y * this.dpr,
      w * this.dpr,
      h * this.dpr,
    );
  }

  blitterLoad(blitter: Blitter, { x, y }: Point): void {
    const { w, h } = blitter;
    if (w < 1 || h < 1) {
      // console.warn(`Drawing.blitterLoad ignoring w=${w} h=${h}`);
      return;
    }
    if (!blitter.imageData) {
      throw new Error("Blitter loaded before saved");
    }
    this.context.putImageData(blitter.imageData, x * this.dpr, y * this.dpr);
  }

  /**
   * Set up the drawing context for filling/stroking paths.
   * lineWidth defaults to 1 (the puzzle drawing_api standard width).
   * If fillColor is not provided, fillStyle will not be changed.
   */
  private setUpContext({
    strokeColor,
    fillColor,
    lineWidth,
  }: {
    strokeColor?: number;
    fillColor?: number;
    lineWidth?: number;
  }): void {
    this.context.lineWidth = lineWidth ?? 1;
    this.context.lineCap = "round";
    this.context.lineJoin = "round";
    if (strokeColor !== undefined) {
      const strokeStyle = this.palette[strokeColor];
      if (strokeStyle === undefined) {
        throw new Error(`strokeColor ${strokeColor} not in palette`);
      }
      this.context.strokeStyle = strokeStyle;
    }
    if (fillColor !== undefined) {
      const fillStyle = this.palette[fillColor];
      if (fillStyle === undefined) {
        throw new Error(`fillColor ${fillColor} not in palette`);
      }
      this.context.fillStyle = fillStyle;
    }
  }
}
