import { computed, signal } from "@lit-labs/signals";
import { effect } from "signal-utils/subtle/microtask-effect";
import { settings } from "./store/settings";

const systemColorScheme = signal<"light" | "dark">("light");

/**
 * Reactive color scheme currently active: a signal whose value is either
 * "light" or "dark". (Resolves "system" setting to current user preference.
 * Unstable until after initializeColorScheme.)
 */
export const currentColorScheme = computed(() => {
  const settingsScheme = settings.colorScheme; // reads signal
  return settingsScheme === "system" ? systemColorScheme.get() : settingsScheme;
});

/**
 * Maintains currentColorScheme and <html class="wa-dark"> based on reactive
 * settings.colorScheme and user's system preference. See also color-scheme-init.ts
 * for early (pre-render, pre-settings) initialization from localStorage.
 *
 * Returns a disposer. (Not necessary in the app, but useful for testing.)
 */
export async function initializeColorScheme() {
  await settings.loaded;

  // Maintain systemColorScheme based on user preference
  const prefersDarkMode = window.matchMedia("(prefers-color-scheme: dark)");
  systemColorScheme.set(prefersDarkMode.matches ? "dark" : "light");
  const updateSystemColorScheme = (event: MediaQueryListEvent) =>
    systemColorScheme.set(event.matches ? "dark" : "light");
  prefersDarkMode.addEventListener("change", updateSystemColorScheme);

  // Maintain wa-dark class based on currentColorScheme
  const disposeEffect = effect(() => {
    const isDark = currentColorScheme.get() === "dark";
    document.documentElement.classList.toggle("wa-dark", isDark);
  });

  return () => {
    prefersDarkMode.removeEventListener("change", updateSystemColorScheme);
    disposeEffect();
  };
}
