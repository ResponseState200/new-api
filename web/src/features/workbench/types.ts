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
export type WorkbenchMode = 'image' | 'video'

export interface WorkbenchKey {
  id: number
  name: string
  group: string
  auto_groups?: string[]
}

export interface WorkbenchKeysResponse {
  items: WorkbenchKey[]
}

export interface WorkbenchModelsResponse {
  models: string[]
}

export interface ImageGenerationResponse {
  data?: Array<{
    url?: string
    b64_json?: string
    revised_prompt?: string
  }>
}

export interface VideoCreateResponse {
  id: string
  object?: string
  status: string
  progress?: number
}

export interface VideoTaskResponse extends VideoCreateResponse {
  model?: string
  error?: {
    message?: string
  }
}

export interface ImageGenerationPayload {
  model: string
  prompt: string
  size: string
  n: 1
}

export interface VideoGenerationPayload {
  model: string
  prompt: string
  mode: 'text_to_video' | 'image_to_video'
  duration_seconds: number
  ratio: string
  video_resolution: string
  image?: File
}
