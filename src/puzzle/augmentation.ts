/**
 * Additional puzzle-specific metadata and functionality
 * that isn't (currently) possible in the C code
 */

import type { ConfigValues, PuzzleId } from "./types.ts";

export interface PuzzleAugmentations {
  /**
   * Construct a human-readable description of the given puzzle configuration.
   *
   * The implementations here try to follow the style of the existing preset titles
   * for the same puzzle. (Capitalization and punctuation seems to vary quite a bit
   * between puzzles.) Use British spelling to match the existing presets.
   */
  describeConfig?: (config: ConfigValues) => string;
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
  },
  boats: {
    describeConfig: configFormatter(
      "{width}x{height}, size {fleet-size} {difficulty:Easy|Normal|Tricky|Hard}{remove-numbers:|, hidden clues}",
      // Not shown: fleet-configuration
    ),
  },
  bricks: {
    describeConfig: configFormatter("{width}x{height} {difficulty:Easy|Normal|Tricky}"),
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
  },
  galaxies: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty:Normal|Unreasonable}",
    ),
  },
  guess: {
    describeConfig: configFormatter(
      "{pegs-per-guess}x{guesses}, {colours} colours{allow-blanks:| + blank}{allow-duplicates:, no duplicates|}",
    ),
  },
  inertia: {
    describeConfig: configFormatter("{width}x{height}"),
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
    ),
    // Not shown: symmetry
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
  },
  mosaic: {
    // Note: settings config lists "Height" before "Width"
    describeConfig: configFormatter(
      "Size: {width}x{height}",
      // Not shown: aggressive-generation-longer
    ),
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
  },
  pattern: {
    describeConfig: configFormatter("{width}x{height}"),
  },
  pearl: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty:Easy|Tricky}{allow-unsoluble:|, ambiguous}",
    ),
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
  },
  slant: {
    describeConfig: configFormatter("{width}x{height} {difficulty:Easy|Hard}"),
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
  },
  untangle: {
    describeConfig: configFormatter("{number-of-points} points"),
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
