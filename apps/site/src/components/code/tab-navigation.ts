/**
 * Resolves the tab a WAI-ARIA tablist key press moves to.
 * @param key - The `KeyboardEvent.key` value.
 * @param current - Index of the focused tab.
 * @param count - Number of tabs.
 * @returns The target index (wrapping at both ends), or `null` for a key that does not move.
 */
export function resolveTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
