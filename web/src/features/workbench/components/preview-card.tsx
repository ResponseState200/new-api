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
import { AlertCircle, Download, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'

import { getGenerationContentUrl } from '../api'
import type { WorkbenchController } from '../hooks/use-workbench'
import type { VideoTaskResponse, WorkbenchGeneration } from '../types'
import { getGenerationFileName } from '../utils'

function normalizeVideoProgress(progress: number | undefined): number {
  if (!Number.isFinite(progress)) return 0
  return Math.min(100, Math.max(0, progress ?? 0))
}

function getVideoStatusLabel(t: TFunction, status: string | undefined): string {
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

export function PreviewCard(props: { controller: WorkbenchController }) {
  const { t } = useTranslation()
  const controller = props.controller
  const previewGeneration = controller.previewGeneration

  let previewDescription: string
  if (previewGeneration) {
    previewDescription = t('Viewing a generation from history')
  } else if (controller.mode === 'image') {
    previewDescription = t('Your generated image will appear here')
  } else {
    previewDescription = t('Track the video task and preview the result here')
  }

  let previewContent: ReactNode
  if (previewGeneration) {
    previewContent = <GenerationPreview item={previewGeneration} />
  } else if (controller.mode === 'image') {
    if (controller.imagePending) {
      previewContent = (
        <div className='space-y-3' aria-busy='true'>
          <Skeleton
            className='min-h-64 w-full rounded-lg'
            aria-label={t('Generating image')}
          />
          <div className='text-muted-foreground flex items-center gap-2 text-xs'>
            <Spinner />
            {t('Generating image')}
          </div>
        </div>
      )
    } else if (controller.imageResult) {
      previewContent = (
        <div className='space-y-3'>
          <div className='bg-muted/50 flex min-h-64 items-center justify-center rounded-lg border p-3'>
            <img
              src={controller.imageResult}
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
                href={controller.imageResult}
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
        task={controller.videoTask}
        taskError={controller.videoTaskError}
        contentLoading={controller.videoContentLoading}
        videoUrl={controller.videoUrl}
        onRetry={controller.onRetryVideoTask}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Preview')}</CardTitle>
        <CardDescription>{previewDescription}</CardDescription>
      </CardHeader>
      <CardContent>{previewContent}</CardContent>
    </Card>
  )
}

function EmptyPreview(props: { message: string }) {
  return (
    <div className='text-muted-foreground flex min-h-64 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm'>
      {props.message}
    </div>
  )
}

function GenerationPreview(props: { item: WorkbenchGeneration }) {
  const { t } = useTranslation()
  const contentUrl = getGenerationContentUrl(props.item.id)
  return (
    <div className='space-y-3'>
      <div className='bg-muted/50 flex min-h-64 items-center justify-center rounded-lg border p-3'>
        {props.item.type === 'image' ? (
          <img
            src={contentUrl}
            alt={props.item.prompt || t('Generated image')}
            className='max-h-[520px] w-full object-contain'
          />
        ) : (
          <video
            src={contentUrl}
            controls
            preload='metadata'
            className='max-h-[520px] w-full rounded-lg bg-black'
          />
        )}
      </div>
      <Button
        variant='outline'
        size='sm'
        nativeButton={false}
        render={
          <a
            href={contentUrl}
            download={getGenerationFileName(props.item)}
            rel='noopener noreferrer'
          />
        }
      >
        <Download data-icon='inline-start' aria-hidden='true' />
        {t('Download')}
      </Button>
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
  if (!props.task)
    return <EmptyPreview message={props.t('No video task yet')} />

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
