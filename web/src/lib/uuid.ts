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
function formatUuidBytes(bytes: Uint8Array): string {
  // RFC 4122 version 4 (random) variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex: string[] = []
  bytes.forEach((byte) => hex.push(byte.toString(16).padStart(2, '0')))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}

/**
 * Generates an RFC 4122 version 4 UUID.
 *
 * `crypto.randomUUID()` is only exposed in secure contexts (HTTPS or
 * localhost), so pages served over plain HTTP throw
 * "crypto.randomUUID is not a function". This helper prefers the native API,
 * falls back to `crypto.getRandomValues()` (available in non-secure contexts
 * too), and finally to a `Math.random()`-based generator for environments
 * without any Web Crypto API.
 */
export function generateUUID(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  return formatUuidBytes(bytes)
}
