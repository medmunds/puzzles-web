import "./main.ts";
import { puzzleDataMap } from "./puzzle/catalog.ts";

function randomizePuzzleLink(sectionId: string) {
  // Swap a random puzzle into the xrefs.
  const section = document.getElementById(sectionId);
  if (!section) {
    return;
  }
  const link = section.querySelector<HTMLAnchorElement>('a[href="random-puzzle"]');
  if (link) {
    // Get all ids that aren't otherwise mentioned in the intro
    const puzzleIds = Object.keys(puzzleDataMap)
      .filter((id) => !puzzleDataMap[id].unfinished)
      .filter((id) => !section.querySelector(`a[href="${id}"]`));
    const randomId = puzzleIds[Math.floor(Math.random() * puzzleIds.length)];
    link.href = randomId;
    link.textContent = puzzleDataMap[randomId].name;
  }
}

function initialize() {
  randomizePuzzleLink("xrefs");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
