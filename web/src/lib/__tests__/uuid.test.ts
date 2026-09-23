/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { afterEach, describe, expect, test, vi } from 'vitest'

import { generateUUID } from '../uuid'

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const originalCrypto = globalThis.crypto
const originalRandomUUID = globalThis.crypto?.randomUUID

function stubCrypto(value: unknown): void {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    writable: true,
    value,
  })
}

afterEach(() => {
  stubCrypto(originalCrypto)
  if (originalCrypto && originalRandomUUID) {
    Object.defineProperty(originalCrypto, 'randomUUID', {
      configurable: true,
      writable: true,
      value: originalRandomUUID,
    })
  }
  vi.restoreAllMocks()
})

describe('generateUUID', () => {
  test('prefers native crypto.randomUUID when it is available', () => {
    const randomUUID = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('018f8e4e-9c3a-7b2d-8e1f-0a2b3c4d5e6f')

    expect(generateUUID()).toBe('018f8e4e-9c3a-7b2d-8e1f-0a2b3c4d5e6f')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  test('falls back to crypto.getRandomValues when randomUUID is missing on plain HTTP', () => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    const first = generateUUID()
    const second = generateUUID()

    expect(first).toMatch(UUID_V4_PATTERN)
    expect(second).toMatch(UUID_V4_PATTERN)
    expect(first).not.toBe(second)
  })

  test('falls back to Math.random when no Web Crypto API exists at all', () => {
    stubCrypto(undefined)

    const first = generateUUID()
    const second = generateUUID()

    expect(first).toMatch(UUID_V4_PATTERN)
    expect(second).toMatch(UUID_V4_PATTERN)
    expect(first).not.toBe(second)
  })
})
