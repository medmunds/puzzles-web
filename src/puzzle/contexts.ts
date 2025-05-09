import { createContext } from "@lit/context";
import type { Puzzle } from "./puzzle.ts";

// Create a context for the Puzzle instance
export const puzzleContext = createContext<Puzzle>("puzzle-context");
