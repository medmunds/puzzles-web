import { LitElement, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";

type TagName = keyof HTMLElementTagNameMap;

export interface DynamicLoaderItem<T extends TagName> {
  tagName: T;
  render: () => TemplateResult;
}

/**
 * Maintains a set of dynamically rendered custom elements.
 * Each element is identified by its tag name (so is a singleton of its tag).
 *
 * Load items with the addItem() method. Once loaded, an item remains in the
 * DOM until the dynamic-content is unmounted or the element is specifically
 * removed with removeItem().
 */
@customElement("dynamic-content")
export class DynamicContent extends LitElement {
  @state()
  private dynamicItems: DynamicLoaderItem<TagName>[] = [];

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.dynamicItems = [];
  }

  protected override createRenderRoot() {
    // Use light DOM. (Allows parent to style and directly querySelector
    // its own dynamic elements without needing to poke into our shadow root.)
    return this;
  }

  protected override render() {
    return repeat(
      this.dynamicItems,
      (item) => item.tagName,
      (item) => item.render(),
    );
  }

  /**
   * If an element of tagName already exists within the dynamic-content,
   * return it. Otherwise add tagName and render function to the set of
   * dynamic items, wait for the render, and return the tagName element.
   *
   * If you want to change the render function for a tagName, you must
   * removeItem(), await updateComplete, and then addItem() again. (Otherwise
   * addItem() will return the previously rendered element without updating
   * the configuration.)
   */
  async addItem<T extends TagName>({
    tagName,
    render,
  }: DynamicLoaderItem<T>): Promise<HTMLElementTagNameMap[T] | null | undefined> {
    let element = this.querySelector(tagName);
    if (element) {
      return element;
    }

    this.removeItem(tagName); // shouldn't be necessary, but just in case
    this.dynamicItems = [...this.dynamicItems, { tagName, render }];
    await this.updateComplete;
    element = this.querySelector(tagName);
    if (import.meta.env.DEV && !element) {
      throw new Error(
        `dynamic-content render function for ${tagName} did not render that tag`,
      );
    }
    return element;
  }

  /**
   * Remove tagName from the set of dynamic items (if present).
   * Its DOM element will be removed at the next update.
   */
  removeItem(tagName: TagName) {
    this.dynamicItems = [
      ...this.dynamicItems.filter((options) => options.tagName !== tagName),
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dynamic-content": DynamicContent;
  }
}
