import { SignalWatcher, signal } from "@lit-labs/signals";
import { consume } from "@lit/context";
import type SlDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import { LitElement, type TemplateResult, css, html } from "lit";
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
 * Common code for configuration forms.
 * Must be used within a puzzle-context component.
 */
abstract class PuzzleConfigForm extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  protected puzzle?: Puzzle;

  /**
   * The title for the dialog, per the config
   */
  get title(): string {
    return this._title.get();
  }

  protected _title = signal<string>("");

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
    this._title.set(this.config?.title ?? "");
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

  protected override render() {
    return html`
      <form part="form" @submit=${this.submit}>
        ${when(this.error, () => html`<div part="error">${this.error}</div>`)}

        ${Object.entries(this.config?.items ?? {}).map(([id, config]) => this.renderConfigItem(id, config))}
      </form>
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

  public get hasErrors(): boolean {
    return this.error !== undefined;
  }

  public async submit(event?: Event) {
    event?.preventDefault();

    const result = await this.setValues(this.changes);
    if (result) {
      // If there's a result string, it's an error message
      this.error = result;
    } else {
      // Success
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

  public async reset() {
    this.changes = {};
    this.error = undefined;
    this.resetFormItemValues();
  }

  public async reloadValues() {
    await this.loadValues();
    await this.updateComplete;
    this.resetFormItemValues();
  }

  static styles = css`
    :host {
      display: contents;
      --item-spacing: var(--sl-spacing-medium);
    }

    [part="form"] {
      display: flex;
      flex-direction: column;
      gap: var(--item-spacing);
    }

    [part="error"] {
      color: var(--sl-color-danger-600);
      margin-bottom: var(--item-spacing);
    }
  `;
}

/**
 * Form for editing custom game params (custom puzzle type)
 */
@customElement("puzzle-custom-params-form")
export class PuzzleCustomParamsForm extends PuzzleConfigForm {
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

  /**
   * Return encoded params for current form values
   */
  async getParams(): Promise<string | undefined> {
    if (this.puzzle) {
      const result = await this.puzzle.encodeCustomParams({
        ...this.values,
        ...this.changes,
      });
      if (!result.startsWith("#ERROR:")) {
        return result;
      }
      console.warn(`PuzzleCustomParamsForm.getParams: ${result}`);
    }
  }
}

/**
 * Form for editing puzzle preferences
 */
@customElement("puzzle-preferences-form")
export class PuzzlePreferencesForm extends PuzzleConfigForm {
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

abstract class PuzzleConfigDialog extends SignalWatcher(LitElement) {
  /**
   * The label for the submit button
   */
  @property({ type: String, attribute: "submit-label" })
  submitLabel = "OK";

  /**
   * The label for the cancel button
   */
  @property({ type: String, attribute: "cancel-label" })
  cancelLabel = "Cancel";

  @property({ type: String, attribute: "dialog-title" })
  dialogTitle = "Configuration";

  @query("sl-dialog", true)
  protected dialog?: SlDialog;

  protected abstract form?: PuzzleConfigForm;

  protected override render() {
    return html`
      <sl-dialog
          label=${this.dialogTitle}
          @sl-request-close=${this.handleDialogRequestClose}
      >
        ${this.renderConfigForm()}

        <div slot="footer" part="footer">
          <sl-button variant="primary" @click=${this.handleSubmit}>${this.submitLabel}</sl-button>
          <sl-button @click=${this.handleCancel}>${this.cancelLabel}</sl-button>
        </div>
      </sl-dialog>
    `;
  }

  protected override updated() {
    if (!this.hasAttribute("dialog-title")) {
      // Get the dialog title from the form
      const title = this.form?.title;
      if (title && title !== this.dialogTitle) {
        this.dialogTitle = title;
      }
    }
  }

  protected abstract renderConfigForm(): TemplateResult;

  protected handleDialogRequestClose(event: CustomEvent<{ source: string }>) {
    // Prevent the dialog from closing when the user clicks on the overlay
    if (event.detail.source === "overlay") {
      event.preventDefault();
    }
  }

  protected async handleSubmit() {
    await this.form?.submit();
    if (!this.form?.hasErrors) {
      await this.hide();
    }
  }

  protected async handleCancel() {
    await this.form?.reset();
    await this.hide();
  }

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

  async show(): Promise<void> {
    return this.dialog?.show();
  }

  async hide(): Promise<void> {
    return this.dialog?.hide();
  }

  async reloadValues(): Promise<void> {
    return this.form?.reloadValues();
  }

  static styles = css`
    :host {
      display: contents;
    }

    [part="footer"] {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-spacing-small);
    }
  `;
}

/**
 * Dialog for editing custom game params (custom puzzle type)
 */
@customElement("puzzle-custom-params-dialog")
export class PuzzleCustomParamsDialog extends PuzzleConfigDialog {
  @query("puzzle-custom-params-form")
  protected form?: PuzzleCustomParamsForm;

  protected override renderConfigForm() {
    return html`
      <puzzle-custom-params-form part="form"></puzzle-custom-params-form>
    `;
  }

  async getParams(): Promise<string | undefined> {
    return this.form?.getParams();
  }
}

/**
 * Dialog for editing puzzle preferences
 */
@customElement("puzzle-preferences-dialog")
export class PuzzlePreferencesDialog extends PuzzleConfigDialog {
  @query("puzzle-preferences-form")
  protected form?: PuzzlePreferencesForm;

  protected override renderConfigForm() {
    return html`
      <puzzle-preferences-form part="form"></puzzle-preferences-form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-custom-params-form": PuzzleCustomParamsForm;
    "puzzle-preferences-form": PuzzlePreferencesForm;
    "puzzle-custom-params-dialog": PuzzleCustomParamsDialog;
    "puzzle-preferences-dialog": PuzzlePreferencesDialog;
  }

  interface HTMLElementEventMap {
    "puzzle-custom-params-change": PuzzleConfigChangeEvent;
    "puzzle-preferences-change": PuzzleConfigChangeEvent;
  }
}
