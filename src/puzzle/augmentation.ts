import type { ConfigValues, PuzzleId } from "./types.ts";

/**
 * Additional puzzle-specific metadata and functionality
 * that isn't (currently) possible in the C code
 */
export interface PuzzleAugmentations {
  /**
   * Construct a human-readable description of the given puzzle configuration.
   *
   * The implementations here try to follow the style of the existing preset titles
   * for the same puzzle. (Capitalization and punctuation seems to vary quite a bit
   * between puzzles.) Use British spelling to match the existing presets.
   */
  describeConfig?: (config: ConfigValues) => string;

  /**
   * Index of palette color used as background. (Default 0.)
   */
  paletteBgIndex?: number;

  darkMode?: {
    /**
     * Palette indexes that need special handling in automatic dark mode
     * generation. Set to:
     * - `false` to leave the puzzle's light-mode palette color unchanged
     *   in dark mode (e.g., for semantic "black" or "white")
     * - a number to scale the lightness of the calculated dark mode color
     * - an OKLCH color tuple to specify a fixed color
     */
    paletteOverrides?: Record<number, false | number | [number, number, number]>;

    /**
     * Pairs of palette index to swap after automatic dark mode generation.
     * Applied after any paletteOverrides.
     *
     * This is useful for puzzles that use game_mkhighlight to create a 3D
     * effect, where the inverted dark mode lightness results in swapping
     * embossed and inset appearances. (Not all uses of game_mkhighlight
     * should be swapped. E.g., cursor and selection indicators are usually
     * better left as is.)
     */
    paletteSwaps?: [number, number][];
  };
}

export const puzzleAugmentations: Record<PuzzleId, PuzzleAugmentations> = {
  abcd: {
    describeConfig: configFormatter(
      "{width}x{height}, {letters} letters {remove-clues:Easy|Hard}{allow-diagonal-touching:, no diagonal|}",
    ),
  },
  ascent: {
    describeConfig: configFormatter("{width}x{height}{grid-type} {difficulty}", {
      difficulty: ["Easy", "Normal", "Tricky", "Hard"],
      "grid-type": [" (no diagonals)", "", " Hexagon", " Honeycomb", " Edges"],
      // Not shown: symmetrical-clues, always-show-start-and-end-points
    }),
  },
  blackbox: {
    describeConfig: configFormatter("{width}x{height}, {no-of-balls}", {
      "no-of-balls": (value) => (String(value) === "1" ? "1 ball" : `${value} balls`),
    }),
    darkMode: {
      paletteSwaps: [[5, 6]], // 3D
    },
  },
  boats: {
    describeConfig: configFormatter(
      "{width}x{height}, size {fleet-size} {difficulty:Easy|Normal|Tricky|Hard}{remove-numbers:|, hidden clues}",
      // Not shown: fleet-configuration
    ),
    darkMode: {
      paletteOverrides: { 4: 0.6 }, // darken the water
    },
  },
  bricks: {
    describeConfig: configFormatter("{width}x{height} {difficulty:Easy|Normal|Tricky}"),
    darkMode: {
      paletteOverrides: { 0: [0.4, 0, 0], 2: [0.6, 0, 0], 4: [0.1, 0, 0] }, // bg, no-brick, brick
    },
  },
  bridges: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty}{allow-loops}{max-bridges-per-direction}",
      {
        // Don't include default values in description
        "allow-loops": (value) => (value ? "" : ", no loops"),
        difficulty: ["easy", "medium", "hard"],
        "max-bridges-per-direction": (value) =>
          value === 0
            ? ", max 1 bridge"
            : value === 1
              ? "" // default max 2 bridges
              : `, max ${Number(value) + 1} bridges`,
        // Not shown: percentage-of-island-squares, expansion-factor-percentage
      },
    ),
  },
  clusters: {
    describeConfig: configFormatter("{width}x{height}"),
  },
  cube: {
    describeConfig: configFormatter(
      // This won't exactly replicate the preset titles, which don't show dimensions.
      // (We'd need to suppress default dimensions, which vary by type of solid.)
      "{type-of-solid:Tetrahedron|Cube|Octahedron|Icosahedron}, {width-top}x{height-bottom}",
    ),
  },
  dominosa: {
    describeConfig: configFormatter(
      "Order {maximum-number-on-dominoes}, {difficulty:Trivial|Basic|Hard|Extreme|Ambiguous}",
    ),
  },
  fifteen: {
    describeConfig: configFormatter("{width}x{height}"),
    darkMode: {
      paletteSwaps: [[2, 3]], // 3D
    },
  },
  filling: {
    describeConfig: configFormatter("{width}x{height}"),
  },
  flip: {
    describeConfig: configFormatter("{width}x{height} {shape-type:Crosses|Random}"),
  },
  flood: {
    describeConfig: configFormatter(
      "{width}x{height}, {colours} colours{extra-moves-permitted}",
      {
        "extra-moves-permitted": (value) =>
          Number(value) > 0 ? `, ${value} extra moves` : "",
      },
    ),
    darkMode: {
      paletteOverrides: { 1: false }, // keep black lines between regions
      paletteSwaps: [[12, 13]], // 3D
    },
  },
  galaxies: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty:Normal|Unreasonable}",
    ),
    darkMode: {
      paletteOverrides: { 6: 0.8 }, // edges
    },
  },
  guess: {
    describeConfig: configFormatter(
      "{pegs-per-guess}x{guesses}, {colours} colours{allow-blanks:| + blank}{allow-duplicates:, no duplicates|}",
    ),
    darkMode: {
      paletteOverrides: { 16: false, 17: false }, // black and white pegs
    },
  },
  inertia: {
    describeConfig: configFormatter("{width}x{height}"),
    darkMode: {
      paletteOverrides: { 6: false }, // black mine
      paletteSwaps: [[2, 3]], // 3D
    },
  },
  keen: {
    describeConfig: configFormatter(
      "{grid-size}x{grid-size} {difficulty:Easy|Normal|Hard|Extreme|Unreasonable}{multiplication-only:|, multiplication only}",
    ),
  },
  lightup: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty:easy|tricky|hard}{percentage-of-black-squares}",
      {
        // Default black squares is "20". Note value is 5-100, not 0.05-1.0.
        "percentage-of-black-squares": (value) =>
          String(value) === "20" ? "" : `, ${value}% black squares`,
      },
      // Not shown: symmetry
    ),
    darkMode: {
      paletteOverrides: { 2: [0.5, 0, 0], 3: [0.95, 0, 0] }, // black, white
    },
  },
  loopy: {
    describeConfig: configFormatter(
      "{width}x{height} {grid-type} - {difficulty:Easy|Normal|Tricky|Hard}",
      {
        "grid-type": [
          "Squares",
          "Triangular",
          "Honeycomb",
          "Snub-Square",
          "Cairo",
          "Great-Hexagonal",
          "Octagonal",
          "Kites",
          "Floret",
          "Dodecagonal",
          "Great-Dodecagonal",
          "Penrose (kite/dart)",
          "Penrose (rhombs)",
          "Great-Great-Dodecagonal",
          "Kagome",
          "Compass-Dodecagonal",
          "Hats",
          "Spectres",
        ],
      },
    ),
    darkMode: {
      paletteOverrides: { 2: 0.6 }, // darken line-unknown
    },
  },
  magnets: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty:Easy|Tricky}{strip-clues:|, strip clues}",
    ),
  },
  map: {
    describeConfig: configFormatter(
      "{width}x{height}, {regions} regions, {difficulty:Easy|Normal|Hard|Unreasonable}",
    ),
  },
  mines: {
    describeConfig: configFormatter(
      "{width}x{height}, {mines} mines{ensure-solubility:, risky|}",
    ),
    darkMode: {
      paletteOverrides: { 0: [0.2, 0, 0], 10: false, 14: 0.8 }, // bg, black mine, white flag base
      paletteSwaps: [
        [0, 1], // cleared/uncleared background
        [16, 17], // 3D edges
      ],
    },
  },
  mosaic: {
    // Note: settings config lists "Height" before "Width"
    describeConfig: configFormatter(
      "Size: {width}x{height}",
      // Not shown: aggressive-generation-longer
    ),
    darkMode: {
      paletteOverrides: { 1: 0.6 }, // unmarked tiles
    },
  },
  net: {
    describeConfig: configFormatter(
      "{width}x{height}{walls-wrap-around:| wrapping}{barrier-probability}{ensure-unique-solution:, ambiguous|}",
      {
        // Show barrier % if not default 0
        "barrier-probability": (value) =>
          Number(value) > 0 ? `, ${percentage(value)} barriers` : "",
      },
    ),
  },
  netslide: {
    describeConfig: ({ width, height, ...config }) => {
      const wrapping = Boolean(config["walls-wrap-around"]);
      const barrierProbability = Number(config["barrier-probability"]);
      // Replicate difficulty logic from preset titles
      let difficulty: string;
      if (!wrapping && barrierProbability === 1) {
        difficulty = " easy";
      } else if (!wrapping && barrierProbability === 0) {
        difficulty = " medium";
      } else if (wrapping && barrierProbability === 0) {
        difficulty = " hard";
      } else {
        // Custom difficulty
        difficulty =
          barrierProbability > 0 ? `, ${percentage(barrierProbability)} barriers` : "";
        if (wrapping) {
          difficulty += ", wrapping";
        }
      }
      return `${width}x${height}${difficulty}`;
      // Not shown: number-of-shuffling-moves
    },
  },
  palisade: {
    describeConfig: configFormatter(
      "{width} x {height}, regions of size {region-size}",
    ),
    darkMode: {
      // Palisade grid/clue/line-yes all share palette index 2
      paletteOverrides: { 3: 0.6 }, // darken line-maybe
    },
  },
  pattern: {
    describeConfig: configFormatter("{width}x{height}"),
    darkMode: {
      paletteOverrides: { 1: false, 2: false }, // white and black squares
    },
  },
  pearl: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty:Easy|Tricky}{allow-unsoluble:|, ambiguous}",
    ),
    darkMode: {
      paletteOverrides: { 0: 1.15, 3: false, 4: false }, // lighten bg, preserve black, white
    },
  },
  pegs: {
    // Note: Cross and Octagon currently allow only specific sizes, all covered
    // by presets. (So any params that don't match a preset will be board-type Random.)
    describeConfig: configFormatter(
      "{board-type:Cross|Octagon|Random} {width}x{height}",
    ),
  },
  range: {
    describeConfig: configFormatter("{width}x{height}"),
    // Range reuses palette colors: black = text = grid.
    // Strict inverted dark mode is fine. (You place white squares rather than black.)
  },
  rect: {
    describeConfig: configFormatter(
      "{width}x{height}{expansion-factor}{ensure-unique-solution:, ambiguous|}",
      {
        "expansion-factor": (value) =>
          Number(value) === 0 ? "" : `, ${percentage(value)} expansion`,
      },
    ),
  },
  rome: {
    describeConfig: configFormatter("{width}x{height} {difficulty:Easy|Normal|Tricky}"),
  },
  salad: {
    describeConfig: (config) => {
      const isNumbers = Number(config["game-mode"]) > 0;
      const size = Number(config.size);
      const symbols = Number(config.symbols);
      const difficulty = Number(config.difficulty) === 0 ? "" : " Extreme";
      const range = isNumbers
        ? `1~${symbols}`
        : `A~${String.fromCharCode(65 + symbols - 1)}`;
      return `${isNumbers ? "Numbers" : "Letters"}: ${size}x${size} ${range}${difficulty}`;
    },
  },
  samegame: {
    describeConfig: configFormatter(
      "{width}x{height}, {no-of-colours} colours{ensure-solubility:, ambiguous|}",
      // Not shown: scoring-system
    ),
    darkMode: {
      paletteSwaps: [[12, 13]], // 3D
    },
  },
  signpost: {
    describeConfig: configFormatter(
      "{width}x{height}{start-and-end-in-corners:, free ends|}",
    ),
  },
  singles: {
    describeConfig: configFormatter("{width}x{height} {difficulty:Easy|Tricky}"),
  },
  sixteen: {
    describeConfig: configFormatter(
      "{width}x{height}",
      // Not shown: number-of-shuffling-moves
    ),
    darkMode: {
      paletteSwaps: [[2, 3]], // 3D
    },
  },
  slant: {
    describeConfig: configFormatter("{width}x{height} {difficulty:Easy|Hard}"),
  },
  slide: {
    darkMode: {
      paletteSwaps: [
        [1, 2], // 3D
        [4, 5], // 3D dragging
        [7, 8], // main block 3D
        [10, 11], // main block 3D dragging
      ],
    },
  },
  sokoban: {
    darkMode: {
      paletteSwaps: [[9, 10]], // 3D
    },
  },
  solo: {
    describeConfig: (config) => {
      const width = Number(config["columns-of-sub-blocks"]);
      const height = Number(config["rows-of-sub-blocks"]);
      const isJigsaw = Boolean(config.jigsaw);
      const isKiller = Boolean(config.killer);
      const isX = Boolean(config.x);
      const difficulty = [
        "Trivial",
        "Basic",
        "Intermediate",
        "Advanced",
        "Extreme",
        "Unreasonable",
      ][Number(config.difficulty)];

      // Replicate preset titles
      const dimensions = isJigsaw ? `${width * height} Jigsaw` : `${width}x${height}`;
      const fullDifficulty = isKiller
        ? difficulty === "Trivial"
          ? "Killer" // "Killer" replaces "Trivial"
          : `Killer ${difficulty}`
        : difficulty;
      return `${dimensions} ${fullDifficulty}${isX ? " X" : ""}`;
      // Not shown: symmetry
    },
    darkMode: {
      paletteOverrides: { 2: 0.8 }, // darken grid
    },
  },
  spokes: {
    describeConfig: configFormatter("{width}x{height} {difficulty:Easy|Tricky|Hard}"),
  },
  sticks: {
    describeConfig: configFormatter(
      "{width}x{height}{percentage-of-black-squares}",
      {
        // Default black squares is "20". Note value is 5-100, not 0.05-1.0.
        "percentage-of-black-squares": (value) =>
          String(value) === "20" ? "" : `, ${value}% black squares`,
      },
      // Not shown: symmetry
    ),
  },
  subsets: {
    // doesn't currently support custom configuration
  },
  tents: {
    describeConfig: configFormatter("{width}x{height} {difficulty:Easy|Tricky}"),
    darkMode: {
      paletteOverrides: { 2: 0.5 }, // darken grass
    },
  },
  towers: {
    describeConfig: configFormatter(
      "{grid-size}x{grid-size} {difficulty:Easy|Hard|Extreme|Unreasonable}",
    ),
  },
  tracks: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty:Easy|Tricky|Hard}",
      // Not shown: disallow-consecutive-1-clues
    ),
  },
  twiddle: {
    describeConfig: (config) => {
      // Replicate preset titles
      const blockSize = Number(config["rotating-block-size"]);
      const blockSizeDescription =
        blockSize === 2
          ? "" // don't show default block size
          : `, rotating ${blockSize}x${blockSize} blocks`;

      const qualifiers: string[] = [];
      if (config["one-number-per-row"]) {
        qualifiers.push("rows only");
      }
      if (config["orientation-matters"]) {
        qualifiers.push("orientable");
      }
      if (!qualifiers.length && !blockSizeDescription) {
        // Only show "normal" if there's no other qualifier or block size
        qualifiers.push("normal");
      }
      const description = qualifiers.length ? ` ${qualifiers.join(", ")}` : "";
      return `${config.width}x${config.height}${description}${blockSizeDescription}`;
      // Not shown: number-of-shuffling-moves
    },
    darkMode: {
      paletteSwaps: [
        [2, 4], // highlight/lowlight 3D
        [3, 5], // gentle highlight/lowlight
        [6, 7], // highcursor/lowcursor
      ],
    },
  },
  undead: {
    describeConfig: configFormatter("{width}x{height} {difficulty:Easy|Normal|Tricky}"),
  },
  unequal: {
    describeConfig: configFormatter(
      "{mode:Unequal|Adjacent}: {size}x{size} {difficulty:Trivial|Easy|Tricky|Extreme|Recursive}",
    ),
  },
  unruly: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty:Trivial|Easy|Normal}{unique-rows-and-columns:|, unique}",
    ),
    darkMode: {
      // preserve "black" and "white" plus their 3D effects
      paletteOverrides: { 3: false, 4: false, 5: false, 6: false, 7: false, 8: false },
    },
  },
  untangle: {
    describeConfig: configFormatter("{number-of-points} points"),
    paletteBgIndex: 1,
  },
};

/**
 * Factory for creating custom ConfigValues formatters from a template string
 * using this basic syntax:
 * - `{field}` substitutes the field value as a string.
 * - `{field:option 0|option 1|...}` coerces the field value to a number and
 *   substitutes the corresponding option string from a pipe-separated list.
 *   (If the value is out of range, the raw value is substituted as a string.)
 *   This syntax also works with boolean(ish) values: `{field:if false|if true}`.
 * - Anything outside {braces} is inserted verbatim.
 * - If the field does not appear in the config (or is undefined), it is not replaced.
 *
 * The customFormats argument can be used to provide additional per-field logic:
 * - If customFormats[field] is an array, it is treated as a list of options.
 *   (This may make the template string more readable for long options lists.)
 * - If customFormats[field] is a function, it is called with
 *   `(value, field, config: ConfigValues)` and should return a string.
 *
 * It is an error to specify both options and customFormats for the same field.
 */
function configFormatter(
  template: string,
  customFormats?: Record<
    string,
    | string[]
    | ((val: string | boolean | number, field: string, config: ConfigValues) => string)
  >,
) {
  return (config: ConfigValues): string =>
    template.replace(
      /\{(?<field>[a-z-]+)(?::(?<options>[^}]*))?}/g,
      (orig, field: string, optionsList?: string): string => {
        const value = config[field];
        if (value === undefined) {
          return orig;
        }
        const custom = customFormats?.[field];
        if (custom !== undefined) {
          if (!import.meta.env.PROD && optionsList !== undefined) {
            throw new Error(`Field '${field}' has both options and customFormats`);
          }
          if (typeof custom === "function") {
            return custom(value, field, config);
          }
          return custom[Number(value)] ?? String(value);
        }
        if (optionsList !== undefined) {
          const options = optionsList.split("|");
          return options[Number(value)] ?? "";
        }
        return String(value);
      },
    );
}

/**
 * Convert ConfigValues value 0.0-1.0 to percentage string
 */
function percentage(value: string | boolean | number) {
  return `${Math.round(Number(value) * 100)}%`;
}
