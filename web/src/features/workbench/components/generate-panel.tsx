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
import { ImageIcon, Upload } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

import { imageSizes, videoRatios, videoResolutions } from '../constants'
import type { WorkbenchController } from '../hooks/use-workbench'

export function GeneratePanel(props: { controller: WorkbenchController }) {
  const { t } = useTranslation()
  const controller = props.controller

  const keyItems = useMemo(
    () =>
      controller.keys.map((key) => ({
        value: String(key.id),
        label: `${key.name || `${t('API Key')} #${key.id}`} / ${key.group || t('Auto')}`,
      })),
    [controller.keys, t]
  )

  const submitLabel =
    controller.mode === 'image' ? t('Generate image') : t('Generate video')
  let submitIcon = <Upload data-icon='inline-start' aria-hidden='true' />
  if (controller.isBusy) {
    submitIcon = <Spinner data-icon='inline-start' />
  } else if (controller.mode === 'image') {
    submitIcon = <ImageIcon data-icon='inline-start' aria-hidden='true' />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {controller.mode === 'image'
            ? t('Image generation')
            : t('Video generation')}
        </CardTitle>
        <CardDescription>
          {t('Choose an enabled API key and a supported model')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid gap-2'>
          <Label htmlFor='workbench-key'>{t('API Key')}</Label>
          {controller.keysLoading ? (
            <Skeleton className='h-8 w-full' />
          ) : (
            <Select
              items={keyItems}
              value={controller.tokenId}
              onValueChange={(value) => {
                if (value === null) return
                controller.onTokenIdChange(value)
              }}
            >
              <SelectTrigger id='workbench-key' className='w-full'>
                <SelectValue placeholder={t('Select an API key')} />
              </SelectTrigger>
              <SelectContent>
                {controller.keys.map((key) => (
                  <SelectItem key={key.id} value={String(key.id)}>
                    {key.name || `${t('API Key')} #${key.id}`} /{' '}
                    {key.group || t('Auto')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!controller.keysLoading && controller.keys.length === 0 && (
            <p className='text-muted-foreground text-xs'>
              {t('No enabled API keys found')}
            </p>
          )}
        </div>

        <div className='grid gap-2'>
          <Label htmlFor='workbench-model'>{t('Model')}</Label>
          <Select
            value={controller.model}
            onValueChange={(value) => {
              if (value !== null) controller.onModelChange(value)
            }}
            disabled={
              !controller.tokenId ||
              controller.modelsLoading ||
              controller.models.length === 0
            }
          >
            <SelectTrigger id='workbench-model' className='w-full'>
              <SelectValue placeholder={t('Select a model')} />
            </SelectTrigger>
            <SelectContent>
              {controller.models.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!controller.modelsLoading &&
            controller.tokenId &&
            controller.models.length === 0 && (
              <p className='text-muted-foreground text-xs'>
                {t('No media models available')}
              </p>
            )}
        </div>

        <div className='grid gap-2'>
          <Label htmlFor='workbench-prompt'>{t('Prompt')}</Label>
          <Textarea
            id='workbench-prompt'
            value={controller.prompt}
            onChange={(event) => controller.onPromptChange(event.target.value)}
            placeholder={t('Describe the image or video you want to create')}
            rows={5}
          />
        </div>

        {controller.mode === 'image' ? (
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='workbench-image-size'>{t('Image size')}</Label>
              <Select
                value={controller.imageSize}
                onValueChange={(value) => {
                  if (value !== null) controller.onImageSizeChange(value)
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
                value={controller.customSize}
                onChange={(event) =>
                  controller.onCustomSizeChange(event.target.value)
                }
                placeholder='WIDTHxHEIGHT'
                inputMode='numeric'
              />
            </div>
          </div>
        ) : (
          <>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='grid gap-2'>
                <Label htmlFor='workbench-video-mode'>
                  {t('Generation mode')}
                </Label>
                <Select
                  value={controller.videoMode}
                  onValueChange={(value) => {
                    if (value !== null) controller.onVideoModeChange(value)
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
                  value={controller.duration}
                  onChange={(event) =>
                    controller.onDurationChange(event.target.value)
                  }
                />
              </div>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='grid gap-2'>
                <Label htmlFor='workbench-ratio'>{t('Aspect ratio')}</Label>
                <Select
                  value={controller.ratio}
                  onValueChange={(value) => {
                    if (value !== null) controller.onRatioChange(value)
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
                  value={controller.resolution}
                  onValueChange={(value) => {
                    if (value !== null) controller.onResolutionChange(value)
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
            {controller.videoMode === 'image_to_video' && (
              <div className='grid gap-2'>
                <Label htmlFor='workbench-image-upload'>
                  {t('Upload an image')}
                </Label>
                <Input
                  id='workbench-image-upload'
                  type='file'
                  accept='image/*'
                  onChange={(event) =>
                    controller.onImageFileChange(
                      event.target.files?.[0] ?? null
                    )
                  }
                />
                {controller.imageFile && (
                  <p className='text-muted-foreground truncate text-xs'>
                    {controller.imageFile.name}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <Button
          type='button'
          className='w-full sm:w-auto'
          disabled={controller.submitDisabled}
          onClick={controller.onSubmit}
        >
          {submitIcon}
          {submitLabel}
        </Button>
      </CardContent>
    </Card>
  )
}
