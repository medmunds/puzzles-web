// This gets placed in a <script> tag in the <head>, to ensure the dark mode
// class is in place before initial render (preventing a flash of white).
// It should be as tight as possible and must not rely on async access.
// Based on suggestions in https://github.com/shoelace-style/webawesome/issues/1304.
// (It's minified in vite.config.ts; you must restart the dev server to see changes.)
// See color-scheme.ts for the runtime reactive logic.

// change default to null when dark mode is no longer experimental
const defaultIsDark = false;
let isDark: boolean | null = defaultIsDark;

try {
  isDark =
    localStorage.colorScheme === undefined
      ? defaultIsDark
      : ((
          {
            dark: true,
            light: false,
            system: null,
          } as Record<string, boolean | null>
        )[localStorage.colorScheme] ?? null);
} catch {} // Ignore privacy manager errors

if (isDark === null) {
  isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
}
document.documentElement.classList.toggle("wa-dark", isDark);
