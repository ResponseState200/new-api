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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { handleServerError } from '@/lib/handle-server-error'
import { generateUUID } from '@/lib/uuid'

import {
  createVideo,
  downloadVideo,
  generateImage,
  getVideoTask,
  getWorkbenchKeys,
  getWorkbenchModels,
} from '../api'
import {
  imageSizes,
  terminalVideoStatuses,
  videoRatios,
  videoResolutions,
} from '../constants'
import type {
  ImageGenerationResponse,
  VideoGenerationPayload,
  VideoTaskResponse,
  WorkbenchGeneration,
  WorkbenchMode,
} from '../types'

const imageSizeSchema = z
  .string()
  .regex(/^\d{3,4}x\d{3,4}$/, 'Invalid image size')
const positiveIntegerSchema = z.number().int().positive()

function getImageSource(response: ImageGenerationResponse): string {
  const image = response.data?.[0]
  if (!image) return ''
  if (image.b64_json) return `data:image/png;base64,${image.b64_json}`
  return image.url ?? ''
}

export function useWorkbench() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<WorkbenchMode>('image')
  const [tokenId, setTokenId] = useState('')
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [imageSize, setImageSize] = useState(imageSizes[0])
  const [customSize, setCustomSize] = useState('')
  const [videoMode, setVideoMode] = useState<
    'text_to_video' | 'image_to_video'
  >('text_to_video')
  const [duration, setDuration] = useState('5')
  const [ratio, setRatio] = useState(videoRatios[0])
  const [resolution, setResolution] = useState(videoResolutions[1])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageResult, setImageResult] = useState('')
  const [videoTaskId, setVideoTaskId] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [previewGeneration, setPreviewGeneration] =
    useState<WorkbenchGeneration | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)
  const videoUrlRef = useRef('')

  const keysQuery = useQuery({
    queryKey: ['workbench', 'keys'],
    queryFn: getWorkbenchKeys,
    staleTime: 30_000,
    retry: false,
  })

  const modelsQuery = useQuery({
    queryKey: ['workbench', 'models', tokenId, mode],
    queryFn: () => getWorkbenchModels(Number(tokenId), mode),
    enabled: tokenId !== '',
    staleTime: 30_000,
    retry: false,
  })

  useEffect(() => {
    const firstKey = keysQuery.data?.items[0]
    if (!tokenId && firstKey) setTokenId(String(firstKey.id))
  }, [keysQuery.data?.items, tokenId])

  useEffect(() => {
    const firstModel = modelsQuery.data?.models[0]
    if (firstModel && !modelsQuery.data?.models.includes(model)) {
      setModel(firstModel)
    }
    if (modelsQuery.data?.models.length === 0) setModel('')
  }, [model, modelsQuery.data?.models])

  useEffect(() => {
    setModel('')
    setImageResult('')
    setVideoTaskId('')
    setVideoUrl('')
    setPreviewGeneration(null)
  }, [mode])

  const imageMutation = useMutation({
    mutationFn: () => {
      const size = customSize.trim() || imageSize
      const sizeResult = imageSizeSchema.safeParse(size)
      if (!sizeResult.success) throw new Error(t('Invalid image size'))
      const [width, height] = size.split('x').map(Number)
      if (width < 128 || width > 4096 || height < 128 || height > 4096) {
        throw new Error(t('Invalid image size'))
      }
      if (!prompt.trim() || !model || !tokenId) {
        throw new Error(t('Please complete the required fields'))
      }
      return generateImage(Number(tokenId), {
        model,
        prompt: prompt.trim(),
        size,
        n: 1,
      })
    },
    onSuccess: (response) => {
      const source = getImageSource(response)
      if (!source) {
        toast.error(t('No image was returned'))
        return
      }
      setImageResult(source)
      setPreviewGeneration(null)
      void queryClient.invalidateQueries({
        queryKey: ['workbench', 'generations'],
      })
      toast.success(t('Image generated'))
    },
    onError: (error) => {
      if (error instanceof Error && error.message === t('Invalid image size')) {
        toast.error(error.message)
        return
      }
      handleServerError(error)
    },
  })

  const videoMutation = useMutation({
    mutationFn: () => {
      if (!prompt.trim() || !model || !tokenId) {
        throw new Error(t('Please complete the required fields'))
      }
      const parsedDuration = Number(duration)
      if (!positiveIntegerSchema.safeParse(parsedDuration).success) {
        throw new Error(t('Duration must be a positive integer'))
      }
      if (videoMode === 'image_to_video' && !imageFile) {
        throw new Error(t('Select an image file'))
      }
      idempotencyKeyRef.current ??= generateUUID()
      const payload: VideoGenerationPayload = {
        model,
        prompt: prompt.trim(),
        mode: videoMode,
        duration_seconds: parsedDuration,
        ratio,
        video_resolution: resolution,
        image: imageFile ?? undefined,
      }
      return createVideo(Number(tokenId), payload, idempotencyKeyRef.current)
    },
    onSuccess: (response) => {
      if (!response.id) {
        toast.error(t('Failed to create video'))
        return
      }
      setVideoTaskId(response.id)
      setVideoUrl('')
      setPreviewGeneration(null)
      toast.success(t('Video generation started'))
    },
    onError: (error) => handleServerError(error),
  })

  const videoTaskQuery = useQuery<VideoTaskResponse>({
    queryKey: ['workbench', 'video-task', tokenId, videoTaskId],
    queryFn: () => getVideoTask(Number(tokenId), videoTaskId),
    enabled: tokenId !== '' && videoTaskId !== '',
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status?.toLowerCase()
      return status && terminalVideoStatuses.has(status) ? false : 3000
    },
  })

  const videoTaskStatus = videoTaskQuery.data?.status?.toLowerCase()

  useEffect(() => {
    if (videoTaskStatus !== 'completed') return
    setPreviewGeneration(null)
    void queryClient.invalidateQueries({
      queryKey: ['workbench', 'generations'],
    })
  }, [videoTaskStatus, queryClient])

  const videoContentQuery = useQuery({
    queryKey: ['workbench', 'video-content', tokenId, videoTaskId],
    queryFn: () => downloadVideo(Number(tokenId), videoTaskId),
    enabled:
      tokenId !== '' && videoTaskId !== '' && videoTaskStatus === 'completed',
    retry: false,
  })

  useEffect(() => {
    if (!videoContentQuery.data) return
    const nextUrl = URL.createObjectURL(videoContentQuery.data)
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    videoUrlRef.current = nextUrl
    setVideoUrl(nextUrl)
    return () => {
      URL.revokeObjectURL(nextUrl)
      if (videoUrlRef.current === nextUrl) videoUrlRef.current = ''
    }
  }, [videoContentQuery.data])

  useEffect(
    () => () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    },
    []
  )

  useEffect(() => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current)
      videoUrlRef.current = ''
    }
    setVideoUrl('')
  }, [tokenId, videoTaskId])

  const keys = keysQuery.data?.items ?? []
  const models = modelsQuery.data?.models ?? []
  const selectedKey = keys.find((item) => String(item.id) === tokenId)
  const isBusy = imageMutation.isPending || videoMutation.isPending

  const onModeChange = (value: string) => {
    if (value === 'image' || value === 'video') setMode(value)
  }

  const onTokenIdChange = (value: string) => {
    setTokenId(value)
    setModel('')
    setImageResult('')
    setVideoTaskId('')
    setPreviewGeneration(null)
  }

  const onVideoModeChange = (value: string) => {
    if (value !== 'text_to_video' && value !== 'image_to_video') return
    setVideoMode(value)
    if (value === 'text_to_video') setImageFile(null)
  }

  const onSubmit = () => {
    setPreviewGeneration(null)
    if (mode === 'image') {
      imageMutation.mutate()
      return
    }
    if (!videoMutation.isError) idempotencyKeyRef.current = generateUUID()
    videoMutation.mutate()
  }

  return {
    mode,
    onModeChange,
    tokenId,
    onTokenIdChange,
    keys,
    keysLoading: keysQuery.isLoading,
    models,
    modelsLoading: modelsQuery.isLoading,
    model,
    onModelChange: setModel,
    prompt,
    onPromptChange: setPrompt,
    imageSize,
    onImageSizeChange: setImageSize,
    customSize,
    onCustomSizeChange: setCustomSize,
    videoMode,
    onVideoModeChange,
    duration,
    onDurationChange: setDuration,
    ratio,
    onRatioChange: setRatio,
    resolution,
    onResolutionChange: setResolution,
    imageFile,
    onImageFileChange: setImageFile,
    isBusy,
    submitDisabled:
      isBusy ||
      !selectedKey ||
      !model ||
      !prompt.trim() ||
      modelsQuery.isLoading,
    onSubmit,
    imagePending: imageMutation.isPending,
    imageResult,
    videoTask: videoTaskQuery.data,
    videoTaskError: videoTaskQuery.isError,
    videoContentLoading: videoContentQuery.isLoading,
    videoUrl,
    onRetryVideoTask: () => void videoTaskQuery.refetch(),
    previewGeneration,
    onPreviewGeneration: setPreviewGeneration,
    dataError: keysQuery.isError || modelsQuery.isError,
  }
}

export type WorkbenchController = ReturnType<typeof useWorkbench>
