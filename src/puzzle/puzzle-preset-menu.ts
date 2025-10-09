import type WaButton from "@awesome.me/webawesome/dist/components/button/button.js";
import type WaDropdownItem from "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { cssWATweaks } from "../utils/css.ts";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";
import type { PuzzleCustomParamsDialog } from "./puzzle-config.ts";
import type { PresetMenuEntry } from "./types.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
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

  @property({ type: String })
  appearance?: WaButton["appearance"];

  @property({ type: String })
  variant?: WaButton["variant"];

  @property({ type: Boolean, attribute: "without-icon" })
  withoutIcon = false;

  @property({ type: Boolean, attribute: "without-label" })
  withoutLabel = false;

  @property({ type: String })
  placement: HTMLElementTagNameMap["wa-dropdown"]["placement"] = "bottom";

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
    this.presets = (await this.puzzle?.getPresets(true)) ?? [];
  }

  override render(): TemplateResult {
    return html`
      <wa-dropdown 
          placement=${this.placement}
          @wa-show=${this.handleDropdownShow}
          @wa-after-show=${this.handleDropdownAfterShow}
          @wa-hide=${this.handleDropdownHide}
          @wa-select=${this.handleDropdownSelect}
      >
        <wa-button 
            slot="trigger"
            part="trigger"
            exportparts="base:trigger-base"
            appearance=${this.appearance ?? nothing}
            variant=${this.variant ?? nothing}
            with-caret
        >${this.renderTriggerContent()}</wa-button>
        ${this.renderPresetMenuItems()}
        <slot></slot>
      </wa-dropdown>
    `;
  }

  private renderTriggerContent() {
    if (this.withoutLabel) {
      return html`
        <wa-icon 
            name="puzzle-type" 
            label="${this.label}: ${this.currentGameTypeLabel}"
        ></wa-icon>
      `;
    }

    const labelContentClasses = classMap({
      "dropdown-label-content": true,
      "show-value": this.puzzle !== undefined && !this.open,
    });
    return html`
      ${
        this.withoutIcon
          ? nothing
          : html`<wa-icon slot="start" name="puzzle-type"></wa-icon>`
      }
      <div class="dropdown-label">
        <div class=${labelContentClasses}>
          ${this.label}<br>
          ${this.currentGameTypeLabel}
        </div>
      </div>
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
        result.push(html`<wa-divider></wa-divider>`);
        result.push(html`<h3>${title}</h3>`);
      } else {
        result.push(html`
          <wa-dropdown-item
              type="checkbox"
              role="menuitemradio"
              ?checked=${params === checkedParams}
              value=${params}
            >${title}</wa-dropdown-item>
        `);
      }
    }

    result.push(html`<wa-divider></wa-divider>`);
    result.push(html`
      <wa-dropdown-item 
          type="checkbox"
          role="menuitemradio"
          ?checked=${isCustom} 
          value="#custom"
        >Custom type…</wa-dropdown-item>
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
    const selectedItem = this.shadowRoot?.querySelector<WaDropdownItem>(
      "wa-dropdown-item[checked]",
    );
    if (selectedItem) {
      // Make sure the selectedItem is the only active one,
      // which makes it the starting point for key nav.
      // (WaDropdownItem.active is an @internal, but not private, property.)
      for (const item of this.shadowRoot?.querySelectorAll("wa-dropdown-item") ?? []) {
        item.active = item === selectedItem;
      }
      // Focus scrolls the item into view (without actually showing it focused).
      selectedItem.focus();
    }
  }

  private async handleDropdownSelect(event: CustomEvent<{ item: { value: string } }>) {
    if (!this.puzzle) return;
    const value = event.detail.item.value;
    if (value === "#custom") {
      // wa-dropdown automatically toggles checked, which results in custom getting
      // stuck in checked state even if user cancels dialog or matches some other
      // preset. Undo the automatic checked to prevent that.
      const customItem = this.shadowRoot?.querySelector<WaDropdownItem>(
        'wa-dropdown-item[value="#custom"]',
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
      this.customDialog.addEventListener(
        "puzzle-custom-params-change",
        async (event) => {
          if (Object.keys(event.detail.changes).length > 0) {
            await this.puzzle?.newGame();
          }
        },
      );
      container.appendChild(this.customDialog);
      await this.customDialog.updateComplete;
    } else if (!this.customDialog.open) {
      // Refresh the items for the current params
      await this.customDialog.reloadValues();
    }

    return this.customDialog.show();
  }

  show() {
    const menu = this.shadowRoot?.querySelector("wa-dropdown");
    if (menu) {
      menu.open = true;
    }
  }

  hide() {
    const menu = this.shadowRoot?.querySelector("wa-dropdown");
    if (menu) {
      menu.open = false;
    }
  }

  //
  // Styles
  //
  // TODO: investigate styling active wa-dropdown-item like an sl-select option
  static styles = [
    cssWATweaks,
    css`
      :host {
        display: block;
      }
      
      /* Allow flexing */
      wa-dropdown, wa-button {
        width: 100%;
      }
      wa-button::part(label) {
        flex: 0 1 auto;
        min-width: 1rem;
      }
      wa-button::part(start), wa-button::part(end), wa-button::part(caret) {
        flex: none;
      }
      
      /* Style checked item like a wa-select, except when using keyboard nav. */
      wa-dropdown:not(:has(:focus-visible)) wa-dropdown-item[checked] {
        background-color: var(--wa-color-brand-fill-loud);
        color: var(--wa-color-brand-on-loud);
        opacity: 1;
      }
  
      /* Crop the trigger button's two-line label to display either only one
       * of the menu label or the or its current value at any given time.
       * (Both are always rendered for accessibility.)
        */
      .dropdown-label {
        height: 1lh;
        overflow: hidden;
      }
      .dropdown-label-content {
        width: 100%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
  
        text-align: start;
        transform: translateY(0); /* first line: menu label */
        &.show-value {
          transform: translateY(-50%); /* second line: current value */
        }
        @media (prefers-reduced-motion: no-preference) {
          transition: transform 50ms ease; /* match wa-dropdown animation timing */
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-preset-menu": PuzzlePresetMenu;
  }
}
