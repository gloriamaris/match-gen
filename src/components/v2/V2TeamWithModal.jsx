import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

const NONE_TEAMMATE_VALUE = 'none'

export default function V2TeamWithModal({
  isOpen,
  player,
  players,
  onClose,
  onSave,
}) {
  const [teammateId, setTeammateId] = useState('')
  const isEditMode = Boolean(player?.teammateId)

  const currentTeammate = useMemo(
    () => players.find((nextPlayer) => nextPlayer.id === player?.teammateId) ?? null,
    [players, player?.teammateId]
  )

  const availablePlayers = useMemo(
    () =>
      players.filter(
        (nextPlayer) =>
          nextPlayer.id !== player?.id &&
          (!nextPlayer.teammateId || nextPlayer.id === player?.teammateId)
      ),
    [players, player?.id, player?.teammateId]
  )

  useEffect(() => {
    if (!isOpen) return

    const currentTeammateStillAvailable = availablePlayers.some(
      (nextPlayer) => nextPlayer.id === player?.teammateId
    )

    if (isEditMode && currentTeammateStillAvailable) {
      setTeammateId(player.teammateId)
      return
    }

    setTeammateId(availablePlayers[0]?.id || '')
  }, [isOpen, availablePlayers, player?.teammateId, isEditMode])

  if (!isOpen || !player) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!teammateId) return
    onSave?.({
      playerId: player.id,
      teammateId:
        teammateId === NONE_TEAMMATE_VALUE ? null : teammateId,
    })
    onClose()
  }

  const canSave = isEditMode
    ? Boolean(teammateId)
    : Boolean(teammateId && teammateId !== NONE_TEAMMATE_VALUE)

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEditMode ? `Edit Pair for ${player.name}` : `Pair with ${player.name}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {isEditMode && currentTeammate ? (
          <p className="mt-3 text-sm text-slate-600">
            Currently Paired with:{' '}
            <span className="font-medium text-slate-800">{currentTeammate.name}</span>
          </p>
        ) : null}

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Select Teammate
            <select
              value={teammateId}
              onChange={(event) => setTeammateId(event.target.value)}
              disabled={!isEditMode && availablePlayers.length === 0}
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {isEditMode ? (
                <option value={NONE_TEAMMATE_VALUE}>None</option>
              ) : null}
              {!isEditMode && availablePlayers.length === 0 ? (
                <option value="">No other players available</option>
              ) : (
                availablePlayers.map((nextPlayer) => (
                  <option key={nextPlayer.id} value={nextPlayer.id}>
                    {nextPlayer.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
