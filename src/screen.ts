import type { WaSelectEvent } from "@awesome.me/webawesome";
import { html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { property, state } from "lit/decorators.js";
import { helpUrl, homePageUrl, isHelpUrl, navigateToHomePage } from "./routing.ts";
import { hasAnyModifier } from "./utils/events.ts";

export class Screen extends LitElement {
  constructor() {
    super();
    this.registerCommandHandlers();
  }

  //
  // Layout and sizing
  //

  @property({ type: String, reflect: true })
  size: "large" | "medium" | "small" = "large";

  @property({ type: String, reflect: true })
  orientation: "horizontal" | "vertical" = "vertical";

  @state()
  protected themeColor?: string;

  protected get compactButtons(): boolean {
    return this.size !== "large";
  }

  protected handleResize = () => {
    if (this.isConnected) {
      // Update layout attrs from token calculations in common.css
      const styles = window.getComputedStyle(this);
      const orientation = styles.getPropertyValue("--app-orientation");
      const size = styles.getPropertyValue("--app-size");
      if (!import.meta.env.PROD) {
        if (orientation !== "horizontal" && orientation !== "vertical") {
          throw new Error(`Unknown --app-orientation='${orientation}'`);
        }
        if (size !== "large" && size !== "medium" && size !== "small") {
          throw new Error(`Unknown --app-size='${size}'`);
        }
      }
      this.orientation = orientation as Screen["orientation"];
      this.size = size as Screen["size"];
    }
  };

  protected captureThemeColor() {
    if (this.isConnected) {
      this.themeColor = window
        .getComputedStyle(this)
        .getPropertyValue("--app-theme-color");
    }
  }

  //
  // Routing and command handling
  //

  // Clicking an element with `data-command="command-name:arg1:arg2..."`
  // or `href="#!command-name:arg1:arg2..."` will invoke the registered
  // handler for command-name. (Clicks are intercepted even into shadow dom.
  // Arguments, if any, are always strings, which allows links like
  // "#settings:data" to open the settings dialog to the data panel.)
  //
  // Subclasses can add to the commandMap in registerCommandHandlers: the handler
  // can be an unbound method of this (called with `this`) or any other function.
  // Return values and exceptions are ignored.
  //
  // Links into help or the home page are also intercepted for internal handling.

  protected commandMap: {
    [name: string]: (...args: string[]) => void | Promise<void>;
  } = {};

  private alreadyHandledCommandTarget?: Element;

  hasCommand(command: string) {
    const [name] = command.split(":", 1);
    return Object.hasOwn(this.commandMap, name);
  }

  protected interceptCommandAndHrefClicks = async (event: MouseEvent) => {
    if (event.defaultPrevented) {
      // Don't intercept clicks that have already been handled
      return;
    }

    // If the click was within an element with an href (`<a>`, wa-button, etc.)
    // or a data-command attribute, intercept it if we can handle it.
    const homePageHref = homePageUrl().href;
    const hasModifier = event instanceof UIEvent && hasAnyModifier(event);
    for (const target of event.composedPath()) {
      if (!(target instanceof HTMLElement)) {
        continue;
      }
      const href = target.getAttribute("href");
      const command = target.getAttribute("data-command");
      if (!import.meta.env.PROD && href && command) {
        throw new Error(
          `Element has both href='${href}' and data-command='${command}'`,
        );
      }
      if (href || command) {
        // De-dupe extra click from handleDropdownSelect (see below)
        if (target === this.alreadyHandledCommandTarget) {
          break;
        }

        if (href === homePageHref) {
          if (!hasModifier) {
            event.preventDefault();
            navigateToHomePage();
          }
          // Otherwise let the browser handle it: click with modifier key
          // typically opens a new tab or window or saves the link
          // rather than navigating the current tab.
        } else if (href && isHelpUrl(href)) {
          if (!hasModifier) {
            event.preventDefault();
            await this.showHelpViewer(href);
          }
        } else {
          const handled = this.handleCommand(command ?? href?.replace(/^#!/, "") ?? "");
          if (handled) {
            event.preventDefault();
          } else if (!import.meta.env.PROD && command) {
            // unknown href is ok, but every data-command should have a handler
            throw new Error(`No registered handler for data-command='${command}'`);
          }
        }
        break; // stop at first element with an href or data-command
      }
    }
  };

  /**
   * Parses command and args; if registered handles command and returns true.
   * Otherwise returns false.
   */
  protected handleCommand(command: string) {
    const [name, ...args] = command.split(":");
    if (Object.hasOwn(this.commandMap, name)) {
      this.commandMap[name].apply(this, args);
      return true;
    }
    return false;
  }

  protected handleDropdownSelect = (event: WaSelectEvent) => {
    // Dropdown items do not send "click" when selected by keyboard nav, so handle
    // them directly. (When activated by mouse wa-select will immediately be followed
    // by a click event, which we de-dupe using alreadyHandledCommandTarget.)
    const command = event.detail.item?.getAttribute("data-command");
    if (command) {
      const handled = this.handleCommand(command);
      if (handled) {
        // Prevent duplicate handling of subsequent click event on mouse activation
        this.alreadyHandledCommandTarget = event.detail.item;
        setTimeout(() => {
          this.alreadyHandledCommandTarget = undefined;
        }, 0);
      } else if (!import.meta.env.PROD && command) {
        throw new Error(`No registered handler for data-command='${command}'`);
      }
    }
  };

  protected registerCommandHandlers() {
    Object.assign(this.commandMap, {
      about: this.showAboutDialog,
      home: navigateToHomePage,
      settings: this.showSettingsDialog,
    });
  }

  //
  // Dynamic content
  //

  @query("dynamic-content")
  protected dynamicContent?: HTMLElementTagNameMap["dynamic-content"];

  protected async showAboutDialog(panel?: string) {
    await import("./about-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "about-dialog",
      render: () => html`<about-dialog></about-dialog>`,
    });
    if (dialog && !dialog.open) {
      dialog.open = true;
    }
    if (dialog && panel) {
      await dialog.updateComplete;
      await dialog.showPanel(panel);
    }
  }

  protected defaultHelpHref: string = helpUrl().href;
  protected defaultHelpLabel: string | undefined = "Help"; // for pages with no <title>

  protected async showHelpViewer(href?: string) {
    await import("./help-viewer.ts");
    const helpViewer = await this.dynamicContent?.addItem({
      tagName: "help-viewer",
      render: () => html`
        <help-viewer 
            src=${href ?? this.defaultHelpHref} 
            label=${this.defaultHelpLabel ?? nothing}
        ></help-viewer>
      `,
    });
    if (helpViewer) {
      if (href) {
        helpViewer.src = href;
      }
      helpViewer.show();
    }
  }

  protected async showSettingsDialog(panel?: string) {
    await import("./settings-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "settings-dialog",
      render: () => html`<settings-dialog></settings-dialog>`,
    });
    if (dialog && !dialog.open) {
      await dialog.show();
    }
    if (dialog && panel) {
      await dialog.updateComplete;
      await dialog.showPanel(panel);
    }
  }

  //
  // Lifecycle
  //

  override connectedCallback() {
    super.connectedCallback();
    // TODO: needs to be a resize observer on `this` to catch dvh/dvw changes
    //   (for puzzle-screen, but not for home-screen)
    window.addEventListener("resize", this.handleResize);
    this.addEventListener("click", this.interceptCommandAndHrefClicks);
    this.addEventListener("wa-select", this.handleDropdownSelect);

    // Get initial values
    this.handleResize();
    this.captureThemeColor();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("resize", this.handleResize);
    this.removeEventListener("click", this.interceptCommandAndHrefClicks);
    this.removeEventListener("wa-select", this.handleDropdownSelect);
  }

  protected override updated() {
    if (!import.meta.env.PROD && this.isConnected && !this.dynamicContent) {
      throw new Error("Screen subclass must render <dynamic-content> element");
    }
  }
}
