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
import { Download, ImageIcon, Play, Trash2, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import dayjs from '@/lib/dayjs'
import { handleServerError } from '@/lib/handle-server-error'

import {
  deleteGeneration,
  getGenerationContentUrl,
  listGenerations,
} from '../api'
import type { WorkbenchGeneration, WorkbenchMode } from '../types'
import {
  formatRemainingTime,
  getGenerationFileName,
  getGenerationParamsSummary,
} from '../utils'

export function HistoryGallery(props: {
  mode: WorkbenchMode
  onPreview: (item: WorkbenchGeneration) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] =
    useState<WorkbenchGeneration | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const generationsQuery = useQuery({
    queryKey: ['workbench', 'generations', props.mode],
    queryFn: () => listGenerations(props.mode),
    staleTime: 15_000,
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteGeneration(id),
    onSuccess: () => {
      toast.success(t('Generation deleted'))
      setPendingDelete(null)
      void queryClient.invalidateQueries({
        queryKey: ['workbench', 'generations'],
      })
    },
    onError: (error) => handleServerError(error),
  })

  const items = generationsQuery.data?.items ?? []

  let content: React.ReactNode
  if (generationsQuery.isLoading) {
    content = (
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='aspect-[3/4] w-full rounded-lg' />
        ))}
      </div>
    )
  } else if (generationsQuery.isError) {
    content = (
      <ErrorState
        className='min-h-40'
        title={t('Failed to load generation history')}
        onRetry={() => void generationsQuery.refetch()}
      />
    )
  } else if (items.length === 0) {
    content = (
      <EmptyState
        className='min-h-40'
        icon={props.mode === 'image' ? ImageIcon : Video}
        title={t('No generations yet')}
        description={t('New generations will appear here')}
      />
    )
  } else {
    content = (
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'>
        {items.map((item) => (
          <GenerationCard
            key={item.id}
            item={item}
            now={now}
            onPreview={() => props.onPreview(item)}
            onDelete={() => setPendingDelete(item)}
          />
        ))}
      </div>
    )
  }

  return (
    <section
      aria-labelledby='workbench-history-title'
      className='flex flex-col gap-3'
    >
      <div className='flex flex-col gap-1'>
        <h2
          id='workbench-history-title'
          className='text-lg font-semibold tracking-tight'
        >
          {t('Generation history')}
        </h2>
        <p className='text-muted-foreground text-sm'>
          {t('Generated media is kept for 24 hours')}
        </p>
      </div>
      {content}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={t('Delete this generation?')}
        desc={t(
          'The generated media will be permanently removed. This action cannot be undone.'
        )}
        destructive
        confirmText={t('Delete')}
        isLoading={deleteMutation.isPending}
        handleConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id)
        }}
      />
    </section>
  )
}

function GenerationCard(props: {
  item: WorkbenchGeneration
  now: number
  onPreview: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const contentUrl = getGenerationContentUrl(props.item.id)
  const paramsSummary = getGenerationParamsSummary(props.item)

  return (
    <div className='bg-card flex flex-col overflow-hidden rounded-lg border'>
      <button
        type='button'
        onClick={props.onPreview}
        aria-label={t('Load into preview')}
        className='bg-muted/50 focus-visible:ring-ring/50 relative block aspect-video w-full cursor-pointer outline-none focus-visible:ring-3'
      >
        {props.item.type === 'image' ? (
          <img
            src={contentUrl}
            alt={props.item.prompt || t('Generated image')}
            loading='lazy'
            className='h-full w-full object-cover'
          />
        ) : (
          <span className='text-muted-foreground flex h-full w-full items-center justify-center'>
            <Play className='size-8' aria-hidden='true' />
          </span>
        )}
      </button>
      <div className='flex flex-1 flex-col gap-2 p-3'>
        <div className='flex items-center justify-between gap-2 text-xs'>
          <span className='truncate font-medium'>{props.item.model}</span>
          <span className='text-muted-foreground shrink-0'>
            {dayjs.unix(props.item.created_at).format('YYYY-MM-DD HH:mm')}
          </span>
        </div>
        <p className='text-muted-foreground line-clamp-2 min-h-8 text-xs break-all'>
          {props.item.prompt}
        </p>
        {paramsSummary && (
          <p className='text-muted-foreground text-xs'>{paramsSummary}</p>
        )}
        <div className='mt-auto flex items-center justify-between gap-2'>
          <span className='text-muted-foreground text-xs'>
            {formatRemainingTime(props.item.expires_at, props.now, t)}
          </span>
          <div className='flex items-center gap-1'>
            <Button
              variant='ghost'
              size='icon-sm'
              nativeButton={false}
              render={
                <a
                  href={contentUrl}
                  download={getGenerationFileName(props.item)}
                  rel='noopener noreferrer'
                  aria-label={t('Download')}
                />
              }
            >
              <Download aria-hidden='true' />
            </Button>
            <Button
              variant='ghost'
              size='icon-sm'
              className='text-destructive'
              onClick={props.onDelete}
              aria-label={t('Delete')}
            >
              <Trash2 aria-hidden='true' />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
