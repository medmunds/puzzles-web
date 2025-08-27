import { computed, type Signal, SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { puzzleDataMap } from "./catalog.ts";
import type { SavedGameMetadata } from "./store/db.ts";
import { savedGames } from "./store/saved-games.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

interface SavedGameListItem extends SavedGameMetadata {
  id: string; // for aria ids, might be reassigned when re-querying
  key: string; // stable across reloads/resorts, but not usable as aria id
}

interface SavedGameListEventDetail {
  item: SavedGameListItem;
}

export type SavedGameListEvent = CustomEvent<SavedGameListEventDetail>;

interface SavedGameListColumn {
  name: string;
  field: keyof SavedGameMetadata;
  // Width?
  // Default sortOrder?
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const sortFunctions: {
  [field in keyof SavedGameMetadata]?: (
    a: SavedGameListItem,
    b: SavedGameListItem,
  ) => number;
} = {
  filename: ({ filename: a }, { filename: b }) => a.localeCompare(b),
  timestamp: ({ timestamp: a }, { timestamp: b }) => Math.sign(a - b),
  puzzleId: ({ puzzleId: a }, { puzzleId: b }) =>
    (puzzleDataMap[a].name ?? a).localeCompare(puzzleDataMap[b].name ?? b),
} as const;

const makeKey = ({ puzzleId, filename }: SavedGameMetadata) =>
  `${puzzleId}:${filename}`;

/**
 * <saved-game-list> displays a tabular list of saved games,
 * with sortable columns for name, date, puzzle type, and status.
 */
@customElement("saved-game-list")
export class SavedGameList extends SignalWatcher(LitElement) {
  /**
   * If provided, shows only saved files for this puzzle id.
   * Otherwise shows all saved files (and includes Puzzle column).
   */
  @property({ type: String })
  puzzleId?: string;

  @property({ type: String, reflect: true })
  sort: keyof SavedGameMetadata = "filename";

  @property({ type: String, reflect: true, attribute: "sort-order" })
  sortOrder: "asc" | "desc" = "asc";

  @state()
  private columns: SavedGameListColumn[] = [
    {
      name: "Name",
      field: "filename",
    },
    {
      name: "Date",
      field: "timestamp",
    },
    // TODO: add a Puzzle column when no puzzleId
  ];

  // TODO: release the computed when disconnected?
  private _savedGamesSignal?: Signal.State<readonly SavedGameMetadata[]>;
  private _itemsSignal?: Signal.Computed<SavedGameListItem[]>;

  private get items(): SavedGameListItem[] {
    return this._itemsSignal?.get() ?? [];
  }

  @state()
  private selectedItemKey?: string;

  private get selectedItem(): SavedGameListItem | undefined {
    // TODO: memoize/computed?
    return this.selectedItemKey
      ? this.items?.find((item) => item.key === this.selectedItemKey)
      : undefined;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();

    // Release live query signal
    this._savedGamesSignal = undefined;
    this._itemsSignal = undefined;
  }

  private async updateItemsSignal() {
    this._savedGamesSignal = savedGames.savedGamesLiveQuery(this.puzzleId);
    this._itemsSignal = computed(
      () =>
        this._savedGamesSignal?.get().map((savedGame, index) => ({
          ...savedGame,
          id: `row-${index}`,
          key: makeKey(savedGame),
        })) ?? [],
    );
  }

  private sortedItems() {
    const compare =
      sortFunctions[this.sort] ??
      ((a: SavedGameListItem, b: SavedGameListItem) =>
        String(a[this.sort]).localeCompare(String(b[this.sort])));

    // TODO: use Array.toSorted (es2023)
    // TODO: memoize (computed on items signal + sort and sortOrder state)
    return [...this.items].sort(
      this.sortOrder === "asc"
        ? compare
        : (a: SavedGameListItem, b: SavedGameListItem) => compare(b, a),
    );
  }

  protected override async willUpdate(changedProps: Map<string, unknown>) {
    if (changedProps.has("puzzleId") || !this._itemsSignal) {
      await this.updateItemsSignal();
    }
  }

  protected override updated() {
    if (this.selectedItemKey) {
      this.scrollSelectedItemIntoView();
    }
  }

  protected override render() {
    const items = this.sortedItems();

    return html`
      <table
          part="list"
          role="grid"
          tabindex="0"
          aria-activedescendant=${this.selectedItem?.id ?? nothing}
          @keydown=${this.handleKeyDown}
          @focus=${this.handleTableFocus}
          @blur=${this.handleTableBlur}
      >
        <thead>
        <tr role="row">
          ${this.columns.map((column) => this.renderColumnHeader(column))}
        </tr>
        </thead>
        <tbody>
        ${repeat(items, makeKey, (item) => this.renderRow(item))}
        ${this.items.length === 0 ? this.renderPlaceholder() : nothing}
        </tbody>
      </table>
    `;
  }

  private renderColumnHeader({ name, field }: SavedGameListColumn) {
    const sort = field === this.sort ? this.sortOrder : "none";

    // (wa-button renders its internal button with tabindex=0)
    return html`
      <th scope="col" role="columnheader" aria-sort=${sort} data-field=${field}>
        <wa-button 
            appearance="plain"
            size="small"
            ?with-caret=${sort !== "none"}
            @click=${this.handleHeaderClick}
        >
          ${name}
        </wa-button>
      </th>
    `;
  }

  private renderRow(item: SavedGameListItem) {
    const isSelected = this.selectedItemKey === item.key;
    const values: string[] = [];
    for (const { field } of this.columns) {
      let value: string;
      switch (field) {
        case "filename":
          value = item.filename;
          break;
        case "timestamp":
          value = dateFormat.format(item.timestamp);
          break;
        case "puzzleId":
          value = puzzleDataMap[item.puzzleId]?.name ?? item.puzzleId;
          break;
        default:
          value = String(item[field]);
          break;
      }
      values.push(value);
    }
    return html`
      <tr
          role="row"
          id=${item.id}
          aria-selected=${isSelected}
          @click=${this.handleRowClick}
      >
        ${values.map((value) => html`<td role="gridcell">${value}</td>`)}
      </tr>`;
  }

  private renderPlaceholder() {
    return html`
      <tr class="placeholder">
        <td colspan=${this.columns.length}>
          <slot name="placeholder"></slot>
        </td>
      </tr>
    `;
  }

  private handleTableFocus(event: FocusEvent) {
    const table = event.target as HTMLTableElement;
    if (table.matches(":focus-visible")) {
      this.toggleAttribute("table-focus-visible", true);
    }
  }

  private handleTableBlur() {
    this.toggleAttribute("table-focus-visible", false);
  }

  private handleHeaderClick(event: UIEvent) {
    const field = (event.target as HTMLElement)
      .closest("[data-field]")
      ?.getAttribute("data-field");
    if (!field) {
      throw new Error("Unable to find data-field element");
    }
    if (field === this.sort) {
      // Toggle sort direction
      this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
    } else {
      this.sort = field as keyof SavedGameMetadata;
      this.sortOrder = "asc"; // TODO: field-specific default orders?
    }
    // willUpdate will resort items
  }

  private handleRowClick(event: UIEvent) {
    const id = (event.target as HTMLElement).closest("tr")?.id;
    const item = this.items.find((item) => item.id === id);
    this.setSelectedItem(item);
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.target !== this.shadowRoot?.querySelector("table")) {
      // Header control
      return;
    }

    const currentIndex = this.selectedItem
      ? this.items.findIndex((item) => item.key === this.selectedItem?.key)
      : -1;
    const totalItems = this.items.length;
    let newIndex: number | null = null;
    switch (event.key) {
      case "ArrowUp":
        newIndex = currentIndex >= 1 ? currentIndex - 1 : totalItems - 1;
        break;
      case "ArrowDown":
        newIndex = (currentIndex + 1) % totalItems;
        break;
      case "Home":
        newIndex = 0;
        break;
      case "End":
        newIndex = totalItems - 1;
        break;
      case "PageUp":
      case "PageDown": {
        const pageSize = this.getPageSize();
        if (event.key === "PageUp") {
          newIndex = currentIndex >= pageSize ? currentIndex - pageSize : 0;
        } else {
          newIndex = Math.min(currentIndex + pageSize, totalItems - 1);
        }
        break;
      }
      case "Enter":
      case " ":
        // TODO: activate
        event.preventDefault();
        break;
    }

    if (newIndex !== null) {
      event.preventDefault();
      this.setSelectedItem(this.items.at(newIndex));
    }
  }

  private getPageSize() {
    const thead = this.shadowRoot?.querySelector("thead");
    const row = this.shadowRoot?.querySelector<HTMLTableRowElement>("tbody tr");
    if (!thead || !row) {
      return 4; // fallback
    }
    const visibleHeight = this.clientHeight - thead.offsetHeight;
    const rowHeight = row.offsetHeight;
    const pageSize = Math.floor(visibleHeight / rowHeight);
    return Math.max(pageSize, 1);
  }

  private setSelectedItem(item?: SavedGameListItem) {
    if (item?.key !== this.selectedItemKey) {
      this.selectedItemKey = item?.key;
      if (item) {
        this.scrollSelectedItemIntoView();
        this.dispatchEvent(
          new CustomEvent<SavedGameListEventDetail>("saved-game-list-select", {
            composed: true,
            bubbles: true,
            detail: { item },
          }),
        );
      }
    }
  }

  private scrollSelectedItemIntoView() {
    if (this.selectedItem) {
      const row = this.shadowRoot?.getElementById(this.selectedItem.id);
      if (row) {
        row.scrollIntoView({ block: "nearest" });
      }
    }
  }

  // TODO: focus, :focus-within styling, keyboard nav and roving tabIndex

  static styles = css`
    :host {
      --major-border:
          var(--wa-form-control-border-width)
          var(--wa-form-control-border-style)
          var(--wa-form-control-border-color);

      --minor-border:
          var(--wa-border-width-s)
          solid
          var(--wa-color-surface-border);

      display: block;
      max-height: 100%;
      overflow-y: auto;
      
      /* Keep scrollIntoView from scrolling under sticky header */
      scroll-padding-block-start: 
          calc(var(--wa-form-control-height) + 2 * var(--wa-form-control-border-width));
      
      user-select: none;
      cursor: default;

      background-color: var(--wa-form-control-background-color);
      color: var(--wa-form-control-value-color);
      font-weight: var(--wa-form-control-value-font-weight);
      line-height: var(--wa-form-control-value-line-height);

      border: var(--major-border);
      border-radius: var(--wa-form-control-border-radius);
    }
    
    /* Relocate table:focus-visible to focus ring on :host */
    table:focus-visible {
      outline: none;
    }
    :host([table-focus-visible]) {
      /* :host(:has(table:focus-visible)) isn't valid; JS sets this attr instead.
       * (:host(:focus-within)) is valid but causes double focus rings 
       * when a header button is focused.) */
      outline: var(--wa-focus-ring);
      outline-offset: var(--wa-focus-ring-offset);
    }
    
    table {
      box-sizing: border-box;
      width: 100%;
      table-layout: fixed;
      /* Cannot collapse borders with sticky thead: they get lost when scrolled */
      border-collapse: separate;
      border-spacing: 0;
    }
    
    thead {
      position: sticky;
      inset-block-start: 0;
    }
    
    th {
      background-color: var(--wa-form-control-background-color);
      color: var(--wa-form-control-label-color);
      font-weight: var(--wa-form-control-label-font-weight);
      line-height: var(--wa-form-control-label-line-height);
      
      border-block-end: var(--major-border);
      z-index: 1;
    }
    th:not(:last-child) {
      border-inline-end: var(--minor-border);
    }
    
    tbody tr:not(.placeholder) td {
      border-block-end: var(--minor-border);
    }
    
    th[aria-sort="asc"] wa-button::part(caret) {
      transform: scaleY(-100%);
    }
    @media (prefers-reduced-motion: no-preference) {
      th wa-button::part(caret) {
        transition: transform var(--wa-transition-fast) var(--wa-transition-easing);
      }
    }
    
    th, 
    tr:not(.placeholder) td {
      text-align: start;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    tr.placeholder td {
      text-align: center;
      vertical-align: middle;
      color: var(--wa-color-text-quiet);
    }
    
    tbody td {
      padding: var(--wa-form-control-padding-block) var(--wa-form-control-padding-inline);
    }
    
    wa-button {
      /* Leave margin for focus ring; take up full width of <th> */
      --focus-ring-size: calc(var(--wa-focus-ring-width) + var(--wa-focus-ring-offset));
      margin: var(--focus-ring-size);
      width: calc(100% - 2 * var(--focus-ring-size));
      &::part(base) {
        /* Match tbody td inline padding (less margin) to align text */
        padding: 
            var(--wa-space-2xs) 
            calc(var(--wa-form-control-padding-inline) - var(--focus-ring-size));
        border-radius: var(--wa-border-radius-s);
        height: auto;
        justify-content: flex-start;
      }
      &::part(label) {
        flex-grow: 1;
        text-align: start;
      }
    }
    
    tr[aria-selected="true"] {
      background-color: var(--wa-color-brand-fill-loud);
      color: var(--wa-color-brand-on-loud);
    }
    
    @media(hover: hover) {
      tbody tr:not(.placeholder):hover td {
        background-color: color-mix(in oklab, transparent, var(--wa-color-mix-hover));
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "saved-game-list": SavedGameList;
  }

  interface HTMLElementEventMap {
    "saved-game-list-select": SavedGameListEvent;
  }
}
