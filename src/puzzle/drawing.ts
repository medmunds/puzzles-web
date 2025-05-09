import type {
  DrawTextOptions,
  Drawing as DrawingHandle,
  DrawingImpl,
  Point,
  PuzzleModule,
  Rect,
  Size,
} from "./module.ts";

// Type definitions

interface FontInfo {
  "font-family": string;
  "font-weight": string;
  "font-style": string;
}

interface Blitter {
  w: number;
  h: number;
  x?: number;
  y?: number;
  imageData?: ImageData;
  $type: "blitter";
}

/**
 * Drawing class for canvas-based rendering
 */
export class Drawing implements DrawingImpl<Blitter> {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private palette: string[] = [];
  private fontInfo: FontInfo;
  private dpr = 1; // devicePixelRatio of the canvas

  /**
   * Create a new Drawing instance
   */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Get context
    const context = this.canvas.getContext("2d", {
      alpha: false,
      // TODO: maybe defer willReadFrequently until blitter gets used?
      willReadFrequently: true,
    });
    if (!context) {
      throw new Error("Failed to get canvas 2d context");
    }
    this.context = context;
    // emcclib.js uses round for everything
    this.context.lineCap = "round";
    this.context.lineJoin = "round";

    // Get font info
    const computedStyle = window.getComputedStyle(this.canvas);
    this.fontInfo = {
      "font-family": computedStyle.fontFamily,
      "font-weight": computedStyle.fontWeight,
      "font-style": computedStyle.fontStyle,
    };
  }

  bind(module: PuzzleModule): DrawingHandle {
    return module.Drawing.implement(this);
  }

  /**
   * Install the color palette, which must be CSS color strings
   * in the same order as the return from Midend.getColours.
   */
  setPalette(colors: string[]): void {
    this.palette = colors;
  }

  /**
   * Resize the canvas
   */
  resize(w: number, h: number, dpr: number): void {
    // https://web.dev/articles/canvas-hidipi
    // Most canvas operations will be scaled by the dpr,
    // allowing the puzzle to work in CSS pixels.
    this.dpr = dpr;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.context.scale(dpr, dpr);
  }

  /*
   * DrawingImpl
   */

  drawText(
    { x, y }: Point,
    { align, baseline, fontType, size }: DrawTextOptions,
    colour: number,
    text: string,
  ): void {
    this.context.font = [
      this.fontInfo["font-style"],
      this.fontInfo["font-weight"],
      `${size}px`,
      fontType === "variable" ? this.fontInfo["font-family"] : "monospace",
    ].join(" ");
    this.context.textAlign = align;
    if (baseline === "mathematical") {
      // CanvasRenderingContext2D.textBaseline doesn't support "mathematical".
      // (And "middle" centers on em height--including descenders--which is not
      // what the puzzles want.) Approximate mathematical alignment from text
      // metrics. (Relies on TextMetrics.actual* props that landed ~2018-2020.)
      // TODO: should really measure full uppercase alphabet + digits
      //   (and cache results) -- see js_canvas_find_font_midpoint in emcclib.js
      this.context.textBaseline = "alphabetic";
      const { actualBoundingBoxAscent, actualBoundingBoxDescent } =
        this.context.measureText(text);
      y += (actualBoundingBoxAscent + actualBoundingBoxDescent) / 2;
    } else {
      this.context.textBaseline = baseline;
    }
    this.setUpContext({ fillColor: colour });
    this.context.fillText(text, x + 0.5, y + 0.5);
  }

  drawRect({ x, y, w, h }: Rect, colour: number): void {
    this.setUpContext({ fillColor: colour, strokeColor: colour, lineWidth: 1 });
    this.context.fillRect(x, y, w, h);
  }

  drawLine(p1: Point, p2: Point, colour: number, thickness: number): void {
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

  // TODO: double buffering; investigate OffscreenCanvas
  startDraw(): void {
    // zero out invalid rects
  }
  drawUpdate(_rect: Rect): void {
    // accumulate invalid rect(s)
  }
  endDraw(): void {
    // copy invalid rect(s) from offscreen to onscreen
  }

  clip({ x, y, w, h }: Rect): void {
    this.context.save();
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
    blitter.x = x;
    blitter.y = y;
    // getImageData ignores the transformation matrix, so must apply dpr scaling.
    blitter.imageData = this.context.getImageData(
      x * this.dpr,
      y * this.dpr,
      blitter.w * this.dpr,
      blitter.h * this.dpr,
    );
  }

  blitterLoad(blitter: Blitter, origin?: Point): void {
    if (!blitter.imageData) {
      throw new Error("Blitter loaded before saved");
    }
    // If origin not provided, restore to the position from which it was saved.
    const { x, y } = origin ?? { x: blitter.x ?? 0, y: blitter.y ?? 0 };
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
  }: { strokeColor?: number; fillColor?: number; lineWidth?: number }): void {
    this.context.lineWidth = lineWidth ?? 1;
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
