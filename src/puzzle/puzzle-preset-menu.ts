import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import type SlMenuItem from "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import { LitElement, type TemplateResult, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { puzzleContext } from "./contexts.ts";
import type { PuzzleCustomParamsDialog } from "./puzzle-config.ts";
import type { Puzzle } from "./puzzle.ts";
import type { PresetMenuEntry } from "./types.ts";

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

  // Description of the params for the current game (or "Custom" if unknown).
  get currentGameTypeLabel(): string {
    // (This should be computed, but lit-labs/signals @computed
    // doesn't react to changes in Lit's reactive @state.)
    const params = this.puzzle?.currentParams ?? "";
    const menuEntry = this.presets.find((preset) => preset.params === params);
    return menuEntry?.title ?? "Custom type";
  }

  private customDialog?: PuzzleCustomParamsDialog;

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
          <sl-icon slot="prefix" name="puzzle-type"></sl-icon>
          <div class=${classMap({ "dropdown-label": true, open: this.open })}>
            ${this.label}<br>
            ${this.currentGameTypeLabel}
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
    const result: TemplateResult[] = [];
    // Show the checkmark by params that will be used for the next "new game".
    // (This may not match "currentParams" after loading a game by id, or after
    // undoing into an earlier game with different params.)
    const checkedParams = this.puzzle?.params;
    const isCustom = !this.presets.some((preset) => preset.params === checkedParams);

    for (const { submenu, title, params } of this.presets) {
      if (submenu) {
        result.push(html`<sl-divider></sl-divider>`);
        result.push(html`<sl-menu-label>${title}</sl-menu-label>`);
      } else {
        result.push(html`
          <sl-menu-item
              type="checkbox"
              role="menuitemradio"
              ?checked=${params === checkedParams}
              value=${params}
            >${title}</sl-menu-item>
        `);
      }
    }

    result.push(html`<sl-divider></sl-divider>`);
    result.push(html`
      <sl-menu-item 
          type="checkbox"
          role="menuitemradio"
          ?checked=${isCustom} 
          value="#custom"
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
    if (value === "#custom") {
      // sl-menu automatically toggles checked, which results in custom getting
      // stuck in checked state even if user cancels dialog or matches some other
      // preset. Undo the automatic checked to prevent that.
      const customItem = this.shadowRoot?.querySelector<SlMenuItem>(
        'sl-menu-item[value="#custom"]',
      );
      if (customItem) {
        customItem.checked = false;
      }
      await this.launchCustomDialog();
    } else {
      if (value !== this.puzzle.currentParams) {
        const error = await this.puzzle.setParams(value);
        if (error) {
          // This shouldn't happen: the presets list shouldn't include invalid params.
          throw new Error(`Error on setParams to preset "${value}": ${error}`);
        }
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
      this.customDialog = document.createElement("puzzle-custom-params-dialog");
      this.customDialog.addEventListener("puzzle-custom-params-change", (event) => {
        if (Object.keys(event.detail.changes).length > 0) {
          this.puzzle?.newGame();
        }
      });
      container.appendChild(this.customDialog);
      await this.customDialog.updateComplete;
    } else if (!this.customDialog.open) {
      // Refresh the items for the current params
      await this.customDialog.reloadValues();
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
