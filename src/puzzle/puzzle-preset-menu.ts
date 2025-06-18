import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import type SlMenuItem from "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import { LitElement, type TemplateResult, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { puzzleContext } from "./contexts.ts";
import type { PresetMenuEntry } from "./module.ts";
import type { PuzzleConfig } from "./puzzle-config.ts";
import type { Puzzle } from "./puzzle.ts";

// Register components
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/menu-label/menu-label.js";
import "./puzzle-config.ts";

@customElement("puzzle-preset-menu")
export class PuzzlePresetMenu extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  /**
   * The label for the menu
   */
  @property({ type: String })
  label = "Type";

  // Game presets, with submenus flattened
  @state()
  private presets: PresetMenuEntry[] = [];

  @property({ type: Boolean })
  open = false;

  // TODO: @computed()
  get currentPresetId(): string {
    return this.puzzle?.currentPresetId?.toString() ?? "custom";
  }

  // TODO: @computed()
  get currentPresetLabel(): string {
    const presetId = this.puzzle?.currentPresetId ?? -1;
    const menuEntry = this.presets.find((preset) => preset.id === presetId);
    return menuEntry?.title ?? "Custom type";
  }

  private customDialog?: PuzzleConfig;

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.customDialog) {
      this.customDialog.remove();
      this.customDialog = undefined;
    }
  }

  override async willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzle")) {
      await this.loadPresets();
    }
  }

  private async loadPresets(): Promise<void> {
    // Flatten submenus into presets list (depth first)
    const flatten = (items: PresetMenuEntry[]): PresetMenuEntry[] => {
      return items.flatMap((item) => [
        item,
        ...(item.submenu ? flatten(item.submenu) : []),
      ]);
    };

    const entries = (await this.puzzle?.getPresets()) ?? [];
    this.presets = flatten(entries);
  }

  override render(): TemplateResult {
    return html`
      <sl-dropdown 
          hoist
          @sl-show=${this.handleDropdownShow}
          @sl-after-show=${this.handleDropdownAfterShow}
          @sl-hide=${this.handleDropdownHide}
      >
        <sl-button slot="trigger" caret>
          <sl-icon slot="prefix" name="swatch-book"></sl-icon>
          <div class=${classMap({ "dropdown-label": true, open: this.open })}>
            ${this.label}<br>
            ${this.currentPresetLabel}
          </div>
        </sl-button>
        <sl-menu @sl-select=${this.handleDropdownSelect}>
          ${this.renderPresetMenuItems()}
          <slot></slot>
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderPresetMenuItems(): TemplateResult[] {
    // Items for sl-dropdown menu
    const result: TemplateResult[] = [];
    const currentPresetId = this.currentPresetId;

    for (const { submenu, title, id } of this.presets) {
      if (submenu) {
        result.push(html`<sl-divider></sl-divider>`);
        result.push(html`<sl-menu-label>${title}</sl-menu-label>`);
      } else {
        const idString = id.toString();
        result.push(html`
          <sl-menu-item
              type="checkbox"
              role="menuitemradio"
              ?checked=${idString === currentPresetId}
              value=${idString}
            >${title}</sl-menu-item>
        `);
      }
    }

    result.push(html`<sl-divider></sl-divider>`);
    result.push(html`
      <sl-menu-item 
          type="checkbox"
          role="menuitemradio"
          ?checked=${currentPresetId === "custom"} 
          value="custom"
        >Custom type…</sl-menu-item>
    `);

    return result;
  }

  private async handleDropdownShow() {
    this.open = true;
  }

  private handleDropdownHide() {
    this.open = false;
  }

  private async handleDropdownAfterShow() {
    // Set the current preset's sl-menu-item as the menu's current item. This scrolls
    // it into view and makes it the starting point for arrow key navigation.
    const menu = this.shadowRoot?.querySelector("sl-menu");
    const selectedItem = this.shadowRoot?.querySelector<SlMenuItem>(
      "sl-menu-item[checked]",
    );
    if (menu && selectedItem) {
      menu.setCurrentItem(selectedItem); // (@internal, but not private, SlMenuItem API.)
      selectedItem.focus();
    }
  }

  private async handleDropdownSelect(event: CustomEvent<{ item: { value: string } }>) {
    if (!this.puzzle) return;
    const value = event.detail.item.value;
    if (value === "custom") {
      await this.launchCustomDialog();
    } else {
      const preset = Number.parseInt(value, 10);
      if (preset >= 0 && preset !== this.puzzle.currentPresetId) {
        await this.puzzle.setPreset(preset);
        await this.puzzle.newGame();
      }
    }
  }

  async launchCustomDialog(): Promise<void> {
    if (!this.puzzle) {
      throw new Error("launchCustomDialog() called without a puzzle");
    }

    if (!this.customDialog) {
      const container = this.closest("puzzle-context");
      if (!container) {
        throw new Error("launchCustomDialog() can't find puzzle-context container");
      }
      this.customDialog = document.createElement("puzzle-config");
      this.customDialog.which = 0; // Game configuration
      container.appendChild(this.customDialog);
      await this.customDialog.updateComplete;
    } else if (!this.customDialog.open) {
      // Refresh the items for the current puzzle config
      await this.customDialog.reloadConfigItems();
    }

    return this.customDialog.show();
  }

  show(): Promise<void> {
    const menu =
      this.shadowRoot?.querySelector("sl-dropdown") ??
      this.shadowRoot?.querySelector("sl-select");
    return menu?.show() ?? Promise.resolve();
  }

  hide(): Promise<void> {
    const menu =
      this.shadowRoot?.querySelector("sl-dropdown") ??
      this.shadowRoot?.querySelector("sl-select");
    return menu?.hide() ?? Promise.resolve();
  }

  //
  // Styles
  //
  static styles = css`
    :host {
      display: block;
    }
    
    /* Highlight selected item unless keyboard navigation in use.
     * (See sl-menu-item css.) */
    sl-menu:not(:has(sl-menu-item:focus-visible)) sl-menu-item[checked]::part(base) {
      background-color: var(--sl-color-primary-600);
      color: var(--sl-color-neutral-0) !important;
    }
    
    /* Allow flexing */
    sl-dropdown, sl-button {
      width: 100%;
    }
    sl-button::part(label) {
      flex: 0 1 auto;
      min-width: 1rem;
    }
    sl-button::part(prefix), sl-button::part(suffix), sl-button::part(caret) {
      flex: none;
    }
    .dropdown-label {
      width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    
    /* Crop the trigger button's two-line label to display either only one
     * of the menu label or the or its current value at any given time.
     * (Both are always rendered for accessibility.)
      */
    sl-button::part(label) {
      /*height: calc(var(--sl-input-height-medium) - var(--sl-input-border-width) * 2);*/
      height: 1lh;
      overflow: hidden;
    }
    .dropdown-label {
      text-align: start;
      transform: translateY(-50%); /* second line: current value */
      &.open {
        transform: translateY(0); /* first line: menu label */
      }
      @media (prefers-reduced-motion: no-preference) {
        transition: transform 100ms ease; /* match sl-dropdown animation timing */
      }
    }
    
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-preset-menu": PuzzlePresetMenu;
  }
}
