import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { puzzleDataMap } from "./catalog.ts";

// Register components (note some are lazy-loaded)
import "./catalog-screen.ts";

export interface Route {
  name: string;
  params: Record<string, string | boolean | null | undefined>;
}

export interface HistoryStateProvider {
  saveHistoryState: () => unknown;
  restoreHistoryState: (state: unknown) => void;
}

interface HistoryState {
  route: Route;
  previousRoute?: Route;
  providerStates: Record<string, unknown>;
}

const isHistoryState = (obj: unknown): obj is HistoryState =>
  typeof obj === "object" &&
  obj !== null &&
  "route" in obj &&
  typeof obj.route === "object";

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
      const initialState: HistoryState = {
        route: this.route,
        providerStates: {},
      };
      window.history.replaceState(initialState, "", canonicalUrl);
    }
  }

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("pagehide", this.handlePageHide);
    window.addEventListener("popstate", this.handlePopState);
    this.addEventListener("click", this.interceptHrefClick);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("pagehide", this.handlePageHide);
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
        if (puzzleDataMap[path]) {
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
  public navigate(urlOrRoute: string | URL | Route) {
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

    // Capture current provider states before in-page navigation
    this.saveAllProviderStates();

    // Special case: treat navigating to catalog as "back" if possible
    if (
      targetRoute.name === this.defaultRoute.name &&
      this.currentHistoryState?.previousRoute?.name === targetRoute.name
    ) {
      window.history.back(); // (causes popstate; we'll update this.route then)
      return;
    }

    const newState: HistoryState = {
      route: { ...targetRoute },
      previousRoute: this.route ? { ...this.route } : undefined,
      providerStates: {},
    };
    window.history.pushState(newState, "", resolvedUrl);
    this.route = targetRoute;
  }

  private handlePopState = async () => {
    this.route = this.matchRoute(window.location.href);
    await this.updateComplete;
    this.restoreAllProviderStates();
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

  /*
   * State providers: other components that contribute to history state
   */

  private stateProviders = new Map<string, HistoryStateProvider>();

  /**
   * Register a component that wants to contribute to history state.
   * Its restoreHistoryState() will be called immediately if there is current state
   * available for the given key.
   */
  public registerStateProvider(key: string, provider: HistoryStateProvider) {
    this.stateProviders.set(key, provider);
  }

  /**
   * Unregister a state provider.
   */
  public unregisterStateProvider(key: string) {
    this.stateProviders.delete(key);
  }

  private handlePageHide = () => {
    this.saveAllProviderStates();
  };

  private handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      this.saveAllProviderStates();
    }
  };

  private saveAllProviderStates() {
    const currentState = this.currentHistoryState;
    if (!currentState) {
      throw new Error("Missing currentHistoryState in saveAllProviderStates");
    }
    const newState: HistoryState = {
      ...currentState,
      providerStates: {},
    };
    for (const [key, provider] of this.stateProviders) {
      newState.providerStates[key] = provider.saveHistoryState();
    }
    window.history.replaceState(newState, "", window.location.href);
  }

  private restoreAllProviderStates() {
    const savedState = this.currentHistoryState?.providerStates;
    if (savedState) {
      for (const [key, provider] of this.stateProviders) {
        if (key in savedState) {
          provider.restoreHistoryState(savedState[key]);
        }
      }
    }
  }

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
    "app-router": AppRouter;
  }
}
