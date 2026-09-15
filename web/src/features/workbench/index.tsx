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
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  Download,
  ImageIcon,
  RefreshCw,
  Upload,
  Video,
  WandSparkles,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import {
  createVideo,
  downloadVideo,
  generateImage,
  getVideoTask,
  getWorkbenchKeys,
  getWorkbenchModels,
} from './api'
import type {
  ImageGenerationResponse,
  VideoGenerationPayload,
  VideoTaskResponse,
  WorkbenchMode,
} from './types'

const imageSizes = [
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '1792x1024',
  '1024x1792',
]
const videoRatios = ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9']
const videoResolutions = ['480p', '720p', '1080p', '4k']
const terminalVideoStatuses = new Set(['completed', 'failed', 'cancelled'])

const imageSizeSchema = z.string().regex(/^\d{3,4}x\d{3,4}$/, 'Invalid image size')
const positiveIntegerSchema = z.number().int().positive()

function getImageSource(response: ImageGenerationResponse): string {
  const image = response.data?.[0]
  if (!image) return ''
  if (image.b64_json) return `data:image/png;base64,${image.b64_json}`
  return image.url ?? ''
}

function normalizeVideoProgress(progress: number | undefined): number {
  if (!Number.isFinite(progress)) return 0
  return Math.min(100, Math.max(0, progress ?? 0))
}

function getVideoStatusLabel(
  t: TFunction,
  status: string | undefined
): string {
  switch (status) {
    case 'queued':
      return t('Queued')
    case 'in_progress':
      return t('In progress')
    case 'completed':
      return t('Completed')
    case 'failed':
      return t('Failed')
    case 'cancelled':
      return t('Cancelled')
    default:
      return status || t('Unknown')
  }
}

export function Workbench() {
  const { t } = useTranslation()
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
      idempotencyKeyRef.current ??= crypto.randomUUID()
      const payload: VideoGenerationPayload = {
        model,
        prompt: prompt.trim(),
        mode: videoMode,
        duration_seconds: parsedDuration,
        ratio,
        video_resolution: resolution,
        image: imageFile ?? undefined,
      }
      return createVideo(
        Number(tokenId),
        payload,
        idempotencyKeyRef.current
      )
    },
    onSuccess: (response) => {
      if (!response.id) {
        toast.error(t('Failed to create video'))
        return
      }
      setVideoTaskId(response.id)
      setVideoUrl('')
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

  const videoContentQuery = useQuery({
    queryKey: ['workbench', 'video-content', tokenId, videoTaskId],
    queryFn: () => downloadVideo(Number(tokenId), videoTaskId),
    enabled:
      tokenId !== '' &&
      videoTaskId !== '' &&
      videoTaskQuery.data?.status?.toLowerCase() === 'completed',
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
  const videoTask = videoTaskQuery.data
  const isBusy = imageMutation.isPending || videoMutation.isPending

  const handleModeChange = (value: string) => {
    if (value === 'image' || value === 'video') setMode(value)
  }

  const handleVideoSubmit = () => {
    if (!videoMutation.isError) idempotencyKeyRef.current = crypto.randomUUID()
    videoMutation.mutate()
  }

  const submitLabel =
    mode === 'image' ? t('Generate image') : t('Generate video')
  let submitIcon = <Upload data-icon='inline-start' aria-hidden='true' />
  if (isBusy) {
    submitIcon = <Spinner data-icon='inline-start' />
  } else if (mode === 'image') {
    submitIcon = <ImageIcon data-icon='inline-start' aria-hidden='true' />
  }

  const previewDescription =
    mode === 'image'
      ? t('Your generated image will appear here')
      : t('Track the video task and preview the result here')

  let previewContent: ReactNode
  if (mode === 'image') {
    if (imageResult) {
      previewContent = (
        <div className='space-y-3'>
          <div className='bg-muted/50 flex min-h-64 items-center justify-center rounded-lg border p-3'>
            <img
              src={imageResult}
              alt={t('Generated image')}
              className='max-h-[520px] w-full object-contain'
            />
          </div>
          <Button
            variant='outline'
            size='sm'
            nativeButton={false}
            render={
              <a
                href={imageResult}
                download='generated-image.png'
                rel='noopener noreferrer'
              />
            }
          >
            <Download data-icon='inline-start' aria-hidden='true' />
            {t('Download')}
          </Button>
        </div>
      )
    } else {
      previewContent = <EmptyPreview message={t('No image generated yet')} />
    }
  } else {
    previewContent = (
      <VideoResult
        t={t}
        task={videoTask}
        taskError={videoTaskQuery.isError}
        contentLoading={videoContentQuery.isLoading}
        videoUrl={videoUrl}
        onRetry={() => void videoTaskQuery.refetch()}
      />
    )
  }

  const renderDataError = () => {
    if (keysQuery.isError || modelsQuery.isError) {
      return (
        <Alert variant='destructive'>
          <AlertCircle aria-hidden='true' />
          <AlertTitle>{t('Failed to load workbench data')}</AlertTitle>
          <AlertDescription>
            {t('Please refresh the page and try again')}
          </AlertDescription>
        </Alert>
      )
    }
    return null
  }

  return (
    <div className='h-full overflow-auto'>
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6'>
        <header className='flex flex-col gap-1'>
          <div className='flex items-center gap-2'>
            <WandSparkles className='text-primary size-5' aria-hidden='true' />
            <h1 className='text-xl font-semibold tracking-tight'>
              {t('Online Workbench')}
            </h1>
          </div>
          <p className='text-muted-foreground text-sm'>
            {t('Generate images and videos with an API key')}
          </p>
        </header>

        {renderDataError()}

        <Tabs value={mode} onValueChange={handleModeChange}>
          <TabsList aria-label={t('Generation type')}>
            <TabsTrigger value='image'>
              <ImageIcon aria-hidden='true' />
              {t('Image generation')}
            </TabsTrigger>
            <TabsTrigger value='video'>
              <Video aria-hidden='true' />
              {t('Video generation')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className='grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
          <Card>
            <CardHeader>
              <CardTitle>{mode === 'image' ? t('Image generation') : t('Video generation')}</CardTitle>
              <CardDescription>
                {t('Choose an enabled API key and a supported model')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid gap-2'>
                <Label htmlFor='workbench-key'>{t('API Key')}</Label>
                {keysQuery.isLoading ? (
                  <Skeleton className='h-8 w-full' />
                ) : (
                  <Select
                    value={tokenId}
                    onValueChange={(value) => {
                      if (value === null) return
                      setTokenId(value)
                      setModel('')
                      setImageResult('')
                      setVideoTaskId('')
                    }}
                  >
                    <SelectTrigger id='workbench-key' className='w-full'>
                      <SelectValue placeholder={t('Select an API key')} />
                    </SelectTrigger>
                    <SelectContent>
                      {keys.map((key) => (
                        <SelectItem key={key.id} value={String(key.id)}>
                          {key.name || `${t('API Key')} #${key.id}`} / {key.group || t('Auto')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!keysQuery.isLoading && keys.length === 0 && (
                  <p className='text-muted-foreground text-xs'>
                    {t('No enabled API keys found')}
                  </p>
                )}
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='workbench-model'>{t('Model')}</Label>
                <Select
                  value={model}
                  onValueChange={(value) => {
                    if (value !== null) setModel(value)
                  }}
                  disabled={!tokenId || modelsQuery.isLoading || models.length === 0}
                >
                  <SelectTrigger id='workbench-model' className='w-full'>
                    <SelectValue placeholder={t('Select a model')} />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!modelsQuery.isLoading && tokenId && models.length === 0 && (
                  <p className='text-muted-foreground text-xs'>
                    {t('No media models available')}
                  </p>
                )}
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='workbench-prompt'>{t('Prompt')}</Label>
                <Textarea
                  id='workbench-prompt'
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t('Describe the image or video you want to create')}
                  rows={5}
                />
              </div>

              {mode === 'image' ? (
                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='grid gap-2'>
                    <Label htmlFor='workbench-image-size'>{t('Image size')}</Label>
                    <Select
                      value={imageSize}
                      onValueChange={(value) => {
                        if (value !== null) setImageSize(value)
                      }}
                    >
                      <SelectTrigger id='workbench-image-size' className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {imageSizes.map((size) => (
                          <SelectItem key={size} value={size}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='grid gap-2'>
                    <Label htmlFor='workbench-custom-size'>{t('Custom size')}</Label>
                    <Input
                      id='workbench-custom-size'
                      value={customSize}
                      onChange={(event) => setCustomSize(event.target.value)}
                      placeholder='WIDTHxHEIGHT'
                      inputMode='numeric'
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className='grid gap-4 sm:grid-cols-2'>
                    <div className='grid gap-2'>
                      <Label htmlFor='workbench-video-mode'>{t('Generation mode')}</Label>
                      <Select
                        value={videoMode}
                        onValueChange={(value) => {
                          if (
                            value === 'text_to_video' ||
                            value === 'image_to_video'
                          ) {
                            setVideoMode(value)
                            if (value === 'text_to_video') setImageFile(null)
                          }
                        }}
                      >
                        <SelectTrigger id='workbench-video-mode' className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='text_to_video'>
                            {t('Text to video')}
                          </SelectItem>
                          <SelectItem value='image_to_video'>
                            {t('Image to video')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='grid gap-2'>
                      <Label htmlFor='workbench-duration'>{t('Duration')}</Label>
                      <Input
                        id='workbench-duration'
                        type='number'
                        min={1}
                        value={duration}
                        onChange={(event) => setDuration(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className='grid gap-4 sm:grid-cols-2'>
                    <div className='grid gap-2'>
                      <Label htmlFor='workbench-ratio'>{t('Aspect ratio')}</Label>
                      <Select
                        value={ratio}
                        onValueChange={(value) => {
                          if (value !== null) setRatio(value)
                        }}
                      >
                        <SelectTrigger id='workbench-ratio' className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {videoRatios.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='grid gap-2'>
                      <Label htmlFor='workbench-resolution'>{t('Resolution')}</Label>
                      <Select
                        value={resolution}
                        onValueChange={(value) => {
                          if (value !== null) setResolution(value)
                        }}
                      >
                        <SelectTrigger id='workbench-resolution' className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {videoResolutions.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {videoMode === 'image_to_video' && (
                    <div className='grid gap-2'>
                      <Label htmlFor='workbench-image-upload'>
                        {t('Upload an image')}
                      </Label>
                      <Input
                        id='workbench-image-upload'
                        type='file'
                        accept='image/*'
                        onChange={(event) =>
                          setImageFile(event.target.files?.[0] ?? null)
                        }
                      />
                      {imageFile && (
                        <p className='text-muted-foreground truncate text-xs'>
                          {imageFile.name}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              <Button
                type='button'
                className='w-full sm:w-auto'
                disabled={
                  isBusy ||
                  !selectedKey ||
                  !model ||
                  !prompt.trim() ||
                  modelsQuery.isLoading
                }
                onClick={() =>
                  mode === 'image'
                    ? imageMutation.mutate()
                    : handleVideoSubmit()
                }
              >
                {submitIcon}
                {submitLabel}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Preview')}</CardTitle>
              <CardDescription>{previewDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {previewContent}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function EmptyPreview(props: { message: string }) {
  return (
    <div className='text-muted-foreground flex min-h-64 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm'>
      {props.message}
    </div>
  )
}

function VideoResult(props: {
  t: TFunction
  task?: VideoTaskResponse
  taskError: boolean
  contentLoading: boolean
  videoUrl: string
  onRetry: () => void
}) {
  if (props.taskError) {
    return (
      <Alert variant='destructive'>
        <AlertCircle aria-hidden='true' />
        <AlertTitle>{props.t('Failed to load video task')}</AlertTitle>
        <AlertDescription>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={props.onRetry}
          >
            <RefreshCw data-icon='inline-start' aria-hidden='true' />
            {props.t('Try again')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (!props.task) return <EmptyPreview message={props.t('No video task yet')} />

  const status = props.task.status.toLowerCase()
  const progress = normalizeVideoProgress(props.task.progress)
  if (status === 'failed') {
    return (
      <Alert variant='destructive'>
        <AlertCircle aria-hidden='true' />
        <AlertTitle>{props.t('Video generation failed')}</AlertTitle>
        <AlertDescription>
          {props.task.error?.message || props.t('The video task failed')}
        </AlertDescription>
      </Alert>
    )
  }
  if (status !== 'completed' || !props.videoUrl) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between gap-3 text-sm'>
          <span>{props.t('Video generation status')}</span>
          <span className='text-muted-foreground'>
            {getVideoStatusLabel(props.t, status)}
          </span>
        </div>
        <Progress value={progress} aria-label={props.t('Video progress')} />
        {props.contentLoading && (
          <div className='text-muted-foreground flex items-center gap-2 text-xs'>
            <Spinner />
            {props.t('Preparing video preview')}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className='space-y-3'>
      <video
        src={props.videoUrl}
        controls
        preload='metadata'
        className='max-h-[520px] w-full rounded-lg bg-black'
      />
      <Button
        variant='outline'
        size='sm'
        nativeButton={false}
        render={
          <a
            href={props.videoUrl}
            download='generated-video.mp4'
            rel='noopener noreferrer'
          />
        }
      >
        <Download data-icon='inline-start' aria-hidden='true' />
        {props.t('Download')}
      </Button>
    </div>
  )
}
