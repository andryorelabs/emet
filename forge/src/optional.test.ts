import { expect, test } from 'bun:test'
import { optionalProperty } from './optional'

test('omits the key when the value is undefined', () => {
  const fragment = optionalProperty('name', undefined)
  expect('name' in fragment).toBe(false)
})

test('carries the key when the value is defined', () => {
  expect(optionalProperty('name', 'forge')).toEqual({ name: 'forge' })
  expect(optionalProperty('count', 0)).toEqual({ count: 0 })
})
