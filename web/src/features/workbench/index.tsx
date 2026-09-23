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
import { AlertCircle, ImageIcon, Video, WandSparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { GeneratePanel } from './components/generate-panel'
import { HistoryGallery } from './components/history-gallery'
import { PreviewCard } from './components/preview-card'
import { useWorkbench } from './hooks/use-workbench'

export function Workbench() {
  const { t } = useTranslation()
  const controller = useWorkbench()

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

        {controller.dataError && (
          <Alert variant='destructive'>
            <AlertCircle aria-hidden='true' />
            <AlertTitle>{t('Failed to load workbench data')}</AlertTitle>
            <AlertDescription>
              {t('Please refresh the page and try again')}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={controller.mode} onValueChange={controller.onModeChange}>
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
          <GeneratePanel controller={controller} />
          <PreviewCard controller={controller} />
        </div>

        <HistoryGallery
          mode={controller.mode}
          onPreview={controller.onPreviewGeneration}
        />
      </div>
    </div>
  )
}
