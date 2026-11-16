/**
 * Narrows a possibly missing value, throwing when it is absent.
 * Use where an invariant guarantees presence and a non-null assertion would hide the assumption.
 * @param value The value to narrow.
 * @param description Names the value in the error message.
 * @returns The value, narrowed to exclude null and undefined.
 */
export function present<T>(value: T | null | undefined, description = "value"): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${description} to be present`);
  }
  return value;
}
