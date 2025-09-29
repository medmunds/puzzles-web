import "./main.ts";
import { html } from "lit";
import { puzzleDataMap } from "./puzzle/catalog.ts";
import { parsePuzzleUrl } from "./routing.ts";
import { clamp } from "./utils/math.ts";

// Register components
import "./catalog-list.ts";
import "./dynamic-content.ts";

/**
 * Emulate animation-timeline: scroll() for our CSS shrinking header animations
 * in browsers that don't support it. This assumes that in those browsers,
 * the CSS animations:
 *   - are installed as ordinary animations in "paused" state
 *   - have a duration of 1000ms
 *   - have names starting with "scroll-"
 */
function setupScrollAnimationFallback(scrollContainerSelector: string = "html") {
  if (CSS.supports("animation-timeline: scroll()")) {
    return; // Native support available, no fallback needed
  }

  const scrollElement = document.querySelector(scrollContainerSelector);
  if (!scrollElement) {
    throw new Error(`Couldn't find ${scrollContainerSelector}`);
  }

  // <html> element scroll events are delivered to the document, not the element
  const scrollListener =
    scrollElement === document.documentElement ? document : scrollElement;

  const header = document.querySelector("header");
  if (!header) {
    throw new Error("header is missing");
  }

  const rangeEndStr = window
    .getComputedStyle(header)
    .getPropertyValue("--scroll-range-end");
  let rangeEnd = Number.parseFloat(rangeEndStr);
  if (Number.isNaN(rangeEnd) || rangeEnd <= 0) {
    console.warn(`Couldn't parse --scroll-range-end=${rangeEndStr}`);
    rangeEnd = 120;
  }

  const animationDuration = 1000; // all css animations are set to this duration

  function updateScrollAnimation() {
    if (!header || !scrollElement) {
      return;
    }
    const scrollY = scrollElement.scrollTop ?? 0;
    const currentTime = clamp(
      0,
      (animationDuration * scrollY) / rangeEnd,
      animationDuration,
    );
    const animations = header
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation instanceof CSSAnimation &&
          animation.animationName.startsWith("scroll-"),
      );
    for (const animation of animations) {
      animation.currentTime = currentTime;
    }
  }

  scrollListener.addEventListener("scroll", updateScrollAnimation, { passive: true });

  // Get initial state. pageshow covers scroll position restoration after navigation.
  updateScrollAnimation();
  window.addEventListener("pageshow", updateScrollAnimation, { once: true });
}

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
  document.addEventListener("click", interceptHrefClick);
  randomizePuzzleLink("xrefs");
  setupScrollAnimationFallback();
  document.body.classList.add("js-ready");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
