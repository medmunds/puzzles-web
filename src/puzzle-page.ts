import "./main.ts";

import { navigateToHomePage, type PuzzleUrlParams, parsePuzzleUrl } from "./routing.ts";

// Register components
import "./puzzle-screen.ts";

function initialize({ puzzleId, puzzleParams, puzzleGameId }: PuzzleUrlParams) {
  const appRoot = document.getElementById("app");
  if (!appRoot) {
    throw new Error("Missing #app in puzzle page");
  }

  if (puzzleParams || puzzleGameId) {
    // Strip params we consume from the url
    const url = new URL(window.location.href);
    url.searchParams.delete("type"); // puzzleParams
    url.searchParams.delete("id"); // puzzleGameId
    window.history.replaceState(window.history.state, "", url.href);
  }

  const puzzleScreen = document.createElement("puzzle-screen");
  puzzleScreen.setAttribute("puzzleid", puzzleId);
  if (puzzleParams) {
    puzzleScreen.setAttribute("params", puzzleParams);
  }
  if (puzzleGameId) {
    puzzleScreen.setAttribute("gameid", puzzleGameId);
  }

  appRoot.replaceChildren(puzzleScreen);
}

const urlParams = parsePuzzleUrl();
if (!urlParams?.puzzleId) {
  navigateToHomePage();
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initialize(urlParams));
} else {
  initialize(urlParams);
}
