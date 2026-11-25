const APPLE_PLATFORM = /(Mac|iPhone|iPod|iPad)/i;

/**
 * Whether the navigator describes macOS or iOS, where the search shortcut is
 * Command K. The platform is read first, as DevTools and some browsers spoof
 * the user agent; the user agent only answers when the platform is empty.
 * @param navigatorLike - The `platform` and `userAgent` of `navigator`.
 * @returns True on macOS, iPhone, iPad and iPod.
 */
export function isApplePlatform(navigatorLike: { platform?: string; userAgent?: string }): boolean {
  const { platform, userAgent } = navigatorLike;
  const described = [platform, userAgent].find((value) => value !== undefined && value !== "");
  return APPLE_PLATFORM.test(described ?? "");
}

const EDITABLE_TARGET = "input, textarea, select, [contenteditable]";

/**
 * Whether a key press is Ctrl K or Command K, which opens or closes the search.
 * @param event - The key and modifier state of a `keydown`.
 * @returns True for the toggle shortcut.
 */
export function isSearchToggleKey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return (event.metaKey || event.ctrlKey) && event.key === "k";
}

/**
 * Whether a key press is a bare slash outside a text field, which opens the search.
 * @param event - The key and modifier state of a `keydown`.
 * @param target - The element that received the key, if it is an element.
 * @returns True for the slash shortcut.
 */
export function isSearchSlashKey(
  event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  target: { closest(selector: string): unknown } | null,
): boolean {
  const plain = !(event.ctrlKey || event.metaKey || event.altKey);
  return event.key === "/" && plain && !target?.closest(EDITABLE_TARGET);
}
