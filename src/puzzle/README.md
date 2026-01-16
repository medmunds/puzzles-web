# Puzzle web components

This directory contains web components (and some related code) for rendering
and playing puzzles:

Components:
- puzzle-context: required wrapper component for any other puzzle components.
  - Provides the reactive `Puzzle` object for descendants (using @lit/context)
- puzzle-view: displays the puzzle and status bar, but doesn't handle user input
  - provides the on-screen canvas for the puzzle drawing API
- puzzle-view-interactive: a subclass of puzzle-view that adds mouse, touch, and keyboard handling
- puzzle-type-menu: implements a "Type" menu as described in section 2.3 of the puzzles documentation
- puzzle-keys: implements a virtual keyboard, undo/redo buttons, and other helpful UI controls
- puzzle-config: implements an extensible dialog for custom game types and preferences

Other code:
- Puzzle class (puzzle.ts): primary interface to the C puzzle from JS
  - Runs in the main thread
  - Proxies puzzle methods to the wasm code running in the worker (using comlink)
  - Exposes puzzle state as reactive properties (using lit-labs/signals)
  - Provides methods for calling useful midend functions exposed by Frontend
- WorkerPuzzle class (worker.ts)
  - Runs in a web worker
  - Loads the Emscripten-generated wasm module for the specified puzzle
  - Manages a C++ `Frontend` object, which provides JS access to the midend functions (using Embind)
  - Implements the required frontend callbacks
- Drawing class (drawing.ts): implements the puzzle drawing API, running in the worker
