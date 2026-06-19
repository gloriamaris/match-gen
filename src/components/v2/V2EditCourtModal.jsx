import React, { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { canPlayerGroupsOpponents } from '../../match-engines/v2/ProgressivePlay.engine'
import { V2_GAME_TYPES } from './v2Storage'

export default function V2EditCourtModal({
  isOpen,
  courtIndex,
  gameMode = 'doubles',
  gameType,
  currentTeamA = [],
  currentTeamB = [],
  checkedInPlayers = [],
  allowAdjacentSkillMixing = true,
  onClose,
  onSubmit,
}) {
  const playersPerTeam = gameMode === 'singles' ? 1 : 2
  const isRoundRobin = gameType === V2_GAME_TYPES.ROUND_ROBIN
  const emptyTeam = () => Array.from({ length: playersPerTeam }, () => '')
  const [teamAIds, setTeamAIds] = useState(emptyTeam)
  const [teamBIds, setTeamBIds] = useState(emptyTeam)
  const [errors, setErrors] = useState({
    teamA: '',
    teamB: '',
    duplicate: '',
    skillGroup: '',
  })

  useEffect(() => {
    if (isOpen) {
      setTeamAIds(
        Array.from({ length: playersPerTeam }, (_, i) => currentTeamA[i]?.id ?? '')
      )
      setTeamBIds(
        Array.from({ length: playersPerTeam }, (_, i) => currentTeamB[i]?.id ?? '')
      )
      setErrors({ teamA: '', teamB: '', duplicate: '', skillGroup: '' })
    }
  }, [isOpen, courtIndex, playersPerTeam])

  const selectedIds = useMemo(
    () => new Set([...teamAIds, ...teamBIds].filter(Boolean)),
    [teamAIds, teamBIds]
  )

  const getAvailable = (currentId) =>
    checkedInPlayers.filter(
      (p) => p.id === currentId || !selectedIds.has(p.id)
    )

  const handleSelect = (team, slot, value) => {
    if (team === 'A') {
      setTeamAIds((prev) => prev.map((v, i) => (i === slot ? value : v)))
    } else {
      setTeamBIds((prev) => prev.map((v, i) => (i === slot ? value : v)))
    }
    setErrors({ teamA: '', teamB: '', duplicate: '', skillGroup: '' })
  }

  const getSelectedPlayers = (playerIds) =>
    playerIds
      .map((id) => checkedInPlayers.find((player) => player.id === id))
      .filter(Boolean)

  const handleSubmit = (e) => {
    e.preventDefault()
    const filteredA = teamAIds.filter(Boolean)
    const filteredB = teamBIds.filter(Boolean)
    const allIds = [...filteredA, ...filteredB]
    const hasDuplicates = new Set(allIds).size !== allIds.length
    const teamAPlayers = getSelectedPlayers(filteredA)
    const teamBPlayers = getSelectedPlayers(filteredB)

    // Round Robin has no skill-group constraint; skill validation only applies
    // to the (doubles) Progressive Play / Throne Run modes.
    const teamsCannotPlay =
      !isRoundRobin &&
      playersPerTeam === 2 &&
      teamAPlayers.length === 2 &&
      teamBPlayers.length === 2 &&
      !canPlayerGroupsOpponents(teamAPlayers, teamBPlayers, {
        allowAdjacent: allowAdjacentSkillMixing,
      })

    const selectPrompt =
      playersPerTeam === 1 ? 'Select a player' : 'Select two players'

    const nextErrors = {
      teamA: filteredA.length === playersPerTeam ? '' : selectPrompt,
      teamB: filteredB.length === playersPerTeam ? '' : selectPrompt,
      duplicate: hasDuplicates ? 'Players can only appear once' : '',
      skillGroup: teamsCannotPlay
        ? allowAdjacentSkillMixing
          ? 'Beginner/Novice teams cannot play Intermediate/Advanced teams'
          : 'Teams must be the same skill level'
        : '',
    }
    setErrors(nextErrors)

    if (
      nextErrors.teamA ||
      nextErrors.teamB ||
      nextErrors.duplicate ||
      nextErrors.skillGroup
    ) {
      return
    }

    onSubmit({
      courtIndex,
      teamAIds: filteredA,
      teamBIds: filteredB,
    })
  }

  if (!isOpen) return null

  const courtLabel = typeof courtIndex === 'number' ? `Court ${courtIndex + 1}` : 'Court'

  const renderSelect = (team, slot) => {
    const ids = team === 'A' ? teamAIds : teamBIds
    const currentId = ids[slot]
    const available = getAvailable(currentId)
    const labelOffset = team === 'A' ? 0 : playersPerTeam
    const label = `Player ${labelOffset + slot + 1}`

    return (
      <select
        value={currentId}
        onChange={(e) => handleSelect(team, slot, e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
      >
        <option value="">{label}</option>
        {available.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Edit {courtLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-600">Team A</h3>
            <div className="space-y-2">
              {Array.from({ length: playersPerTeam }, (_, slot) => (
                <React.Fragment key={`A-${slot}`}>
                  {renderSelect('A', slot)}
                </React.Fragment>
              ))}
            </div>
            {errors.teamA && (
              <p className="mt-1 text-xs text-red-500">{errors.teamA}</p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-600">Team B</h3>
            <div className="space-y-2">
              {Array.from({ length: playersPerTeam }, (_, slot) => (
                <React.Fragment key={`B-${slot}`}>
                  {renderSelect('B', slot)}
                </React.Fragment>
              ))}
            </div>
            {errors.teamB && (
              <p className="mt-1 text-xs text-red-500">{errors.teamB}</p>
            )}
          </div>

          {errors.duplicate ? (
            <p className="text-xs text-red-500">{errors.duplicate}</p>
          ) : null}
          {errors.skillGroup ? (
            <p className="text-xs text-red-500">{errors.skillGroup}</p>
          ) : null}

          <p className="text-xs text-slate-400">
            Only checked-in players are available.
          </p>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Update court
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
