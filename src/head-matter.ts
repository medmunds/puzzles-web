import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * A LitElement that manages content in the document's <head>.
 * It replaces matching elements in the head with its own children.
 * On disconnection, it restores the head to its original state.
 *
 * - <link> tags are matched by rel attribute
 * - <meta> tags are matched by name attribute
 * - all others are just matched by tag name
 *
 * Example usage (in a Lit render() method):
 *   <head-matter>
 *     <title>${title}</title>
 *     <meta name="description" content="This is a demo of head-matter">
 *     <!-- Both of these will be added to head, replacing _all_ other icons there -->
 *     <link rel="icon" type="image/png" href="/favicon.png">
 *     <link rel="icon" type="image/svg" href="/favicon.svg">
 *   </head-matter>
 */
@customElement("head-matter")
export class HeadMatter extends LitElement {
  private originalNodes = new Set<HTMLElement>();
  private addedNodes = new Set<HTMLElement>();

  render() {
    return html`<slot @slotchange=${this.handleSlotChange}></slot>`;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.restoreHead();
  }

  private handleSlotChange(e: Event) {
    const slot = e.target as HTMLSlotElement;
    const newChildNodes = slot.assignedElements({ flatten: true });

    // Defer DOM changes to avoid interfering
    // with synchronous disconnect/render phase.
    queueMicrotask(() => this.updateHead(newChildNodes));
  }

  private updateHead(newChildNodes: Element[]) {
    if (!this.isConnected) {
      return;
    }

    this.restoreHead();

    const queries = new Set<string>();
    for (const node of newChildNodes) {
      if (node instanceof HTMLElement) {
        // Find, store, and remove any existing elements in the head that match.
        const query = this.getQueryForElement(node);
        if (!queries.has(query)) {
          for (const match of document.head.querySelectorAll(query)) {
            if (match instanceof HTMLElement && !this.addedNodes.has(match)) {
              this.originalNodes.add(match);
              match.remove();
            }
          }
          queries.add(query);
        }

        // Add the new element to the head and track it.
        const clone = document.importNode(node, true) as HTMLElement;
        this.addedNodes.add(clone);
        document.head.appendChild(clone);
      }
    }
  }

  /**
   * Removes nodes added by this component and restores the original nodes.
   */
  private restoreHead() {
    for (const node of this.addedNodes) {
      node.remove();
    }
    this.addedNodes.clear();

    for (const node of this.originalNodes) {
      document.head.appendChild(node);
    }
    this.originalNodes.clear();
  }

  private getQueryForElement(element: HTMLElement): string {
    const tagName = element.tagName.toLowerCase();
    switch (tagName) {
      case "link":
        if (element.hasAttribute("rel")) {
          return `link[rel="${element.getAttribute("rel") ?? ""}"]`;
        }
        break;
      case "meta":
        // Currently only using <meta name=...>.
        // Could add support for http-equiv, property, etc. if needed.
        if (element.hasAttribute("name")) {
          return `meta[name="${element.getAttribute("name") ?? ""}"]`;
        }
        break;
      case "template":
        // In theory, head-matter could support any element with an 'id'.
        // But updateHead() currently reorders elements to the end of <head>,
        // which could change interpretation of script, style, etc.
        if (element.id) {
          return `${tagName}#${element.id}`;
        }
        break;
      case "base":
      case "title":
        // Singleton elements
        return tagName;
    }
    throw new Error(`Unsupported slotted ${tagName} in head-matter`);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "head-matter": HeadMatter;
  }
}
