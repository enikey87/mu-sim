// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Restore } from './Restore'
import type { TransferChannel } from '../platform/transfer'

function channel(pull: (token: string) => Promise<string | null>): TransferChannel {
  return { token: () => 'token_1234567890', push: vi.fn(), pull: vi.fn(pull) }
}

describe('кнопка «Восстановить партию» (#1488)', () => {
  it('показывает перенос только как выбор: обе кнопки на месте', () => {
    render(<Restore channel={channel(async () => null)} token="token_1234567890" onRestore={vi.fn()} onSkip={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Восстановить партию' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Начать заново' })).toBeTruthy()
  })

  it('восстановление отдаёт партии ту же строку, что пришла с сервера', async () => {
    const onRestore = vi.fn()
    const pull = vi.fn(async () => '{"day":42,"msgs":[]}')
    render(<Restore channel={channel(pull)} token="token_1234567890" onRestore={onRestore} onSkip={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Восстановить партию' }))

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith('{"day":42,"msgs":[]}'))
    expect(pull).toHaveBeenCalledWith('token_1234567890')
  })

  it('погашенная ссылка объясняет, где взять новую, и не запускает партию', async () => {
    const onRestore = vi.fn()
    render(<Restore channel={channel(async () => null)} token="token_1234567890" onRestore={onRestore} onSkip={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Восстановить партию' }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('/load'))
    expect(onRestore).not.toHaveBeenCalled()
  })

  it('«Начать заново» не трогает сервер', () => {
    const onSkip = vi.fn()
    const pull = vi.fn(async () => '{"day":1}')
    render(<Restore channel={channel(pull)} token="token_1234567890" onRestore={vi.fn()} onSkip={onSkip} />)

    fireEvent.click(screen.getByRole('button', { name: 'Начать заново' }))

    expect(onSkip).toHaveBeenCalledOnce()
    expect(pull).not.toHaveBeenCalled()
  })
})
