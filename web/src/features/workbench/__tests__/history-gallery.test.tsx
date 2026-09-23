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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { deleteGeneration, listGenerations } from '../api'
import { HistoryGallery } from '../components/history-gallery'
import type { WorkbenchGeneration } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    listGenerations: vi.fn(),
    deleteGeneration: vi.fn(),
  }
})

const mockedListGenerations = vi.mocked(listGenerations)
const mockedDeleteGeneration = vi.mocked(deleteGeneration)

function makeItem(
  overrides: Partial<WorkbenchGeneration> = {}
): WorkbenchGeneration {
  const nowSeconds = Math.floor(Date.now() / 1000)
  return {
    id: 42,
    type: 'image',
    model: 'gpt-image-1',
    prompt: 'a cat wearing sunglasses',
    params: '{"size":"1024x1024"}',
    mime_type: 'image/png',
    size_bytes: 2048,
    created_at: nowSeconds - 600,
    expires_at: nowSeconds + 5 * 3600 + 30 * 60 + 30,
    ...overrides,
  }
}

function renderGallery(onPreview = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <HistoryGallery mode='image' onPreview={onPreview} />
    </QueryClientProvider>
  )
  return onPreview
}

it('renders multiple generations with model, prompt summary, and remaining time', async () => {
  mockedListGenerations.mockResolvedValue({
    items: [
      makeItem(),
      makeItem({
        id: 43,
        type: 'video',
        model: 'kling-v2',
        prompt: 'waves at sunset',
        params: '{"ratio":"16:9","resolution":"720p","duration_seconds":5}',
        task_id: 'task-43',
        mime_type: 'video/mp4',
      }),
    ],
  })
  renderGallery()

  expect(await screen.findByText('gpt-image-1')).toBeInTheDocument()
  expect(screen.getByText('kling-v2')).toBeInTheDocument()
  expect(screen.getByText('a cat wearing sunglasses')).toBeInTheDocument()
  expect(screen.getByText('waves at sunset')).toBeInTheDocument()
  expect(screen.getAllByText('Remaining: 5h 30m')).toHaveLength(2)
  expect(screen.getByText('1024x1024')).toBeInTheDocument()
  expect(screen.getByText('5s · 720p · 16:9')).toBeInTheDocument()
})

it('loads a generation into the preview when its thumbnail is clicked', async () => {
  mockedListGenerations.mockResolvedValue({ items: [makeItem()] })
  const onPreview = renderGallery()

  await userEvent.click(
    await screen.findByRole('button', { name: 'Load into preview' })
  )

  expect(onPreview).toHaveBeenCalledTimes(1)
  expect(onPreview).toHaveBeenCalledWith(
    expect.objectContaining({ id: 42, model: 'gpt-image-1' })
  )
})

it('shows the empty state when there are no generations', async () => {
  mockedListGenerations.mockResolvedValue({ items: [] })
  renderGallery()

  expect(await screen.findByText('No generations yet')).toBeInTheDocument()
})

it('deletes a generation only after confirming in the dialog', async () => {
  mockedListGenerations.mockResolvedValue({ items: [makeItem()] })
  mockedDeleteGeneration.mockResolvedValue(undefined)
  renderGallery()

  const deleteButtons = await screen.findAllByRole('button', {
    name: 'Delete',
  })
  await userEvent.click(deleteButtons[0])

  const dialog = await screen.findByRole('alertdialog')
  expect(dialog).toHaveTextContent('Delete this generation?')

  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

  await waitFor(() => expect(mockedDeleteGeneration).toHaveBeenCalledWith(42))
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  )
})
