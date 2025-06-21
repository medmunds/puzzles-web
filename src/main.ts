import { registerIconLibrary } from "@shoelace-style/shoelace/dist/utilities/icon-library.js";

// Register components (that are used directly by index.html)
import "./app-router";

// TODO: bundle necessary icons (this is just for easier development)
registerIconLibrary("default", {
  resolver: (name) =>
    `https://cdn.jsdelivr.net/npm/lucide-static@0.511.0/icons/${name}.svg`,
});
