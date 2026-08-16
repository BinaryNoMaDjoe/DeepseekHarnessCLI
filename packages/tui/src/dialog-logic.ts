import type { DialogItem } from "./store.js";

/**
 * Pure dialog logic — extracted for unit testing (see docs/testing.md).
 */

/** Case-insensitive filter across label, detail, and meta lines. */
export function filterItems(items: DialogItem[], query: string): DialogItem[] {
  if (query === "") return items;
  const q = query.toLowerCase();
  return items.filter((item) => {
    const inLabel = item.label.toLowerCase().includes(q);
    const inDetail = item.detail !== undefined && item.detail.toLowerCase().includes(q);
    const inMeta =
      item.meta !== undefined && item.meta.some((line) => line.toLowerCase().includes(q));
    return inLabel || inDetail || inMeta;
  });
}

/** One page of items for the list dialog. */
export function visiblePage(items: DialogItem[], page: number, size: number): DialogItem[] {
  return items.slice(page * size, (page + 1) * size);
}

/** First field whose value is empty/whitespace, or null when all filled. */
export function firstEmptyField(
  fields: { key: string; label: string }[],
  values: Record<string, string>,
): { key: string; label: string } | null {
  for (const field of fields) {
    const value = (values[field.key] ?? "").trim();
    if (value === "") return field;
  }
  return null;
}
