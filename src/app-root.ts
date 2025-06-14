import { registerIconLibrary } from "@shoelace-style/shoelace/dist/utilities/icon-library.js";
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { puzzles } from "./assets/catalog.json";
import type { PuzzleDataMap } from "./catalog.ts";

// Register components (note some are lazy-loaded)
import "./catalog-screen.ts";

const puzzleData: Readonly<PuzzleDataMap> = puzzles;

// TODO: bundle necessary icons (this is just for easier development)
registerIconLibrary("default", {
  resolver: (name) =>
    `https://cdn.jsdelivr.net/npm/lucide-static@0.511.0/icons/${name}.svg`,
});

export interface Route {
  name: string;
  params: Record<string, string | boolean | null | undefined>;
}

interface NavigationState {
  route: Route;
  previousRoute?: Route;
}

const isNavigationState = (obj: unknown): obj is NavigationState =>
  typeof obj === "object" &&
  obj !== null &&
  "route" in obj &&
  typeof obj.route === "object";

@customElement("app-root")
export class AppRoot extends LitElement {
  public defaultRoute: Route = { name: "catalog", params: {} };

  public baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);

  @state()
  private route?: Route;

  constructor() {
    super();
    this.route = this.matchRoute(window.location.href); // initial route
    if (this.route?.name === "puzzle") {
      // Get a head start on the lazy-loaded puzzle-screen component.
      import("./puzzle-screen.ts");
    }
  }

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("popstate", this.handlePopState);
    this.addEventListener("click", this.interceptHrefClick);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this.handlePopState);
    this.removeEventListener("click", this.interceptHrefClick);
  }

  /**
   * Returns the Route (if any) matching href.
   * href may be relative to the current page or absolute.
   */
  public matchRoute(href: string): Route | undefined {
    const url = new URL(href, window.location.href);
    if (
      url.origin !== this.baseUrl.origin ||
      !url.pathname.startsWith(this.baseUrl.pathname)
    ) {
      return;
    }

    // Global search params
    const params = { debug: url.searchParams.has("debug") };

    // We only have two routes to match, so this is not fancy:
    //   "catalog" (/ or /index or /index.html)
    //   "puzzle" (/:puzzleType)
    const path = url.pathname
      // Remove baseUrl pathname
      .slice(this.baseUrl.pathname.length)
      // Strip leading/trailing slashes and trailing .html
      .replace(/^\/+/, "")
      .replace(/(\/+|\.html)$/, "");
    switch (path) {
      case "":
      case "index":
        return {
          name: "catalog",
          params: { ...params, showUnfinished: url.searchParams.has("unfinished") },
        };
      default:
        if (puzzleData[path]) {
          return {
            name: "puzzle",
            params: {
              ...params,
              // Yes, this is confusing: the url is /:puzzleType?type=:puzzleParams
              // (e.g., "/blackbox?type=3")
              puzzleType: path,
              puzzleParams: url.searchParams.get("type"),
            },
          };
        }
    }
    return undefined;
  }

  /**
   * Returns the canonicalized URL that will navigate to route.
   */
  public reverse(route: Route): URL {
    let path: string;
    const searchParams = new URLSearchParams();
    switch (route.name) {
      case "catalog":
        path = "";
        if (route.params.showUnfinished) {
          searchParams.append("unfinished", "");
        }
        break;
      case "puzzle":
        if (typeof route.params.puzzleType !== "string") {
          throw new Error(`Invalid puzzle type "${route.params.puzzleType}"`);
        }
        path = route.params.puzzleType;
        if (route.params.puzzleParams) {
          searchParams.append("type", route.params.puzzleParams.toString());
        }
        break;
      default:
        throw new Error(`Unknown route name ${route.name}`);
    }

    // Debug is a global param that persists into all routes
    if (route.params.debug || this.route?.params?.debug) {
      searchParams.append("debug", "");
    }

    const url = new URL(path, this.baseUrl);
    if (searchParams.size > 0) {
      // Simplify boolean params: "?bool1=&str=foo&bool2=" --> "?bool1&str=foo&bool2"
      url.search = searchParams.toString().replace(/=(?=&|$)/g, "");
    }
    return url;
  }

  /**
   * Navigates to the given url or route.
   * url can be relative to the router's baseUrl, or absolute.
   * An url that doesn't match any route will navigate out of the app.
   */
  public navigate(urlOrRoute: string | URL | Route, replaceState = false) {
    const resolvedUrl =
      typeof urlOrRoute === "string" || urlOrRoute instanceof URL
        ? new URL(urlOrRoute, this.baseUrl)
        : this.reverse(urlOrRoute);
    const targetRoute =
      typeof urlOrRoute === "string" || urlOrRoute instanceof URL
        ? this.matchRoute(resolvedUrl.href)
        : urlOrRoute;

    if (!targetRoute) {
      // Not one of our routes, let the browser handle it
      window.location.href = resolvedUrl.href;
      return;
    }

    // Special case: treat navigating to catalog as "back" if possible
    if (
      !replaceState &&
      targetRoute.name === this.defaultRoute.name &&
      this.currentNavigationState?.previousRoute?.name === targetRoute.name
    ) {
      window.history.back(); // (causes popstate; we'll update this.route then)
      return;
    }

    // Regular navigation using pushState/replaceState
    const newState: NavigationState = {
      route: { ...targetRoute },
      previousRoute: this.route ? { ...this.route } : undefined,
    };
    if (replaceState) {
      window.history.replaceState(newState, "", resolvedUrl);
    } else {
      window.history.pushState(newState, "", resolvedUrl);
    }
    this.route = targetRoute;
  }

  private get currentNavigationState(): NavigationState | undefined {
    return isNavigationState(window.history.state) ? window.history.state : undefined;
  }

  private handlePopState = (_event: PopStateEvent) => {
    // When user uses browser back/forward, update our route
    // TODO: restore other information from state (e.g., scroll position?)
    this.route = this.matchRoute(window.location.href);
  };

  private interceptHrefClick = (event: MouseEvent) => {
    if (event.defaultPrevented) {
      // Don't intercept clicks that have already been handled
      return;
    }

    // If the click was within an element with an href (`<a>`, sl-button, etc.),
    // and the href matches a route, intercept it.
    for (const target of event.composedPath()) {
      const href = target instanceof HTMLElement && target.getAttribute("href");
      if (href) {
        const route = this.matchRoute(href);
        if (route) {
          event.preventDefault();
          this.navigate(route);
        } // else it's not one of our routes, so let the browser handle it
        break; // stop at first element with an href
      }
    }
  };

  override render() {
    const { name, params } = this.route ?? this.defaultRoute;
    switch (name) {
      case "catalog":
        return html`
          <catalog-screen
              .router=${this}
              ?show-unfinished=${params.showUnfinished}
              ?debug=${params.debug}
          ></catalog-screen>
        `;
      case "puzzle":
        // Lazy load the puzzle-screen component when needed.
        // TODO: use lit task for loading
        import("./puzzle-screen.ts");
        return html`
          <puzzle-screen 
              .router=${this} 
              puzzle-type=${params.puzzleType} 
              puzzle-params=${params.puzzleParams ?? ""}
              ?debug=${params.debug}
            ></puzzle-screen>
        `;
      default:
        throw new Error(`Unknown route name ${name}`);
    }
  }

  static styles = css`
    :host {
      display: contents;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "app-root": AppRoot;
  }
}
