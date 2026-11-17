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
