import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import { LitElement, type TemplateResult, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { puzzleContext } from "./contexts.ts";
import type { PresetMenuEntry } from "./module.ts";
import type { PuzzleConfig } from "./puzzle-config.ts";
import type { Puzzle } from "./puzzle.ts";

// Register components
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/menu-label/menu-label.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "./puzzle-config.ts";

type PresetMenuType = "auto" | "dropdown" | "select";

@customElement("puzzle-preset-menu")
export class PuzzlePresetMenu extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  /**
   * How to render the preset menu (auto, dropdown, or select)
   */
  @property({ type: String })
  type: PresetMenuType = "select";

  /**
   * The label for the menu
   */
  @property({ type: String })
  label = "Type";

  // Game presets, with submenus flattened
  @state()
  private presets: PresetMenuEntry[] = [];

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
    const renderType = this.determineRenderType();
    return renderType === "select" ? this.renderAsSelect() : this.renderAsDropdown();
  }

  private determineRenderType(): PresetMenuType {
    if (this.type !== "auto") {
      return this.type;
    }
    // TODO: this is meant to be container-size based
    return this.presets.length < 10 ? "select" : "dropdown";
  }

  private renderAsDropdown(): TemplateResult {
    return html`
      <sl-dropdown hoist part="dropdown">
        <sl-button slot="trigger" caret>${this.label}</sl-button>
        <sl-menu @sl-select=${this.handleDropdownSelect}>
          ${this.renderPresetMenuItems()}
          <slot></slot>
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderAsSelect(): TemplateResult {
    return html`
      <sl-select 
        part="select"
        label=${this.label}
        value=${this.currentPresetId}
        @sl-change=${this.handleSelectChange}
      >
        ${this.renderPresetOptions()}
        <slot></slot>
      </sl-select>
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
          ?checked=${currentPresetId === "custom"} 
          value="custom"
        >Custom type…</sl-menu-item>
    `);

    return result;
  }

  private renderPresetOptions(): TemplateResult[] {
    // Options for sl-select
    const result: TemplateResult[] = [];

    for (const { submenu, title, id } of this.presets) {
      if (submenu) {
        result.push(html`<sl-divider></sl-divider>`);
        result.push(html`<small>${title}</small>`);
      } else {
        result.push(html`
          <sl-option value=${id.toString()}>${title}</sl-option>
        `);
      }
    }

    result.push(html`<sl-divider></sl-divider>`);
    result.push(html`
      <sl-option @click=${this.launchCustomDialog} value="custom">Custom type…</sl-option>
    `);

    return result;
  }

  private async handleDropdownSelect(event: CustomEvent<{ item: { value: string } }>) {
    const value = event.detail.item.value;
    await this.handlePresetValue(value);
  }

  private async handleSelectChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    await this.handlePresetValue(value);
  }

  private async handlePresetValue(value: string) {
    if (!this.puzzle) return;

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
    /* Move the select label to the left side */
    sl-select::part(form-control) {
      display: flex;
      justify-content: flex-start;
      align-items: baseline;
      gap: var(--sl-spacing-x-small);
    }
    sl-select::part(form-control-input) {
      flex: 1 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-preset-menu": PuzzlePresetMenu;
  }
}
