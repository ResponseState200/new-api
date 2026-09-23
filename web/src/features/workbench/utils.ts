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
import type { TFunction } from 'i18next'

import type { WorkbenchGeneration } from './types'

export function getGenerationFileName(item: WorkbenchGeneration): string {
  const subtype = item.mime_type.split('/')[1]?.toLowerCase() ?? ''
  const extension =
    subtype === 'jpeg'
      ? 'jpg'
      : subtype || (item.type === 'image' ? 'png' : 'mp4')
  return `generation-${item.id}.${extension}`
}

export function getGenerationParamsSummary(item: WorkbenchGeneration): string {
  try {
    const params = JSON.parse(item.params) as Record<string, unknown>
    if (item.type === 'image') {
      return typeof params.size === 'string' ? params.size : ''
    }
    const parts: string[] = []
    if (typeof params.duration_seconds === 'number') {
      parts.push(`${params.duration_seconds}s`)
    }
    if (typeof params.resolution === 'string') parts.push(params.resolution)
    if (typeof params.ratio === 'string') parts.push(params.ratio)
    return parts.join(' · ')
  } catch {
    return ''
  }
}

export function formatRemainingTime(
  expiresAt: number,
  now: number,
  t: TFunction
): string {
  const msLeft = expiresAt * 1000 - now
  if (msLeft <= 0) return t('Expired')
  const totalMinutes = Math.floor(msLeft / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return t('Remaining: {{minutes}}m', { minutes })
  return t('Remaining: {{hours}}h {{minutes}}m', { hours, minutes })
}
