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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

import { getWorkbenchKeys, getWorkbenchModels, listGenerations } from '../api'
import { Workbench } from '../index'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    getWorkbenchKeys: vi.fn(),
    getWorkbenchModels: vi.fn(),
    generateImage: vi.fn(),
    createVideo: vi.fn(),
    getVideoTask: vi.fn(),
    downloadVideo: vi.fn(),
    listGenerations: vi.fn(),
    deleteGeneration: vi.fn(),
  }
})

const mockedGetKeys = vi.mocked(getWorkbenchKeys)
const mockedGetModels = vi.mocked(getWorkbenchModels)
const mockedListGenerations = vi.mocked(listGenerations)

function renderWorkbench() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <Workbench />
    </QueryClientProvider>
  )
}

function getKeyTrigger(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>('#workbench-key')
  if (!trigger) throw new Error('API key select trigger not found')
  return trigger
}

beforeEach(() => {
  mockedGetKeys.mockResolvedValue({
    items: [
      { id: 7, name: 'Production', group: 'vip' },
      { id: 8, name: '', group: '' },
    ],
  })
  mockedGetModels.mockResolvedValue({ models: [] })
  mockedListGenerations.mockResolvedValue({ items: [] })
})

it('shows the key name and group in the trigger instead of the numeric id after selecting a key', async () => {
  renderWorkbench()

  await waitFor(() =>
    expect(getKeyTrigger()).toHaveTextContent('Production / vip')
  )

  await userEvent.click(getKeyTrigger())
  await userEvent.click(
    await screen.findByRole('option', { name: /API Key #8 \/ Auto/ })
  )

  await waitFor(() =>
    expect(getKeyTrigger()).toHaveTextContent('API Key #8 / Auto')
  )
})
