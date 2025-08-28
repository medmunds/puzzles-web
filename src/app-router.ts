import * as Sentry from "@sentry/browser";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { puzzleDataMap } from "./catalog.ts";

// Register components (note some are lazy-loaded)
import "./catalog-screen.ts";

export interface Route {
  name: string;
  params: Record<string, string | boolean | null | undefined>;
}

interface HistoryState {
  route: Route;
  previousRoute?: Route;
}

const isObject = (obj: unknown): obj is object =>
  typeof obj === "object" && obj !== null;

const isHistoryState = (obj: unknown): obj is HistoryState =>
  isObject(obj) && "route" in obj && isObject(obj.route);

@customElement("app-router")
export class AppRouter extends LitElement {
  public defaultRoute: Route = { name: "catalog", params: {} };

  public baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);

  @state()
  private route?: Route;

  constructor() {
    super();
    this.initState(); // initial route
    if (this.route?.name === "puzzle") {
      // Get a head start on the lazy-loaded puzzle-screen component.
      import("./puzzle-screen.ts");
    }
  }

  private get currentHistoryState(): HistoryState | undefined {
    return isHistoryState(window.history.state) ? window.history.state : undefined;
  }

  private initState(): void {
    this.route = this.matchRoute(window.location.href);
    if (this.route && !this.currentHistoryState) {
      const canonicalUrl = this.reverse(this.route);
      const other = isObject(window.history.state) ? window.history.state : undefined;
      const initialState: HistoryState = {
        ...other,
        route: this.route,
      };
      window.history.replaceState(initialState, "", canonicalUrl);
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
    const params = {
      console: url.searchParams.has("console"),
      debug: url.searchParams.has("debug"),
    };

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
          params,
        };
      default:
        if (puzzleDataMap[path]) {
          return {
            name: "puzzle",
            params: {
              ...params,
              // Yes, this is confusing: the url is /:puzzleType?type=:puzzleParams
              // (e.g., "/blackbox?type=3")
              puzzleType: path,
              puzzleParams: url.searchParams.get("type"),
              puzzleGameId: url.searchParams.get("id"),
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
        break;
      case "puzzle":
        if (typeof route.params.puzzleType !== "string") {
          throw new Error(`Invalid puzzle type "${route.params.puzzleType}"`);
        }
        path = route.params.puzzleType;
        if (route.params.puzzleGameId) {
          // puzzleGameId includes puzzle params, so supersedes `type` param
          searchParams.append("id", route.params.puzzleGameId.toString());
        } else if (route.params.puzzleParams) {
          searchParams.append("type", route.params.puzzleParams.toString());
        }
        break;
      default:
        throw new Error(`Unknown route name ${route.name}`);
    }

    // Debug and console are global params that persist into all routes
    if (route.params.console || this.route?.params?.console) {
      searchParams.append("console", "");
    }
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
   *
   * If replace is true (and url or route is within the app),
   * replaces the current history state.
   */
  public navigate(urlOrRoute: string | URL | Route, replace = false) {
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
      !replace &&
      targetRoute.name === this.defaultRoute.name &&
      this.currentHistoryState?.previousRoute?.name === targetRoute.name
    ) {
      window.history.back(); // (causes popstate; we'll update this.route then)
      return;
    }

    const newState: HistoryState = { route: targetRoute };
    const previousRoute = replace
      ? this.currentHistoryState?.previousRoute
      : this.route;
    if (previousRoute) {
      newState.previousRoute = previousRoute;
    }

    if (replace) {
      window.history.replaceState(newState, "", resolvedUrl);
    } else {
      window.history.pushState(newState, "", resolvedUrl);
    }
    this.route = targetRoute;
  }

  private handlePopState = () => {
    this.route = this.matchRoute(window.location.href);
  };

  private interceptHrefClick = (event: MouseEvent) => {
    if (event.defaultPrevented) {
      // Don't intercept clicks that have already been handled
      return;
    }

    // If the click was within an element with an href (`<a>`, wa-button, etc.),
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
        if (import.meta.env.VITE_SENTRY_DSN) {
          Sentry.setTag("screen", "catalog");
        }
        return html`
          <catalog-screen
              .router=${this}
              ?debug=${params.debug}
          ></catalog-screen>
        `;
      case "puzzle":
        if (import.meta.env.VITE_SENTRY_DSN) {
          Sentry.setTag("screen", `puzzle/${params.puzzleType}`);
        }
        // Lazy load the puzzle-screen component when needed.
        // TODO: use lit task for loading
        import("./puzzle-screen.ts");
        return html`
          <puzzle-screen 
              .router=${this} 
              puzzle-type=${params.puzzleType} 
              puzzle-gameid=${params.puzzleGameId ?? nothing}
              puzzle-params=${params.puzzleParams ?? nothing}
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
    "app-router": AppRouter;
  }
}
