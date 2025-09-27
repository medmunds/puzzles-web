import "./main.ts";
import { html } from "lit";
import { puzzleDataMap } from "./puzzle/catalog.ts";
import { parsePuzzleUrl } from "./routing.ts";

// Register components
import "./catalog-list.ts";
import "./dynamic-content.ts";

async function showAboutDialog() {
  await import("./about-dialog.ts");
  const dynamicContent = document.querySelector("dynamic-content");
  const dialog = await dynamicContent?.addItem({
    tagName: "about-dialog",
    render: () => html`<about-dialog></about-dialog>`,
  });
  if (dialog && !dialog.open) {
    dialog.open = true;
  }
}

async function interceptHrefClick(event: MouseEvent) {
  if (event.defaultPrevented) {
    // Don't intercept clicks that have already been handled
    return;
  }

  // If the click was within an element with an href (`<a>`, wa-button, etc.),
  // and the href matches a route, intercept it.
  for (const target of event.composedPath()) {
    const href = target instanceof HTMLElement && target.getAttribute("href");
    if (href) {
      const puzzleUrl = parsePuzzleUrl(href);
      if (puzzleUrl?.puzzleId) {
        // Navigate to a puzzle (e.g., from catalog-card click)
        window.location.href = href;
      } else if (href === "#about") {
        event.preventDefault();
        await showAboutDialog();
      }
      // TODO: #settings for settings-dialog
      // TODO: show help-viewer for our help urls
      break; // stop at first element with an href
    }
  }
}

function randomizePuzzleLink() {
  // Swap a random puzzle into the intro.
  const link = document.querySelector<HTMLAnchorElement>(
    '#intro a[href="random-puzzle"]',
  );
  if (link) {
    // Get all ids that aren't otherwise mentioned in the intro
    const puzzleIds = Object.keys(puzzleDataMap)
      .filter((id) => !puzzleDataMap[id].unfinished)
      .filter((id) => !document.querySelector(`#intro a[href="${id}"]`));
    const randomId = puzzleIds[Math.floor(Math.random() * puzzleIds.length)];
    link.href = randomId;
    link.textContent = puzzleDataMap[randomId].name;
  }
}

function initialize() {
  document.addEventListener("click", interceptHrefClick);
  randomizePuzzleLink();
  document.body.classList.add("js-ready");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
