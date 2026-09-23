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
import { api } from '@/lib/api'

import type {
  ImageGenerationPayload,
  ImageGenerationResponse,
  VideoCreateResponse,
  VideoGenerationPayload,
  VideoTaskResponse,
  WorkbenchGenerationsResponse,
  WorkbenchKeysResponse,
  WorkbenchMode,
  WorkbenchModelsResponse,
} from './types'

const videoSizePresets: Record<string, Record<string, string>> = {
  '480p': {
    '1:1': '480x480',
    '3:4': '480x640',
    '4:3': '640x480',
    '9:16': '480x854',
    '16:9': '854x480',
    '21:9': '1120x480',
  },
  '720p': {
    '1:1': '720x720',
    '3:4': '720x960',
    '4:3': '960x720',
    '9:16': '720x1280',
    '16:9': '1280x720',
    '21:9': '1680x720',
  },
  '1080p': {
    '1:1': '1080x1080',
    '3:4': '1080x1440',
    '4:3': '1440x1080',
    '9:16': '1080x1920',
    '16:9': '1920x1080',
    '21:9': '2520x1080',
  },
  '4k': {
    '1:1': '2160x2160',
    '3:4': '2160x2880',
    '4:3': '2880x2160',
    '9:16': '2160x3840',
    '16:9': '3840x2160',
    '21:9': '5040x2160',
  },
}

function getVideoSize(ratio: string, resolution: string): string {
  return videoSizePresets[resolution]?.[ratio] ?? videoSizePresets['720p']['16:9']
}

export async function getWorkbenchKeys(): Promise<WorkbenchKeysResponse> {
  const response = await api.get('/api/workbench/keys')
  return response.data.data
}

export async function getWorkbenchModels(
  tokenId: number,
  mode: WorkbenchMode
): Promise<WorkbenchModelsResponse> {
  const response = await api.get('/api/workbench/models', {
    params: { token_id: tokenId, mode },
  })
  return response.data.data
}

export async function generateImage(
  tokenId: number,
  payload: ImageGenerationPayload
): Promise<ImageGenerationResponse> {
  const response = await api.post(
    `/api/workbench/keys/${tokenId}/images`,
    payload,
    { skipErrorHandler: true }
  )
  return response.data
}

export async function createVideo(
  tokenId: number,
  payload: VideoGenerationPayload,
  idempotencyKey: string
): Promise<VideoCreateResponse> {
  const size = getVideoSize(payload.ratio, payload.video_resolution)
  const body = payload.image
    ? (() => {
        const formData = new FormData()
        formData.append('model', payload.model)
        formData.append('prompt', payload.prompt)
        formData.append('mode', payload.mode)
        formData.append('duration', String(payload.duration_seconds))
        formData.append('duration_seconds', String(payload.duration_seconds))
        formData.append('size', size)
        formData.append('resolution', payload.video_resolution)
        formData.append('ratio', payload.ratio)
        formData.append('video_resolution', payload.video_resolution)
        formData.append('input_reference', payload.image)
        return formData
      })()
    : {
        model: payload.model,
        prompt: payload.prompt,
        mode: payload.mode,
        duration: payload.duration_seconds,
        duration_seconds: payload.duration_seconds,
        size,
        resolution: payload.video_resolution,
        ratio: payload.ratio,
        video_resolution: payload.video_resolution,
      }

  const response = await api.post(
    `/api/workbench/keys/${tokenId}/videos`,
    body,
    {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorHandler: true,
    }
  )
  return response.data
}

export async function getVideoTask(
  tokenId: number,
  taskId: string
): Promise<VideoTaskResponse> {
  const response = await api.get(
    `/api/workbench/keys/${tokenId}/videos/${encodeURIComponent(taskId)}`,
    { skipErrorHandler: true }
  )
  return response.data
}

export async function downloadVideo(
  tokenId: number,
  taskId: string
): Promise<Blob> {
  const response = await api.get(
    `/api/workbench/keys/${tokenId}/videos/${encodeURIComponent(taskId)}/content`,
    {
      responseType: 'blob',
      skipErrorHandler: true,
    }
  )
  return response.data
}

export async function listGenerations(
  mode: WorkbenchMode
): Promise<WorkbenchGenerationsResponse> {
  const response = await api.get('/api/workbench/generations', {
    params: { type: mode },
  })
  return response.data.data
}

export function getGenerationContentUrl(id: number): string {
  return `/api/workbench/generations/${id}/content`
}

export async function deleteGeneration(id: number): Promise<void> {
  await api.delete(`/api/workbench/generations/${id}`)
}
