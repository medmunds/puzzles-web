import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import type SlDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import { when } from "lit/directives/when.js";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";
import type { ConfigDescription, ConfigItem, ConfigValues } from "./types.ts";

// Register components
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/checkbox/checkbox.js";
import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/radio-button/radio-button.js";
import "@shoelace-style/shoelace/dist/components/radio-group/radio-group.js";

const isNumeric = (value: unknown) =>
  typeof value === "number" || (typeof value === "string" && /[0-9]+/.test(value));

interface PuzzleConfigChangeDetail {
  puzzle: Puzzle;
  changes: ConfigValues;
  value: ConfigValues;
}
export type PuzzleConfigChangeEvent = CustomEvent<PuzzleConfigChangeDetail>;

/**
 * Common code for configuration dialogs.
 * Must be used within a puzzle-context component.
 */
abstract class PuzzleConfig extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  protected puzzle?: Puzzle;

  /**
   * The label for the submit button
   */
  @property({ type: String })
  submitLabel = "Apply";

  /**
   * The label for the cancel button
   */
  @property({ type: String })
  cancelLabel = "Cancel";

  /**
   * The title for the dialog; taken from the config title by default
   */
  @property({ type: String })
  dialogTitle = "Configure puzzle";

  // Expose dialog's open property
  get open() {
    return this.dialog?.open ?? false;
  }
  set open(isOpen: boolean) {
    if (isOpen) {
      this.dialog?.show();
    } else {
      this.dialog?.hide();
    }
  }

  @query("sl-dialog")
  protected dialog?: SlDialog;

  @state()
  protected config?: ConfigDescription;

  @state()
  protected values: ConfigValues = {};

  @state()
  protected changes: ConfigValues = {};

  @state()
  protected error?: string;

  protected abstract submitEventType: string;
  protected abstract getConfig(): Promise<ConfigDescription | undefined>;
  protected abstract getValues(): Promise<ConfigValues>;
  protected abstract setValues(values: ConfigValues): Promise<string | undefined>;

  protected async loadConfig(): Promise<void> {
    this.config = await this.getConfig();
    this.dialogTitle = this.config?.title || "";
    await this.loadValues();
  }

  protected async loadValues() {
    this.values = await this.getValues();
    this.changes = {};
    this.error = undefined;
  }

  protected override async willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzle") && this.puzzle) {
      await this.loadConfig();
    }
  }

  override render() {
    return html`
      <sl-dialog 
          label=${this.dialogTitle} 
          @sl-request-close=${this.handleDialogRequestClose}
      >
        ${when(this.error, () => html`<div part="error">${this.error}</div>`)}

        <form part="form" @submit=${this.handleSubmit}>
          ${Object.entries(this.config?.items ?? {}).map(([id, config]) => this.renderConfigItem(id, config))}
        </form>

        <div slot="footer" part="footer">
          <sl-button variant="primary" @click=${this.handleSubmit}>${this.submitLabel}</sl-button>
          <sl-button @click=${this.handleCancel}>${this.cancelLabel}</sl-button>
        </div>
      </sl-dialog>
    `;
  }

  private renderConfigItem(id: string, config: ConfigItem) {
    const value = this.changes[id] ?? this.values[id];
    switch (config.type) {
      case "string":
        return html`
          <sl-input
            id=${id}
            inputmode=${isNumeric(value) ? "decimal" : "text"}
            label=${config.name}
            value=${value}
            @sl-focus=${this.autoSelectInput}
            @sl-change=${this.updateTextValue}
          ></sl-input>
        `;

      case "boolean":
        return html`
          <sl-checkbox 
            id=${id}
            ?checked=${value}
            @sl-change=${this.updateCheckboxValue}
          >${config.name}</sl-checkbox>
        `;

      case "choices":
        if (config.choicenames.length <= 3) {
          // Render small option sets as a radio button group rather than a select popup
          return html`
            <sl-radio-group
              id=${id}
              label=${config.name}
              value=${value}
              @sl-change=${this.updateSelectValue}
            >
              ${config.choicenames.map(
                (choice, value) => html`
                <sl-radio-button value=${value}>${choice}</sl-radio-button>`,
              )}
            </sl-radio-group>
          `;
        }
        return html`
          <sl-select
            id=${id}
            label=${config.name}
            value=${value}
            @sl-change=${this.updateSelectValue}
          >
            ${config.choicenames.map(
              (choice, value) => html`
              <sl-option value=${value}>${choice}</sl-option>
            `,
            )}
          </sl-select>
        `;

      default:
        // @ts-ignore: item.type never
        throw new Error(`Unknown config item type ${item.type}`);
    }
  }

  private resetFormItemValues() {
    // If the form has already been rendered, re-rendering with new value attributes
    // won't update input element state. Flush current values into item properties.
    for (const [id, { type }] of Object.entries(this.config?.items ?? [])) {
      const value = this.changes[id] ?? this.values[id];
      const element = this.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
      if (element && value !== undefined) {
        if (type === "boolean") {
          element.checked = Boolean(value);
        } else {
          element.value = String(value);
        }
      }
    }
  }

  private autoSelectInput(event: FocusEvent) {
    const target = event.target as HTMLInputElement;
    target.select();
  }

  private updateTextValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.changes[target.id] = target.value; // doesn't force redraw
  }

  private updateCheckboxValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.changes[target.id] = target.checked; // doesn't force redraw
  }

  private updateSelectValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.changes[target.id] = Number.parseInt(target.value); // doesn't force redraw
  }

  private async handleSubmit(event: Event) {
    event.preventDefault();

    const result = await this.setValues(this.changes);
    if (result) {
      // If there's a result string, it's an error message
      this.error = result;
    } else {
      // Success
      this.hide();

      if (this.puzzle) {
        this.dispatchEvent(
          new CustomEvent<PuzzleConfigChangeDetail>(this.submitEventType, {
            bubbles: true,
            composed: true,
            detail: {
              puzzle: this.puzzle,
              changes: this.changes,
              value: this.values,
            },
          }),
        );
      }

      this.values = { ...this.values, ...this.changes };
      this.changes = {};
    }
  }

  private async handleCancel() {
    this.hide();
    this.changes = {};
  }

  private handleDialogRequestClose(event: CustomEvent<{ source: string }>) {
    // Prevent the dialog from closing when the user clicks on the overlay
    if (event.detail.source === "overlay") {
      event.preventDefault();
    }
  }

  /**
   * Show the configuration dialog
   */
  public show() {
    this.dialog?.show();
  }

  /**
   * Hide the configuration dialog
   */
  public hide() {
    this.dialog?.hide();
  }

  public async reloadValues() {
    await this.loadValues();
    await this.updateComplete;
    this.resetFormItemValues();
  }

  static styles = css`
    :host {
      display: contents;
    }

    [part="form"] {
      display: flex;
      flex-direction: column;
      gap: var(--sl-spacing-medium);
    }

    [part="footer"] {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-spacing-small);
    }

    [part="error"] {
      color: var(--sl-color-danger-600);
      margin-bottom: var(--sl-spacing-medium);
    }
  `;
}

/**
 * Dialog for editing custom game params (custom type)
 */
@customElement("puzzle-custom-params")
export class PuzzleCustomParams extends PuzzleConfig {
  protected override submitEventType = "puzzle-custom-params-change";

  protected override async getConfig() {
    return this.puzzle?.getCustomParamsConfig();
  }

  protected override async getValues() {
    return this.puzzle?.getCustomParams() ?? {};
  }

  protected override async setValues(values: ConfigValues) {
    return this.puzzle?.setCustomParams(values);
  }
}

/**
 * Dialog for editing puzzle preferences
 */
@customElement("puzzle-preferences")
export class PuzzlePreferences extends PuzzleConfig {
  protected override submitEventType = "puzzle-preferences-change";

  protected override async getConfig() {
    return this.puzzle?.getPreferencesConfig();
  }

  protected override async getValues() {
    return this.puzzle?.getPreferences() ?? {};
  }

  protected override async setValues(values: ConfigValues) {
    const result = await this.puzzle?.setPreferences(values);
    if (!result) {
      await this.puzzle?.redraw();
    }
    return result;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-custom-params": PuzzleCustomParams;
    "puzzle-preferences": PuzzlePreferences;
  }

  interface HTMLElementEventMap {
    "puzzle-custom-params-change": PuzzleConfigChangeEvent;
    "puzzle-preferences-change": PuzzleConfigChangeEvent;
  }
}
