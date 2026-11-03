/**
 * Builds an object fragment that carries `key` only when `value` is defined,
 * so spreading it never writes an explicit `undefined` into an optional
 * property under `exactOptionalPropertyTypes`.
 */
export function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): { [Property in Key]?: Value } {
  return (value === undefined ? {} : { [key]: value }) as {
    [Property in Key]?: Value
  }
}
