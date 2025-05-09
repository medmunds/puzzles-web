# Puzzle web components

This directory contains web components (and some related code) for rendering
and playing puzzles:

Components:
- puzzle-context: required wrapper component for any other puzzle components.
  - Provides the reactive `Puzzle` object for descendants (using @lit/context)
- puzzle-view: displays the puzzle and status bar, but doesn't handle user input
  - provides the on-screen canvas for the puzzle drawing API
- puzzle-view-interactive: a subclass of puzzle-view that adds mouse, touch, and keyboard handling
- puzzle-game-menu: implements a "Game" menu as described in section 2.1 of the puzzles documentation
- puzzle-preset-menu: implements a "Type" menu as described in section 2.3 of the puzzles documentation
- puzzle-keys: implements a virtual keyboard, undo/redo buttons, and other helpful UI controls
- puzzle-display-name: renders the puzzle's display name (e.g., "Black Box" for blackbox)
- puzzle-config: implements an extensible dialog for custom game types and preferences

Other code:
- Puzzle class (puzzle.ts): primary interface to the C puzzle from JS
  - Loads the Emscripten-generated wasm module for the specified puzzle
  - Manages a C++ `Frontend` object, which provides JS access to the midend functions (using Embind)
  - Exposes puzzle state as reactive properties (using lit-labs/signals)
  - Provides methods for calling useful midend functions exposed by Frontend
  - Implements the required frontend callbacks
  - (Will eventually be relocated to a Worker, so all methods are async)
- Drawing class (drawing.ts): implements the puzzle drawing API
