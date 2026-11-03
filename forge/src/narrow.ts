/** Narrows `value` to a non-null object, arrays included. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Reads the `message` of an `Error`, falling back to the stringified value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Reads the string `code` of a Node system error, or `undefined`. */
export function errnoCode(error: unknown): string | undefined {
  if (!isObject(error)) return undefined
  const { code } = error
  return typeof code === 'string' ? code : undefined
}

/** Whether `value` is one of the literal `members`, narrowing it to their union. */
export function isOneOf<Member extends string>(
  members: readonly Member[],
  value: unknown,
): value is Member {
  return members.some((member) => member === value)
}
