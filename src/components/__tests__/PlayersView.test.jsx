import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlayersView from '../PlayersView'

describe('PlayersView', () => {
  const basePlayer = {
    id: 'player-1',
    name: 'Alex Smith',
    rating: '3.5',
    type: 'DUPR',
    checkedIn: false,
    gamesPlayed: 0,
  }

  it('renders players and triggers actions', async () => {
    const user = userEvent.setup()
    const onCheckIn = vi.fn()
    const onCheckOut = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onBack = vi.fn()

    const players = [
      basePlayer,
      { ...basePlayer, id: 'player-2', name: 'Jamie Lee', checkedIn: true },
    ]

    render(
      <PlayersView
        players={players}
        onBack={onBack}
        onCheckIn={onCheckIn}
        onCheckOut={onCheckOut}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )

    expect(screen.getByText('Alex Smith')).toBeInTheDocument()
    expect(screen.getByText('Jamie Lee')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to courts' }))
    expect(onBack).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Check In' }))
    expect(onCheckIn).toHaveBeenCalledWith('player-1')

    await user.click(screen.getByRole('button', { name: 'Check Out' }))
    expect(onCheckOut).toHaveBeenCalledWith('player-2')

    const editButtons = screen.getAllByRole('button', { name: 'Edit' })
    await user.click(editButtons[0])
    expect(onEdit).toHaveBeenCalledWith(players[0])

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('player-1')
  })
})
