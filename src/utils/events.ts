/*
 * Event handling utilities
 */

/**
 * PointerEvent.button values
 */
export enum DOMMouseButton {
  Main = 0, // (includes touch)
  Auxiliary = 1,
  Secondary = 2,
}

/**
 * Swap the Main and Secondary buttons (but leave Auxiliary alone).
 */
export function swapButtons(button: DOMMouseButton): DOMMouseButton {
  switch (button) {
    case DOMMouseButton.Main:
      return DOMMouseButton.Secondary;
    case DOMMouseButton.Secondary:
      return DOMMouseButton.Main;
    default:
      return button; // no change
  }
}

/**
 * Platform detection for macOS and iOS, using userAgent sniffing.
 * **Prefer using feature detection wherever possible.**
 */
export const isAppleDevice =
  // Safari reports "Macintosh" rather than "iPhone" etc.
  // when "Request desktop website" is enabled.
  // Only Chromium supports navigator.userAgentData.platform.
  /(Mac|iPhone|iPad|iPod)/i.test(globalThis.navigator?.userAgent ?? "");

/**
 * Returns true if event has ctrlKey or Apple's Command (⌘) key pressed.
 * (But returns false for generic Meta key or Windows logo/start key.)
 */
export function hasCtrlKey(event: MouseEvent | KeyboardEvent) {
  // macOS and iOS report the Command key as meta.
  // Windows reports the logo key as meta.
  return event.ctrlKey || (isAppleDevice && event.metaKey);
}
